// Client authentication with a signed JWT, as RFC 7523 section 2.2 defines it, for clients whose
// metadata document declares private_key_jwt. jose checks the signature and the registered claims
// with WebCrypto, the same on Node, Bun and Workers.

import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, errors, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { now } from "./seal.ts";

export const JWT_BEARER = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export const SIGNING_ALGS = ["RS256", "PS256", "ES256"] as const;
export type SigningAlg = (typeof SIGNING_ALGS)[number];

/** Clock skew allowed on exp, nbf and iat, in seconds. */
const CLOCK_TOLERANCE = 60;
/** An assertion is made for one request; RFC 7523 lets the server refuse one that lasts long. */
const MAX_LIFETIME = 3600;

export function isSigningAlg(alg: unknown): alg is SigningAlg {
  return (SIGNING_ALGS as readonly unknown[]).includes(alg);
}

/** A verified assertion's jti, and how many seconds it must stay used: until exp, plus the tolerance. */
export interface Verified {
  jti: string;
  ttl: number;
}

/** What an assertion claims, read without checking it: the client it names, and the kid of its key. */
export function peek(assertion: string): { sub: unknown; kid: unknown } | undefined {
  try {
    return { sub: decodeJwt(assertion).sub, kid: decodeProtectedHeader(assertion).kid };
  } catch {
    return undefined;
  }
}

/**
 * Checks a client_assertion from `clientId`: signed by one of `keys` with an allowed alg, issued by
 * and about the client, meant for this server, and in its time. The answer for one that fails names
 * the check, never the assertion.
 */
export async function verifyAssertion(
  assertion: string,
  check: {
    clientId: string;
    keys: JSONWebKeySet;
    alg: SigningAlg | undefined;
    audiences: readonly string[];
  },
): Promise<Verified | { refused: string }> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(assertion, createLocalJWKSet(check.keys), {
      algorithms: check.alg === undefined ? [...SIGNING_ALGS] : [check.alg],
      issuer: check.clientId,
      subject: check.clientId,
      audience: [...check.audiences],
      requiredClaims: ["exp", "jti"],
      clockTolerance: CLOCK_TOLERANCE,
    }));
  } catch (error) {
    return { refused: failure(error) };
  }
  const at = now();
  const exp = payload.exp!;
  if (exp > at + MAX_LIFETIME + CLOCK_TOLERANCE) {
    return { refused: "the client_assertion's exp is more than an hour away" };
  }
  if (payload.iat !== undefined && payload.iat > at + CLOCK_TOLERANCE) {
    return { refused: "the client_assertion's iat is in the future" };
  }
  if (typeof payload.jti !== "string" || payload.jti === "") {
    return { refused: "the client_assertion's jti is not a string" };
  }
  return { jti: payload.jti, ttl: Math.ceil(exp - at) + CLOCK_TOLERANCE };
}

const CLAIM_CHECKS: Record<string, string> = {
  iss: "the client_assertion's iss is not the client_id",
  sub: "the client_assertion's sub is not the client_id",
  aud: "the client_assertion's aud names neither this server's issuer nor its token endpoint",
  nbf: "the client_assertion's nbf is in the future",
};

const FAILURES: Record<string, string> = {
  [errors.JWTExpired.code]: "the client_assertion's exp has passed",
  [errors.JOSEAlgNotAllowed.code]: "the client_assertion's alg is not one the client signs with",
  [errors.JWKSNoMatchingKey.code]:
    "no key in the client's key set matches the client_assertion's kid and alg",
  [errors.JWKSMultipleMatchingKeys.code]:
    "the client_assertion names no kid, and several of the client's keys match",
  [errors.JWSSignatureVerificationFailed.code]: "the client_assertion's signature does not verify",
  [errors.JWKSInvalid.code]: "the client's key set holds a key that is not a public key",
};

function failure(error: unknown): string {
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.reason === "missing") return `the client_assertion has no ${error.claim}`;
    if (error.reason === "invalid") return `the client_assertion's ${error.claim} is not a number`;
    return CLAIM_CHECKS[error.claim] ?? `the client_assertion's ${error.claim} is refused`;
  }
  if (error instanceof errors.JOSEError) {
    return FAILURES[error.code] ?? "the client_assertion is not a signed JWT this server can check";
  }
  // jose throws a TypeError for an RSA key under 2048 bits, and WebCrypto for a malformed key.
  return "the key the client_assertion names is unusable, such as an RSA key under 2048 bits";
}
