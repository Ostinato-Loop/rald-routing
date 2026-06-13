// RALD Routing — ALIA Instance Registry
// Source of truth for all routable ALIA instances.
// Matches ALIA/ALIA_ROUTING_ENGINE.md spec.
// LILCKY STUDIO LIMITED

export interface ALIAInstance {
  id:             string;
  name:           string;
  type:           "country" | "domain" | "persona" | "capability";
  geographic:     string[];
  languages:      string[];
  domains:        string[];
  capabilities:   string[];
  trust_minimum:  0 | 10 | 25 | 50 | 75;
  consent_scopes: string[];
  endpoint:       string;
  priority:       number;
  active:         boolean;
}

export const ALIA_INSTANCES: ALIAInstance[] = [
  // ── Country instances ──────────────────────────────────────────────────────
  {
    id: "ng-general", name: "Nigeria ALIA", type: "country",
    geographic: ["NG"], languages: ["en", "yo", "ha", "ig", "pcm"],
    domains: ["general"], capabilities: ["chat", "voice", "document"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/ng", priority: 10, active: true,
  },
  {
    id: "gh-general", name: "Ghana ALIA", type: "country",
    geographic: ["GH"], languages: ["en", "tw", "ee"],
    domains: ["general"], capabilities: ["chat", "voice"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/gh", priority: 10, active: true,
  },
  {
    id: "ke-general", name: "Kenya ALIA", type: "country",
    geographic: ["KE"], languages: ["en", "sw"],
    domains: ["general"], capabilities: ["chat"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/ke", priority: 10, active: true,
  },
  {
    id: "za-general", name: "South Africa ALIA", type: "country",
    geographic: ["ZA"], languages: ["en", "af", "zu", "xh"],
    domains: ["general"], capabilities: ["chat"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/za", priority: 10, active: true,
  },

  // ── Domain instances ───────────────────────────────────────────────────────
  {
    id: "finance-alia", name: "Finance ALIA", type: "domain",
    geographic: ["ALL"], languages: ["en"],
    domains: ["finance", "banking", "tax", "investment", "accounting"],
    capabilities: ["chat", "document", "deep_search"],
    trust_minimum: 10, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/finance", priority: 5, active: true,
  },
  {
    id: "legal-alia", name: "Legal ALIA", type: "domain",
    geographic: ["ALL"], languages: ["en"],
    domains: ["law", "contracts", "compliance", "rights", "legal"],
    capabilities: ["chat", "document"],
    trust_minimum: 25, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/legal", priority: 5, active: true,
  },
  {
    id: "gov-alia", name: "Government ALIA", type: "domain",
    geographic: ["ALL"], languages: ["en"],
    domains: ["government", "policy", "permits", "civic", "regulations"],
    capabilities: ["chat", "document"],
    trust_minimum: 10, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/gov", priority: 5, active: true,
  },
  {
    id: "health-alia", name: "Health ALIA", type: "domain",
    geographic: ["ALL"], languages: ["en"],
    domains: ["health", "medical", "wellness", "nutrition", "fitness"],
    capabilities: ["chat"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/health", priority: 5, active: true,
  },

  // ── Persona instances ──────────────────────────────────────────────────────
  {
    id: "coach-alia", name: "Coach ALIA", type: "persona",
    geographic: ["ALL"], languages: ["en"],
    domains: ["personal development", "productivity", "coaching", "career", "goals"],
    capabilities: ["chat", "voice"],
    trust_minimum: 0, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/coach", priority: 8, active: true,
  },
  {
    id: "business-alia", name: "Business ALIA", type: "persona",
    geographic: ["ALL"], languages: ["en"],
    domains: ["business", "sme", "entrepreneurship", "operations", "marketing", "sales"],
    capabilities: ["chat", "document", "deep_search"],
    trust_minimum: 10, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/business", priority: 6, active: true,
  },

  // ── Capability instances ────────────────────────────────────────────────────
  {
    id: "deep-alia", name: "Deep Research ALIA", type: "capability",
    geographic: ["ALL"], languages: ["en"],
    domains: ["research", "analysis", "investigation", "deep search"],
    capabilities: ["deep_search", "document", "chat"],
    trust_minimum: 50, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/deep", priority: 4, active: true,
  },
  {
    id: "code-alia", name: "Code ALIA", type: "capability",
    geographic: ["ALL"], languages: ["en"],
    domains: ["code", "programming", "software", "development", "debugging", "api"],
    capabilities: ["chat", "code"],
    trust_minimum: 10, consent_scopes: ["alia:chat", "alia:context:profile"],
    endpoint: "https://alia.rald.cloud/code", priority: 4, active: true,
  },
  {
    id: "voice-alia", name: "Voice ALIA", type: "capability",
    geographic: ["ALL"], languages: ["en"],
    domains: ["voice", "speech", "audio"],
    capabilities: ["voice", "chat"],
    trust_minimum: 0, consent_scopes: ["alia:chat"],
    endpoint: "https://alia.rald.cloud/voice", priority: 7, active: true,
  },
];

export function getInstances(): ALIAInstance[] {
  return ALIA_INSTANCES.filter(i => i.active);
}

export function getInstanceById(id: string): ALIAInstance | undefined {
  return ALIA_INSTANCES.find(i => i.id === id);
}
