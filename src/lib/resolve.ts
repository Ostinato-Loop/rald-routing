// RALD Routing — Resolution Engine client
// Calls the ALIA resolution-engine on ECS (via ALB) to resolve an alias
// into a one-time routing token. Uses a machine JWT for authentication.
// LILCKY STUDIO LIMITED

import { signMachineJwt }  from "./machine-jwt";
import type { ParsedAlias } from "./validate";
import type { JwtPayload }  from "./auth";

export type ResolvePurpose = "payment" | "verification" | "directory" | "mandate";

export interface ResolveRequest {
  alias:       ParsedAlias;
  purpose:     ResolvePurpose;
  country?:    string | null;
  currency?:   string | null;
  amount?:     number | null;
  requestingUser: {
    id:          string;
    trust_score: number;
    trust_level: string;
    country?:    string | null;
  };
}

export interface RoutingToken {
  token:            string;         // rt_<ulid> — one-time use
  institution_id:   string;
  institution_name: string;
  institution_type: string;         // commercial_bank | microfinance | fintech | mobile_money | psb
  country:          string;
  currency:         string;
  expires_at:       string;         // ISO-8601, typically 5 minutes from now
}

export interface AliasResolution {
  alias: {
    value:    string;
    type:     string;
    verified: boolean;
  };
  subject: {
    display_name: string | null;
    country:      string;
  };
  routing:  RoutingToken;
  trust: {
    score:     number;
    level:     string;
    kyc_tier:  number;
  };
  consent: {
    granted: boolean;
    scopes:  string[];
  };
}

export interface ResolutionError {
  code:    string;
  message: string;
  status:  number;
}

export type ResolveResult =
  | { ok: true;  resolution: AliasResolution; latency_ms: number }
  | { ok: false; error: ResolutionError;      latency_ms: number };

/**
 * Preview: public directory look-up — returns whether the alias exists and
 * basic public profile (display_name, country, verified flag).
 * Does NOT return any routing token. No auth required at resolution-engine
 * for this endpoint, but we still sign with machine JWT for audit.
 */
export interface AliasPreview {
  alias:    string;
  type:     string;
  exists:   boolean;
  verified: boolean;
  country?: string;
  display_name?: string | null;
}

export async function resolveAlias(
  engineUrl:  string,
  machineJwt: string,
  req:        ResolveRequest
): Promise<ResolveResult> {
  const start = Date.now();

  try {
    const res = await fetch(`${engineUrl}/v1/resolve`, {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "Authorization":        `Bearer ${machineJwt}`,
        "X-Requesting-Service": "rald-routing",
        "X-CF-Worker":          "1",
      },
      body: JSON.stringify({
        alias:    req.alias.normalised,
        type:     req.alias.type,
        purpose:  req.purpose,
        country:  req.country  ?? req.requestingUser.country ?? null,
        currency: req.currency ?? null,
        amount:   req.amount   ?? null,
        requesting_user: {
          id:          req.requestingUser.id,
          trust_score: req.requestingUser.trust_score,
          trust_level: req.requestingUser.trust_level,
          country:     req.requestingUser.country ?? null,
        },
      }),
    });

    const latency_ms = Date.now() - start;
    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return {
        ok:         false,
        latency_ms,
        error: {
          code:    (body.code as string) ?? `ENGINE_${res.status}`,
          message: (body.message as string) ?? `Resolution engine error: HTTP ${res.status}`,
          status:  res.status,
        },
      };
    }

    return {
      ok:         true,
      latency_ms,
      resolution: body as unknown as AliasResolution,
    };

  } catch (err) {
    return {
      ok:         false,
      latency_ms: Date.now() - start,
      error: {
        code:    "ENGINE_UNAVAILABLE",
        message: "Resolution engine unreachable — please retry",
        status:  503,
      },
    };
  }
}

export async function previewAlias(
  engineUrl:  string,
  machineJwt: string,
  alias:      ParsedAlias
): Promise<AliasPreview | null> {
  try {
    const res = await fetch(
      `${engineUrl}/v1/directory/preview?alias=${encodeURIComponent(alias.normalised)}&type=${alias.type}`,
      {
        headers: {
          "Authorization":        `Bearer ${machineJwt}`,
          "X-Requesting-Service": "rald-routing",
        },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as AliasPreview;
  } catch {
    return null;
  }
}
