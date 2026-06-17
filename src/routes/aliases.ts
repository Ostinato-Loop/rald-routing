// RALD Routing — Alias Registry (Internal)
// Supabase-backed alias store for the identity provisioning chain.
// The ALIA resolution-engine is the production resolver; this acts as
// the authoritative write-path and read fallback before ECS is live.
//
// POST /internal/aliases/provision   — machine-auth only
// GET  /aliases/:alias               — public read (normalised)
// LILCKY STUDIO LIMITED

import { Hono }             from "hono";
import { createClient }     from "@supabase/supabase-js";
import type { Bindings }    from "../index";

const aliases = new Hono<{ Bindings: Bindings }>();

// ── Supabase helper ───────────────────────────────────────────────────────────
function db(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function bearerToken(auth?: string) {
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function verifyMachineJwt(token: string, secret: string): Promise<boolean> {
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    if (payload.scope !== "events:write" && payload.type !== "machine") return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const [hdr, pay, sig] = token.split(".");
    const data = new TextEncoder().encode(`${hdr}.${pay}`);
    const sigBuf = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sigBuf, data);
  } catch { return false; }
}

// ── POST /internal/aliases/provision ─────────────────────────────────────────
aliases.post("/internal/aliases/provision", async (c) => {
  // Accept X-Internal-Secret (from event bus) OR machine JWT
  const internalSecret = c.req.header("X-Internal-Secret");
  const machineToken   = bearerToken(c.req.header("Authorization"));
  const secretOk  = internalSecret && c.env.MACHINE_JWT_SECRET && internalSecret === c.env.MACHINE_JWT_SECRET;
  const jwtOk     = machineToken ? await verifyMachineJwt(machineToken, c.env.MACHINE_JWT_SECRET) : false;

  if (!secretOk && !jwtOk) {
    return c.json({ error: "Forbidden", code: "UNAUTHORIZED" }, 403);
  }

  const body = await c.req.json<{
    user_id:      string;
    rald_id:      string;
    display_name?: string;
    country?:     string;
  }>().catch(() => null);

  if (!body?.user_id || !body?.rald_id) {
    return c.json({ error: "user_id and rald_id are required", code: "MISSING_FIELDS" }, 400);
  }

  const alias      = `${body.rald_id}@rald`;
  const supabase   = db(c.env);

  // Idempotency
  const { data: existing } = await supabase
    .from("rald_alias_registry")
    .select("alias")
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (existing) {
    return c.json({ ok: true, alias: existing.alias, user_id: body.user_id, idempotent: true });
  }

  // Check alias uniqueness
  const { data: taken } = await supabase
    .from("rald_alias_registry")
    .select("alias")
    .eq("alias", alias)
    .maybeSingle();

  if (taken) {
    return c.json({ error: `Alias ${alias} is already taken`, code: "ALIAS_TAKEN" }, 409);
  }

  const { error } = await supabase.from("rald_alias_registry").insert({
    alias,
    rald_id:      body.rald_id,
    user_id:      body.user_id,
    display_name: body.display_name ?? null,
    country:      body.country ?? null,
    verified:     false,
    active:       true,
    created_at:   new Date().toISOString(),
  });

  if (error) {
    console.error("[aliases/provision]", error.message);
    return c.json({ error: "Failed to register alias", code: "DB_ERROR" }, 500);
  }

  return c.json({
    ok:         true,
    alias,
    rald_id:    body.rald_id,
    user_id:    body.user_id,
    idempotent: false,
  }, 201);
});

// ── GET /aliases/:alias — public alias lookup ─────────────────────────────────
aliases.get("/aliases/:alias", async (c) => {
  const raw      = decodeURIComponent(c.req.param("alias")).toLowerCase().trim();
  const alias    = raw.includes("@") ? raw : `${raw}@rald`;
  const supabase = db(c.env);

  const { data } = await supabase
    .from("rald_alias_registry")
    .select("alias,rald_id,user_id,display_name,country,verified,active")
    .eq("alias", alias)
    .eq("active", true)
    .maybeSingle();

  if (!data) {
    return c.json({ alias, exists: false, verified: false });
  }

  return c.json({
    alias:        data.alias,
    rald_id:      data.rald_id,
    user_id:      data.user_id,
    display_name: data.display_name,
    country:      data.country,
    verified:     data.verified,
    exists:       true,
  });
});

export default aliases;
