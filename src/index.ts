// RALD Routing — ALIA Gateway Worker
// Phase 6 / RALD Ecosystem Finalization Program
// Routes requests to the correct ALIA instance based on identity, trust, consent, and intent.
// LILCKY STUDIO LIMITED

import { Hono }             from "hono";
import { cors }             from "hono/cors";
import { verifyJwt, bearerToken } from "./lib/auth";
import { route }            from "./lib/router";
import { getInstances, getInstanceById } from "./lib/instances";
import { writeRoutingAudit, sha256hex }  from "./lib/audit";

export interface Bindings {
  RALD_JWT_SECRET:          string;
  SUPABASE_URL:             string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ENVIRONMENT?:             string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({
  origin:      ["https://loop.rald.cloud", "https://messenger.rald.cloud", "https://profiles.rald.cloud", "https://api.rald.cloud", "https://auth.rald.cloud"],
  credentials: true,
}));

// ── GET /health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({
  ok:          true,
  service:     "rald-routing",
  version:     "1.0.0",
  environment: c.env.ENVIRONMENT ?? "production",
  instances:   getInstances().length,
  timestamp:   new Date().toISOString(),
}));

// ── GET /alia/registry — list all active ALIA instances ────────────────────────
app.get("/alia/registry", (c) => {
  const instances = getInstances().map(i => ({
    id:           i.id,
    name:         i.name,
    type:         i.type,
    geographic:   i.geographic,
    domains:      i.domains,
    capabilities: i.capabilities,
    trust_minimum: i.trust_minimum,
    endpoint:     i.endpoint,
    priority:     i.priority,
  }));
  return c.json({ instances, count: instances.length, timestamp: new Date().toISOString() });
});

// ── POST /alia/route — main routing endpoint ───────────────────────────────────
app.post("/alia/route", async (c) => {
  const start = Date.now();
  const ip    = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Authorization: Bearer <token> required", code: "MISSING_TOKEN" }, 401);
  }

  const user = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!user) {
    return c.json({ error: "Invalid or expired RALD token", code: "INVALID_TOKEN" }, 401);
  }

  // ── 2. Identity state check ────────────────────────────────────────────────
  // JWT trust_level acts as the signal — SUSPENDED/DELETED accounts can't get here
  // if auth.rald.cloud is doing its job, but we double-check trust_score is present.
  if (typeof user.trust_score !== "number") {
    return c.json({ error: "Token missing trust claims — please re-authenticate", code: "STALE_TOKEN" }, 401);
  }

  // ── 3. Parse request body ─────────────────────────────────────────────────
  const body = await c.req.json<{
    input?:    string;
    country?:  string;
    app_id?:   string;
    context?:  Record<string, unknown>;
  }>().catch(() => null);

  if (!body?.input?.trim()) {
    return c.json({ error: "input (string) is required", code: "MISSING_INPUT" }, 400);
  }

  // ── 4. Route ───────────────────────────────────────────────────────────────
  const consentStore = {
    url:    c.env.SUPABASE_URL ?? "https://onxdcikfttdmnhofsuwo.supabase.co",
    svcKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const result = await route(
    {
      input:   body.input.trim(),
      country: body.country ?? null,
      app_id:  body.app_id  ?? null,
      context: body.context ?? {},
    },
    user,
    consentStore
  );

  const latency = Date.now() - start;

  // ── 5. Audit (non-blocking) ────────────────────────────────────────────────
  const inputHash = await sha256hex(body.input.trim()).catch(() => null);
  c.executionCtx.waitUntil(
    writeRoutingAudit(
      c.env.SUPABASE_URL ?? "https://onxdcikfttdmnhofsuwo.supabase.co",
      c.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        user_id:     user.id,
        action:      "alia_route",
        instance_id: result.instance.id,
        input_hash:  inputHash,
        intent:      result.intent.domains.join(","),
        reasoning:   result.reasoning,
        fallback:    result.fallback,
        latency_ms:  latency,
        ip,
      }
    )
  );

  // ── 6. Respond ─────────────────────────────────────────────────────────────
  return c.json({
    ok:       true,
    instance: {
      id:           result.instance.id,
      name:         result.instance.name,
      type:         result.instance.type,
      endpoint:     result.instance.endpoint,
      capabilities: result.instance.capabilities,
      languages:    result.instance.languages,
    },
    intent: {
      domains:    result.intent.domains,
      type:       result.intent.type,
      confidence: result.intent.confidence,
      keywords:   result.intent.keywords,
    },
    reasoning:  result.reasoning,
    fallback:   result.fallback,
    user: {
      id:          user.id,
      trust_score: user.trust_score,
      trust_level: user.trust_level,
      country:     (user as Record<string, unknown>).country ?? null,
    },
    latency_ms: latency,
  });
});

// ── POST /alia/route/dry — route without side effects (debug) ─────────────────
app.post("/alia/route/dry", async (c) => {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) return c.json({ error: "Authorization: Bearer <token> required" }, 401);
  const user = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!user) return c.json({ error: "Invalid or expired token" }, 401);

  const body = await c.req.json<{ input?: string; country?: string; app_id?: string }>().catch(() => null);
  if (!body?.input?.trim()) return c.json({ error: "input required" }, 400);

  const result = await route(
    { input: body.input.trim(), country: body.country ?? null, app_id: body.app_id ?? null },
    user,
    { url: c.env.SUPABASE_URL ?? "https://onxdcikfttdmnhofsuwo.supabase.co", svcKey: c.env.SUPABASE_SERVICE_ROLE_KEY }
  );

  return c.json({
    dry_run:    true,
    instance:   result.instance.id,
    endpoint:   result.instance.endpoint,
    intent:     result.intent,
    reasoning:  result.reasoning,
    fallback:   result.fallback,
  });
});

// ── GET /alia/instance/:id ─────────────────────────────────────────────────────
app.get("/alia/instance/:id", (c) => {
  const inst = getInstanceById(c.req.param("id"));
  if (!inst) return c.json({ error: "Instance not found" }, 404);
  return c.json(inst);
});

export default app;
