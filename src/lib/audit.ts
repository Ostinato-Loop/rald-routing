// RALD Routing — Audit logging (fire-and-forget, non-blocking)
// LILCKY STUDIO LIMITED

export interface AuditEvent {
  user_id:     string | null;
  action:      string;
  instance_id: string | null;
  input_hash:  string | null;
  intent:      string | null;
  reasoning:   string[];
  fallback:    boolean;
  latency_ms:  number;
  ip:          string | null;
  metadata?:   Record<string, unknown>;
}

export async function writeRoutingAudit(
  supabaseUrl:    string,
  serviceKey:     string,
  event:          AuditEvent
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/alia_routing_log`, {
      method:  "POST",
      headers: {
        apikey:          serviceKey,
        Authorization:   `Bearer ${serviceKey}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({
        user_id:     event.user_id,
        action:      event.action,
        instance_id: event.instance_id,
        input_hash:  event.input_hash,
        intent:      event.intent,
        reasoning:   event.reasoning,
        fallback:    event.fallback,
        latency_ms:  event.latency_ms,
        ip:          event.ip,
        metadata:    event.metadata ?? {},
        created_at:  new Date().toISOString(),
      }),
    });
  } catch {
    // Audit failure is non-fatal — routing continues
  }
}

export async function sha256hex(input: string): Promise<string> {
  const buf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
