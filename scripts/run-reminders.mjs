// Server-side runner for compliance/reminder notifications.
// OPTIONAL tooling (do not run in the browser).
//
// PowerShell example:
//   $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
//   node scripts/run-reminders.mjs
//
// Recommended scheduling: once per day (Windows Task Scheduler / cron).

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const started = new Date();
  console.log(`[reminders] Starting at ${started.toISOString()}`);

  // This RPC should already exist in your DB from prior migrations.
  const { data, error } = await supabase.rpc("generate_vehicle_deadline_notifications");
  if (error) {
    console.error("[reminders] RPC failed:", error.message);
    process.exit(2);
  }

  const finished = new Date();
  console.log(`[reminders] Completed at ${finished.toISOString()}`);
  if (data != null) console.log("[reminders] Result:", data);
}

main().catch((e) => {
  console.error("[reminders] Unexpected error:", e);
  process.exit(3);
});
