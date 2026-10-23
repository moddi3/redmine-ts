// Everything the authorization server hands out is sealed, so it keeps no store: AES-256-GCM under a
// key derived with HKDF from the server secret, one key per purpose, with the issuer as associated
// data. A value sealed for one purpose or one issuer never opens as another. WebCrypto only, the same
// on Node, Bun and Workers.

/** What a sealed value is for. A code never opens as a token, nor a registration as a state. */
export type Purpose =
  | "registration"
  | "browser"
  | "consent"
  | "state"
  | "code"
  | "access"
  | "refresh";

export interface Sealer {
  /** Seals `payload`, which then expires after `ttlSeconds` when given. */
  seal(purpose: Purpose, payload: object, ttlSeconds?: number): Promise<string>;
  /** The payload, or undefined when the value is forged, sealed for another purpose, or expired. */
  open<T extends object>(
    purpose: Purpose,
    sealed: string,
  ): Promise<(T & { exp?: number }) | undefined>;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const encoder = new TextEncoder();

/** The secret must carry at least 256 bits, written as 32 characters or more. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Seals with the first secret and opens with any of them, so a rotation lists the new secret first
 * and the old one after it until what the old one sealed has expired.
 */
export function createSealer(secrets: readonly string[], issuer: string): Sealer {
  const aad = encoder.encode(issuer);
  const keys = new Map<Purpose, Promise<CryptoKey[]>>();
  const keysFor = (purpose: Purpose): Promise<CryptoKey[]> => {
    let derived = keys.get(purpose);
    if (derived === undefined) {
      derived = Promise.all(secrets.map((secret) => deriveKey(secret, purpose)));
      keys.set(purpose, derived);
    }
    return derived;
  };
  return {
    async seal(purpose, payload, ttlSeconds) {
      const [key] = await keysFor(purpose);
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const body = ttlSeconds === undefined ? payload : { ...payload, exp: now() + ttlSeconds };
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        key!,
        encoder.encode(JSON.stringify(body)),
      );
      return base64url(concat(iv, new Uint8Array(sealed)));
    },
    async open<T extends object>(purpose: Purpose, sealed: string) {
      const bytes = fromBase64url(sealed);
      if (bytes === undefined || bytes.length < IV_BYTES + TAG_BYTES) return undefined;
      const iv = bytes.subarray(0, IV_BYTES);
      for (const key of await keysFor(purpose)) {
        let plain: ArrayBuffer;
        try {
          plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv, additionalData: aad },
            key,
            bytes.subarray(IV_BYTES),
          );
        } catch {
          continue;
        }
        const payload = JSON.parse(new TextDecoder().decode(plain)) as T & { exp?: number };
        return payload.exp === undefined || payload.exp > now() ? payload : undefined;
      }
      return undefined;
    },
  };
}

async function deriveKey(secret: string, purpose: Purpose): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("@redmine-ts/mcp"),
      info: encoder.encode(`oauth ${purpose}`),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Seconds since the epoch, the unit of `exp` and of OAuth lifetimes. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** 32 random bytes, base64url: a PKCE verifier, a nonce, a replay id. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The PKCE S256 challenge of `verifier`, or the SHA-256 of any text, base64url. */
export async function sha256(text: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[\w-]*$/.test(text)) return undefined;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}
