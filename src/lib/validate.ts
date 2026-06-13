// RALD Routing — Alias format validation and normalisation
// Supports the four ALIA alias types: email, phone (E.164), username, business handle.
// LILCKY STUDIO LIMITED

export type AliasType = "email" | "phone" | "username" | "handle";

export interface ParsedAlias {
  raw:        string;
  normalised: string;
  type:       AliasType;
}

export interface AliasParseError {
  error: string;
  code:  "INVALID_ALIAS" | "UNSUPPORTED_FORMAT";
}

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE    = /^\+[1-9]\d{6,14}$/;           // E.164 strict
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/i;
const HANDLE_RE   = /^@[a-z0-9][a-z0-9._-]{1,29}$/i;

export function parseAlias(raw: string): ParsedAlias | AliasParseError {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { error: "alias must not be empty", code: "INVALID_ALIAS" };
  }
  if (trimmed.length > 128) {
    return { error: "alias exceeds 128 characters", code: "INVALID_ALIAS" };
  }

  // Email
  if (EMAIL_RE.test(trimmed)) {
    return { raw: trimmed, normalised: trimmed.toLowerCase(), type: "email" };
  }

  // Phone (E.164) — must start with +
  if (trimmed.startsWith("+")) {
    if (!PHONE_RE.test(trimmed)) {
      return { error: "phone must be in E.164 format: +2348012345678", code: "INVALID_ALIAS" };
    }
    return { raw: trimmed, normalised: trimmed, type: "phone" };
  }

  // Business handle (prefixed with @)
  if (trimmed.startsWith("@")) {
    if (!HANDLE_RE.test(trimmed)) {
      return { error: "business handle must match @[a-z0-9._-]{2,30}", code: "INVALID_ALIAS" };
    }
    return { raw: trimmed, normalised: trimmed.toLowerCase(), type: "handle" };
  }

  // Username (bare word, no prefix)
  if (USERNAME_RE.test(trimmed)) {
    return { raw: trimmed, normalised: trimmed.toLowerCase(), type: "username" };
  }

  return {
    error: `unrecognised alias format: "${trimmed}" — expected email, +E.164 phone, @handle, or username`,
    code:  "UNSUPPORTED_FORMAT",
  };
}

export function isAliasParseError(r: ParsedAlias | AliasParseError): r is AliasParseError {
  return "error" in r;
}
