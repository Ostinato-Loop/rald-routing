// RALD Routing — ALIA Gateway Worker
// Phase 6 / RALD Ecosystem Finalization Program  ·  P2: Resolution Engine
// Routes requests to the correct ALIA instance based on identity, trust,
// consent, and intent — AND resolves aliases to one-time routing tokens.
// LILCKY STUDIO LIMITED

import { Hono }                                from "hono";
import { cors }                                from "hono/cors";
import { verifyJwt, bearerToken }              from "./lib/auth";
import { route }                               from "./lib/router";
import { getInstances, getInstanceById }       from "./lib/instances";
import { writeRoutingAudit, sha256hex }        from "./lib/audit";
import { signMachineJwt }                      from "./lib/machine-jwt";
import { parseAlias, isAliasParseError }       from "./lib/validate";
import { resolveAlias, previewAlias }          from "./lib/resolve";
import type { ResolvePurpose }                 from "./lib/resolve";

export interface Bindings {
  // User-facing auth
  RALD_JWT_SECRET:           string;
  // Supabase (consent checks + audit log)
  SUPABASE_URL:              string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Machine identity (service-to-service)
  MACHINE_JWT_SECRET:        string;
  // ALIA backend (resolution-engine via ALB)
  ALIA_RESOLUTION_ENGINE_URL: string;
  // Environment
  ENVIRONMENT?:              string;
}

const app = new Hono<{ Bindings: Bindings }>();

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use("*", cors({
  origin:      [
    "https://loop.rald.cloud",
    "https://messenger.rald.cloud",
    "https://profiles.rald.cloud",
    "https://api.rald.cloud",
    "https://auth.rald.cloud",
    "https://pay.rald.cloud",
  ],
  credentials: true,
}));

// ── GET /health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({
  ok:          true,
  service:     "rald-routing",
  version:     "2.0.0",
  environment: c.env.ENVIRONMENT ?? "production",
  instances:   getInstances().length,
  capabilities: ["instance-routing", "alias-resolution", "directory-preview"],
  timestamp:   new Date().toISOString(),
}));

// ── GET /alia/registry ─────────────────────────────────────────────────────────
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

// ── POST /alia/route ───────────────────────────────────────────────────────────
app.post("/alia/route", async (c) => {
  const start = Date.now();
  const ip    = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;

  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Authorization: Bearer <token> required", code: "MISSING_TOKEN" }, 401);
  }
  const user = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!user) {
    return c.json({ error: "Invalid or expired RALD token", code: "INVALID_TOKEN" }, 401);
  }
  if (typeof user.trust_score !== "number") {
    return c.json({ error: "Token missing trust claims — please re-authenticate", code: "STALE_TOKEN" }, 401);
  }

  const body = await c.req.json<{
    input?:    string;
    country?:  string;
    app_id?:   string;
    context?:  Record<string, unknown>;
  }>().catch(() => null);
  if (!body?.input?.trim()) {
    return c.json({ error: "input (string) is required", code: "MISSING_INPUT" }, 400);
  }

  const consentStore = { url: c.env.SUPABASE_URL, svcKey: c.env.SUPABASE_SERVICE_ROLE_KEY };
  const result = await route(
    { input: body.input.trim(), country: body.country ?? null, app_id: body.app_id ?? null, context: body.context ?? {} },
    user,
    consentStore
  );

  const latency = Date.now() - start;
  const inputHash = await sha256hex(body.input.trim()).catch(() => null);

  c.executionCtx.waitUntil(
    writeRoutingAudit(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
      user_id:     user.id,
      action:      "alia_route",
      instance_id: result.instance.id,
      input_hash:  inputHash,
      intent:      result.intent.domains.join(","),
      reasoning:   result.reasoning,
      fallback:    result.fallback,
      latency_ms:  latency,
      ip,
    })
  );

  return c.json({
    ok: true,
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
      country:     user.country ?? null,
    },
    latency_ms: latency,
  });
});

// ── POST /alia/route/dry ────────────────────────────────────────────────────────
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
    { url: c.env.SUPABASE_URL, svcKey: c.env.SUPABASE_SERVICE_ROLE_KEY }
  );

  return c.json({
    dry_run:   true,
    instance:  result.instance.id,
    endpoint:  result.instance.endpoint,
    intent:    result.intent,
    reasoning: result.reasoning,
    fallback:  result.fallback,
  });
});

// ── GET /alia/instance/:id ─────────────────────────────────────────────────────
app.get("/alia/instance/:id", (c) => {
  const inst = getInstanceById(c.req.param("id"));
  if (!inst) return c.json({ error: "Instance not found" }, 404);
  return c.json(inst);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2 — RESOLUTION ENGINE ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── POST /resolve ──────────────────────────────────────────────────────────────
// Resolves an alias (email / +phone / username / @handle) into a one-time
// routing token backed by the ALIA resolution-engine on ECS.
//
// Request:
//   { alias: string, purpose: "payment"|"verification"|"directory"|"mandate",
//     country?: string, currency?: string, amount?: number }
//
// Response (200):
//   { ok: true, alias: {...}, routing: { token, institution, ... }, trust: {...}, consent: {...}, latency_ms }
//
// Error codes: INVALID_ALIAS, NOT_FOUND, TRUST_INSUFFICIENT,
//              CONSENT_DENIED, ENGINE_UNAVAILABLE
// ──────────────────────────────────────────────────────────────────────────────
app.post("/resolve", async (c) => {
  const start = Date.now();
  const ip    = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Authorization: Bearer <token> required", code: "MISSING_TOKEN" }, 401);
  }
  const user = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!user) {
    return c.json({ error: "Invalid or expired RALD token", code: "INVALID_TOKEN" }, 401);
  }
  if (typeof user.trust_score !== "number") {
    return c.json({ error: "Token missing trust claims — please re-authenticate", code: "STALE_TOKEN" }, 401);
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  const body = await c.req.json<{
    alias?:    string;
    purpose?:  string;
    country?:  string;
    currency?: string;
    amount?:   number;
  }>().catch(() => null);

  if (!body?.alias?.trim()) {
    return c.json({ error: "alias (string) is required", code: "MISSING_ALIAS" }, 400);
  }

  const VALID_PURPOSES: ResolvePurpose[] = ["payment", "verification", "directory", "mandate"];
  const purpose: ResolvePurpose = (
    VALID_PURPOSES.includes(body.purpose as ResolvePurpose) ? body.purpose : "payment"
  ) as ResolvePurpose;

  // ── 3. Validate and normalise alias ─────────────────────────────────────────
  const parsed = parseAlias(body.alias.trim());
  if (isAliasParseError(parsed)) {
    return c.json({
      error: parsed.error,
      code:  parsed.code,
      hint:  "Valid formats: email@domain.com  |  +2348012345678  |  username  |  @handle",
    }, 400);
  }

  // ── 4. Trust gate (minimum trust_score = 10 for resolution) ─────────────────
  const RESOLVE_TRUST_MINIMUM = 10;
  if (user.trust_score < RESOLVE_TRUST_MINIMUM) {
    return c.json({
      error: `Trust score ${user.trust_score} is below the resolution minimum of ${RESOLVE_TRUST_MINIMUM}. Complete basic verification to resolve aliases.`,
      code:  "TRUST_INSUFFICIENT",
      current_score: user.trust_score,
      required_score: RESOLVE_TRUST_MINIMUM,
    }, 403);
  }

  // ── 5. Mint machine JWT and call resolution-engine ───────────────────────────
  const engineUrl = c.env.ALIA_RESOLUTION_ENGINE_URL;
  if (!engineUrl) {
    return c.json({ error: "Resolution engine not configured", code: "ENGINE_NOT_CONFIGURED" }, 503);
  }

  const machineJwt = await signMachineJwt(c.env.MACHINE_JWT_SECRET);
  const result = await resolveAlias(engineUrl, machineJwt, {
    alias:   parsed,
    purpose,
    country:  body.country  ?? user.country ?? null,
    currency: body.currency ?? null,
    amount:   body.amount   ?? null,
    requestingUser: {
      id:          user.id,
      trust_score: user.trust_score,
      trust_level: user.trust_level,
      country:     user.country ?? null,
    },
  });

  const latency_ms = Date.now() - start;

  // ── 6. Audit (non-blocking) ──────────────────────────────────────────────────
  const aliasHash = await sha256hex(parsed.normalised).catch(() => null);
  c.executionCtx.waitUntil(
    writeRoutingAudit(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
      user_id:     user.id,
      action:      "alias_resolve",
      instance_id: null,
      input_hash:  aliasHash,
      intent:      `${parsed.type}:${purpose}`,
      reasoning:   result.ok ? ["resolution_success"] : [`resolution_failed:${result.error.code}`],
      fallback:    false,
      latency_ms,
      ip,
      metadata: {
        alias_type: parsed.type,
        purpose,
        ok:         result.ok,
        error_code: result.ok ? null : result.error.code,
      },
    })
  );

  // ── 7. Respond ───────────────────────────────────────────────────────────────
  if (!result.ok) {
    const { error } = result;
    return c.json({
      ok:      false,
      error:   error.message,
      code:    error.code,
    }, error.status as 400 | 403 | 404 | 503);
  }

  const { resolution } = result;
  return c.json({
    ok: true,
    alias:      resolution.alias,
    subject:    resolution.subject,
    routing:    resolution.routing,
    trust:      resolution.trust,
    consent:    resolution.consent,
    requesting_user: {
      id:          user.id,
      trust_score: user.trust_score,
      trust_level: user.trust_level,
    },
    latency_ms,
  });
});

// ── GET /resolve/preview ───────────────────────────────────────────────────────
// Public alias directory preview — confirms whether an alias exists and
// returns safe public data (display_name, country, verified flag).
// Does NOT return routing tokens. Auth optional but encouraged for rate limits.
// Used by payment UIs to confirm recipient before sending.
// ──────────────────────────────────────────────────────────────────────────────
app.get("/resolve/preview", async (c) => {
  const raw = c.req.query("alias");
  if (!raw?.trim()) {
    return c.json({ error: "alias query parameter is required", code: "MISSING_ALIAS" }, 400);
  }

  const parsed = parseAlias(raw.trim());
  if (isAliasParseError(parsed)) {
    return c.json({ error: parsed.error, code: parsed.code }, 400);
  }

  const engineUrl = c.env.ALIA_RESOLUTION_ENGINE_URL;
  if (!engineUrl) {
    return c.json({ error: "Directory service not configured", code: "ENGINE_NOT_CONFIGURED" }, 503);
  }

  const machineJwt = await signMachineJwt(c.env.MACHINE_JWT_SECRET);
  const preview    = await previewAlias(engineUrl, machineJwt, parsed);

  if (!preview) {
    // Engine returned non-200 or threw — treat as not-found for privacy
    return c.json({ alias: parsed.normalised, type: parsed.type, exists: false, verified: false });
  }

  return c.json({
    ...preview,
    // Hash the alias in the response to prevent trivial scraping
    // Clients who passed the alias can reconstruct it
    alias: parsed.normalised,
  });
});

// ── POST /resolve/preview ──────────────────────────────────────────────────────
// Same as GET but accepts JSON body — useful for non-GET-friendly clients
// and when sending phone numbers that may confuse URL encoding.
// ──────────────────────────────────────────────────────────────────────────────
app.post("/resolve/preview", async (c) => {
  const body = await c.req.json<{ alias?: string }>().catch(() => null);
  if (!body?.alias?.trim()) {
    return c.json({ error: "alias is required", code: "MISSING_ALIAS" }, 400);
  }

  const parsed = parseAlias(body.alias.trim());
  if (isAliasParseError(parsed)) {
    return c.json({ error: parsed.error, code: parsed.code }, 400);
  }

  const engineUrl = c.env.ALIA_RESOLUTION_ENGINE_URL;
  if (!engineUrl) {
    return c.json({ error: "Directory service not configured", code: "ENGINE_NOT_CONFIGURED" }, 503);
  }

  const machineJwt = await signMachineJwt(c.env.MACHINE_JWT_SECRET);
  const preview    = await previewAlias(engineUrl, machineJwt, parsed);

  return c.json(preview
    ? { ...preview, alias: parsed.normalised }
    : { alias: parsed.normalised, type: parsed.type, exists: false, verified: false }
  );
});

// ── GET /resolve/status ────────────────────────────────────────────────────────
// Polls resolution-engine health. Used by monitoring and the frontend to
// show a "payments available" / "payments degraded" status indicator.
// No auth required — public status endpoint.
// ──────────────────────────────────────────────────────────────────────────────
app.get("/resolve/status", async (c) => {
  const engineUrl = c.env.ALIA_RESOLUTION_ENGINE_URL;
  if (!engineUrl) {
    return c.json({ ok: false, engine: "unconfigured", latency_ms: 0 }, 200);
  }

  const start = Date.now();
  try {
    const machineJwt = await signMachineJwt(c.env.MACHINE_JWT_SECRET);
    const res = await fetch(`${engineUrl}/health`, {
      headers: { "Authorization": `Bearer ${machineJwt}`, "X-Requesting-Service": "rald-routing" },
      signal:  AbortSignal.timeout(3000),   // 3s timeout for status check
    });
    const latency_ms = Date.now() - start;
    const body       = await res.json().catch(() => ({})) as Record<string, unknown>;

    return c.json({
      ok:         res.ok,
      engine:     res.ok ? "healthy" : "degraded",
      engine_url: engineUrl.replace(/\/\/[^/]+/, "//[redacted]"),   // hide full URL
      status:     res.status,
      latency_ms,
      version:    body.version ?? null,
      environment: c.env.ENVIRONMENT ?? "production",
    });
  } catch (err) {
    return c.json({
      ok:         false,
      engine:     "unavailable",
      error:      err instanceof Error ? err.message : "timeout or network error",
      latency_ms: Date.now() - start,
    }, 200);  // always 200 — this is a status endpoint, not an error
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// End P2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default app;
