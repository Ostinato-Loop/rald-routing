// RALD Routing — Core ALIA routing algorithm
// Implements the 6-step selection from ALIA/ALIA_ROUTING_ENGINE.md.
// LILCKY STUDIO LIMITED

import type { JwtPayload }  from "./auth";
import type { ALIAInstance } from "./instances";
import { getInstances }      from "./instances";
import { classifyIntent, type IntentResult } from "./intent";
import { hasConsent, type ConsentStore }     from "./consent";

export interface RouteRequest {
  input:    string;
  country?: string | null;
  app_id?:  string | null;
  context?: Record<string, unknown>;
}

export interface RouteResult {
  instance:   ALIAInstance;
  intent:     IntentResult;
  reasoning:  string[];
  fallback:   boolean;
}

export async function route(
  req:     RouteRequest,
  user:    JwtPayload,
  consent: ConsentStore
): Promise<RouteResult> {
  const instances = getInstances();
  const country   = (req.country ?? user.country ?? "NG") as string;
  const trustScore = user.trust_score ?? 0;
  const userId     = user.id;
  const appId      = req.app_id ?? "alia";
  const reasoning: string[] = [];

  // ── Step 1: Classify intent ────────────────────────────────────────────────
  const intent = classifyIntent(req.input);
  reasoning.push(`Intent: ${intent.domains.join(", ")} (${intent.type}, confidence: ${intent.confidence})`);

  // ── Step 2: Filter by geography ────────────────────────────────────────────
  let pool = instances.filter(i =>
    i.geographic.includes("ALL") || i.geographic.includes(country)
  );
  reasoning.push(`Geo filter (${country}): ${pool.length} instances`);

  // ── Step 3: Trust gate ─────────────────────────────────────────────────────
  pool = pool.filter(i => trustScore >= i.trust_minimum);
  reasoning.push(`Trust gate (score=${trustScore}): ${pool.length} instances`);

  // ── Step 4: Consent check ──────────────────────────────────────────────────
  const consentResults = await Promise.all(
    pool.map(async i => {
      const { granted } = await hasConsent(consent, userId, appId, i.consent_scopes);
      return { instance: i, granted };
    })
  );
  pool = consentResults.filter(r => r.granted).map(r => r.instance);
  reasoning.push(`Consent check: ${pool.length} instances passed`);

  // ── Step 5: Score ──────────────────────────────────────────────────────────
  const scored = pool.map(i => ({
    instance: i,
    score:    scoreInstance(i, intent, country),
  })).sort((a, b) => b.score - a.score);

  // ── Step 6: Select best match or fallback ──────────────────────────────────
  const fallback = scored.length === 0;
  const selected = scored[0]?.instance
    ?? instances.find(i => i.id === "ng-general")
    ?? instances[0]!;

  reasoning.push(
    fallback
      ? `No match — using fallback: ${selected.id}`
      : `Selected: ${selected.id} (score=${scored[0]!.score.toFixed(2)})`
  );

  return { instance: selected, intent, reasoning, fallback };
}

function scoreInstance(
  instance: ALIAInstance,
  intent:   IntentResult,
  country:  string
): number {
  let score = 0;

  // Domain match: +3 per matching domain keyword
  const domainOverlap = intent.domains.filter(d =>
    instance.domains.some(id => id.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(id.toLowerCase()))
  );
  score += domainOverlap.length * 3;

  // Intent type match: +2 if instance type aligns
  if (instance.type === intent.type) score += 2;

  // Country-specific boost: +4 for exact geo match (not "ALL")
  if (!instance.geographic.includes("ALL") && instance.geographic.includes(country)) score += 4;

  // Confidence multiplier
  if (intent.confidence === "high")   score *= 1.2;
  if (intent.confidence === "medium") score *= 1.0;
  if (intent.confidence === "low")    score *= 0.8;

  // Priority tie-breaker: lower priority number = better
  score -= instance.priority * 0.1;

  return score;
}
