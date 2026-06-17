// RALD Routing — Machine-to-machine JWT signing
// Signs short-lived (30s) JWTs for rald-routing → ALIA service calls.
// LILCKY STUDIO LIMITED

export interface MachinePayload {
  sub:     string;
  role:    "machine";
  service: string;
  iss:     string;
  iat:     number;
  exp:     number;
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

export async function signMachineJwt(secret: string): Promise<string> {
  const header  = base64urlStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = base64urlStr(JSON.stringify({
    sub:     "rald-routing",
    role:    "machine",
    service: "rald-routing",
    iss:     "rald-routing.rald.cloud",
    iat:     now,
    exp:     now + 30,
  } satisfies MachinePayload));

  const signing = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing));
  const sig    = base64url(sigBuf);

  return `${header}.${payload}.${sig}`;
}
