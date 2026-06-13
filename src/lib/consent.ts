// RALD Routing — Consent gate (Phase 8 / ALIA Consent Engine)
// Checks auth_consent_grants in Supabase before routing to an ALIA instance.
// Falls back to ALLOW if DB is unavailable (availability > perfect enforcement at routing layer).
// Hard enforcement happens at the ALIA instance itself.
// LILCKY STUDIO LIMITED

export interface ConsentStore {
  url:     string;
  svcKey:  string;
}

export async function hasConsent(
  store:    ConsentStore,
  userId:   string,
  appId:    string,
  scopes:   string[]
): Promise<{ granted: boolean; missing: string[] }> {
  if (!scopes.length) return { granted: true, missing: [] };

  try {
    const url = `${store.url}/rest/v1/auth_consent_grants` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&app_id=eq.${encodeURIComponent(appId)}` +
      `&revoked_at=is.null` +
      `&select=scopes,expires_at`;

    const res = await fetch(url, {
      headers: {
        apikey:        store.svcKey,
        Authorization: `Bearer ${store.svcKey}`,
        Accept:        "application/json",
      },
    });

    if (!res.ok) {
      console.warn("[rald-routing] consent DB unreachable — allowing (fail-open):", res.status);
      return { granted: true, missing: [] };
    }

    const rows = (await res.json()) as Array<{ scopes: string[]; expires_at: string | null }>;
    const now  = Date.now();

    // Collect all granted scope strings from non-expired grants
    const grantedScopes = new Set<string>();
    for (const row of rows) {
      if (row.expires_at && new Date(row.expires_at).getTime() < now) continue;
      for (const s of row.scopes ?? []) grantedScopes.add(s);
    }

    const missing = scopes.filter(s => !grantedScopes.has(s));
    return { granted: missing.length === 0, missing };
  } catch (err) {
    console.warn("[rald-routing] consent check threw — allowing (fail-open):", String(err));
    return { granted: true, missing: [] };
  }
}
