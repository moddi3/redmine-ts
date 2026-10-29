// Reads the JSON that `vp lint -f json` prints.

export interface Diagnostic {
  rule: string;
  severity: string;
  message: string;
  file: string;
  line: number;
}

interface RawDiagnostic {
  code?: string;
  severity: string;
  message: string;
  filename: string;
  labels: { span: { line: number } }[];
}

export function parseDiagnostics(output: string): Diagnostic[] {
  const parsed: unknown = JSON.parse(output);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("diagnostics" in parsed) ||
    !Array.isArray(parsed.diagnostics)
  ) {
    throw new Error(`oxlint printed no diagnostics list: ${output.slice(0, 200)}`);
  }
  return parsed.diagnostics.map((raw: RawDiagnostic) => ({
    rule: raw.code ?? "unknown",
    severity: raw.severity,
    message: raw.message.replace(/\s+/g, " "),
    file: raw.filename,
    line: raw.labels[0]?.span.line ?? 0,
  }));
}
