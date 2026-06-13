// RALD Routing — Fast keyword-based intent classifier
// No LLM call at routing time — sub-1ms classification.
// Upgraded to embedding-based later; interface stays the same.
// LILCKY STUDIO LIMITED

export interface IntentResult {
  domains:     string[];
  type:        "domain" | "persona" | "capability" | "general";
  confidence:  "high" | "medium" | "low";
  keywords:    string[];
}

// Keyword → domain signal map (order matters: first match wins for confidence)
const DOMAIN_SIGNALS: Array<{ pattern: RegExp; domains: string[]; type: IntentResult["type"] }> = [
  // Finance / money
  { pattern: /\b(tax|vat|invoice|accounting|balance\s+sheet|profit|loss|revenue|finance|financial|budget|money|invest|stock|share|dividend|loan|credit|debit|bank|banking|transfer|remittance|wallet|payment|payroll)\b/i, domains: ["finance"], type: "domain" },
  // Legal
  { pattern: /\b(law|legal|court|contract|agreement|clause|sue|lawsuit|lawyer|attorney|advocate|rights|litigation|arbitration|regulation|compliance|gdpr|ndpa|patent|trademark|copyright)\b/i, domains: ["law"], type: "domain" },
  // Health
  { pattern: /\b(health|medical|doctor|hospital|diagnosis|symptom|drug|medicine|nutrition|diet|fitness|exercise|mental\s+health|therapy|vaccine|prescription)\b/i, domains: ["health"], type: "domain" },
  // Government / civic
  { pattern: /\b(government|gov|permit|license|cac|tin|nin|bvn|passport|visa|citizenship|policy|election|vote|civic|public\s+service|ministry|agency|official)\b/i, domains: ["government"], type: "domain" },
  // Code / tech
  { pattern: /\b(code|programming|software|api|bug|debug|deploy|function|algorithm|typescript|javascript|python|react|node|database|sql|backend|frontend|git|docker|kubernetes)\b/i, domains: ["code"], type: "capability" },
  // Business / SME
  { pattern: /\b(business|sme|startup|entrepreneur|pitch|investor|product|market|customer|sales|revenue|growth|brand|marketing|advertising|operations|supply\s+chain|logistics)\b/i, domains: ["business"], type: "persona" },
  // Coaching / personal dev
  { pattern: /\b(coach|coaching|productivity|habit|goal|mindset|motivation|career|personal\s+development|leadership|self.improvement|time\s+management)\b/i, domains: ["personal development"], type: "persona" },
  // Deep research
  { pattern: /\b(research|analyse|analyze|investigate|report|study|deep\s+dive|comprehensive|survey|literature\s+review|evidence|data\s+analysis)\b/i, domains: ["research"], type: "capability" },
  // Voice
  { pattern: /\b(voice|audio|speak|listen|call|phone|dictate|speech)\b/i, domains: ["voice"], type: "capability" },
];

export function classifyIntent(input: string): IntentResult {
  const matched: string[] = [];
  const matchedDomains: string[] = [];
  let matchedType: IntentResult["type"] = "general";
  let matchCount = 0;

  for (const signal of DOMAIN_SIGNALS) {
    const hits = input.match(signal.pattern);
    if (hits) {
      matchCount += hits.length;
      for (const d of signal.domains) {
        if (!matchedDomains.includes(d)) matchedDomains.push(d);
      }
      matched.push(...hits.map(h => h.trim().toLowerCase()));
      if (matchedType === "general") matchedType = signal.type;
    }
  }

  const confidence: IntentResult["confidence"] =
    matchCount >= 3 ? "high" :
    matchCount >= 1 ? "medium" :
    "low";

  return {
    domains:    matchedDomains.length ? matchedDomains : ["general"],
    type:       matchedType,
    confidence,
    keywords:   [...new Set(matched)].slice(0, 10),
  };
}
