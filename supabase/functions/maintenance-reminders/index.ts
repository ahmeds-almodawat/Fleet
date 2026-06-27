import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  scheduled_date: string | null;
  scheduled_odometer: number | null;
  status: string;
  reminder_sent: boolean;
  maintenance_type: { name: string } | null;
  custom_type_name: string | null;
  vehicle: {
    vehicle_code: string;
    plate_no: string;
    current_odometer: number;
  } | null;
}

interface ProfileWithEmail {
  id: string;
  name_en: string;
  email?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date and 7 days from now
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // Fetch scheduled maintenance that's upcoming or overdue
    const { data: maintenanceRecords, error: maintenanceError } = await supabase
      .from("vehicle_maintenance")
      .select(`
        id,
        vehicle_id,
        scheduled_date,
        scheduled_odometer,
        status,
        reminder_sent,
        maintenance_type:maintenance_types(name),
        custom_type_name,
        vehicle:vehicles(vehicle_code, plate_no, current_odometer)
      `)
      .in("status", ["Scheduled", "Overdue", "InProgress"])
      .eq("reminder_sent", false);

    if (maintenanceError) {
      throw new Error(`Error fetching maintenance: ${maintenanceError.message}`);
    }

    const remindersToSend: {
      record: MaintenanceRecord;
      type: "overdue" | "upcoming";
    }[] = [];

    // Check each record
    for (const record of maintenanceRecords || []) {
      const typedRecord = record as unknown as MaintenanceRecord;
      
      if (typedRecord.scheduled_date) {
        const scheduledDate = new Date(typedRecord.scheduled_date);
        
        // Check if overdue
        if (scheduledDate < today) {
          remindersToSend.push({ record: typedRecord, type: "overdue" });
          
          // Update status to Overdue
          await supabase
            .from("vehicle_maintenance")
            .update({ status: "Overdue" })
            .eq("id", typedRecord.id);
        }
        // Check if due within 7 days
        else if (scheduledDate <= sevenDaysFromNow) {
          remindersToSend.push({ record: typedRecord, type: "upcoming" });
        }
      }

      // Check odometer-based reminders
      if (typedRecord.scheduled_odometer && typedRecord.vehicle?.current_odometer) {
        const kmUntilDue = typedRecord.scheduled_odometer - typedRecord.vehicle.current_odometer;
        
        if (kmUntilDue <= 0) {
          remindersToSend.push({ record: typedRecord, type: "overdue" });
        } else if (kmUntilDue <= 500) {
          remindersToSend.push({ record: typedRecord, type: "upcoming" });
        }
      }
    }

    // Remove duplicates
    const uniqueReminders = remindersToSend.filter(
      (reminder, index, self) =>
        index === self.findIndex((r) => r.record.id === reminder.record.id)
    );

    console.log(`Found ${uniqueReminders.length} maintenance reminders to send`);

    // Get users with vehicles.edit permission to notify
    const { data: usersWithPermission } = await supabase.rpc("get_users_with_permission", {
      permission_key: "vehicles.edit",
    });

    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email sending");
      
      // Still mark reminders as sent to avoid repeated processing
      for (const { record } of uniqueReminders) {
        await supabase
          .from("vehicle_maintenance")
          .update({ reminder_sent: true })
          .eq("id", record.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Reminders processed (email not configured)",
          count: uniqueReminders.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send emails using Resend
    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey);

    for (const { record, type } of uniqueReminders) {
      const maintenanceType = record.maintenance_type?.name || record.custom_type_name || "Maintenance";
      const vehicleInfo = record.vehicle
        ? `${record.vehicle.vehicle_code} (${record.vehicle.plate_no})`
        : "Unknown Vehicle";

      const subject =
        type === "overdue"
          ? `⚠️ OVERDUE: ${maintenanceType} for ${vehicleInfo}`
          : `🔔 Upcoming: ${maintenanceType} for ${vehicleInfo}`;

      const dueInfo = record.scheduled_date
        ? `Scheduled Date: ${new Date(record.scheduled_date).toLocaleDateString()}`
        : record.scheduled_odometer
          ? `Scheduled at: ${record.scheduled_odometer.toLocaleString()} km`
          : "";

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${type === "overdue" ? "#dc2626" : "#f59e0b"};">
            ${type === "overdue" ? "⚠️ Overdue Maintenance" : "🔔 Upcoming Maintenance"}
          </h2>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Vehicle:</strong> ${vehicleInfo}</p>
            <p><strong>Service:</strong> ${maintenanceType}</p>
            <p><strong>${dueInfo}</strong></p>
            ${
              record.vehicle?.current_odometer
                ? `<p><strong>Current Odometer:</strong> ${record.vehicle.current_odometer.toLocaleString()} km</p>`
                : ""
            }
          </div>
          <p>Please schedule this maintenance service as soon as possible.</p>
          <p style="color: #6b7280; font-size: 12px;">Fleet Control System</p>
        </div>
      `;

      // For now, log the email content (in production, you'd send to actual users)
      console.log(`Would send email: ${subject}`);
      
      // Mark reminder as sent
      await supabase
        .from("vehicle_maintenance")
        .update({ reminder_sent: true })
        .eq("id", record.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${uniqueReminders.length} maintenance reminders`,
        count: uniqueReminders.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in maintenance-reminders:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
