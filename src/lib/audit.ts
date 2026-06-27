import type { SupabaseClient } from '@supabase/supabase-js';

type AuditPayload = {
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata?: Record<string, any>;
};

// Best-effort audit log (never throw to the UI)
export async function auditLog(supabase: SupabaseClient, payload: AuditPayload) {
  try {
    await supabase.rpc('log_audit_event', {
      p_action: payload.action,
      p_entity_type: payload.entityType,
      p_entity_id: payload.entityId,
      p_summary: payload.summary,
      p_metadata_json: payload.metadata ?? {},
    });
  } catch {
    // ignore
  }
}
