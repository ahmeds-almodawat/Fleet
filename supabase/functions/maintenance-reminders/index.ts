import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireSchedulerSecretOrUserPermission } from '../_shared/auth.ts';
import { getEnv } from '../_shared/env.ts';

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

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return optionsResponse(req, 'GET, POST, OPTIONS');
  if (!['GET', 'POST'].includes(req.method)) {
    return jsonResponse(req, { success: false, error: 'Method not allowed' }, 405, 'GET, POST, OPTIONS');
  }

  try {
    const { admin, via, userId } = await requireSchedulerSecretOrUserPermission(req, [
      'system.jobs.run',
      'maintenance.manage',
      'fleet.manage',
    ]);

    const resendApiKey = getEnv('RESEND_API_KEY');

    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const { data: maintenanceRecords, error: maintenanceError } = await admin
      .from('vehicle_maintenance')
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
      .in('status', ['Scheduled', 'Overdue', 'InProgress'])
      .eq('reminder_sent', false);

    if (maintenanceError) {
      throw new Error(`Error fetching maintenance: ${maintenanceError.message}`);
    }

    const remindersToSend: { record: MaintenanceRecord; type: 'overdue' | 'upcoming' }[] = [];

    for (const record of maintenanceRecords || []) {
      const typedRecord = record as unknown as MaintenanceRecord;

      if (typedRecord.scheduled_date) {
        const scheduledDate = new Date(typedRecord.scheduled_date);
        if (scheduledDate < today) {
          remindersToSend.push({ record: typedRecord, type: 'overdue' });
          await admin.from('vehicle_maintenance').update({ status: 'Overdue' }).eq('id', typedRecord.id);
        } else if (scheduledDate <= sevenDaysFromNow) {
          remindersToSend.push({ record: typedRecord, type: 'upcoming' });
        }
      }

      if (typedRecord.scheduled_odometer && typedRecord.vehicle?.current_odometer) {
        const kmUntilDue = typedRecord.scheduled_odometer - typedRecord.vehicle.current_odometer;
        if (kmUntilDue <= 0) remindersToSend.push({ record: typedRecord, type: 'overdue' });
        else if (kmUntilDue <= 500) remindersToSend.push({ record: typedRecord, type: 'upcoming' });
      }
    }

    const uniqueReminders = remindersToSend.filter(
      (reminder, index, self) => index === self.findIndex((r) => r.record.id === reminder.record.id),
    );

    if (!resendApiKey) {
      for (const { record } of uniqueReminders) {
        await admin.from('vehicle_maintenance').update({ reminder_sent: true }).eq('id', record.id);
      }

      return jsonResponse(req, {
        success: true,
        message: 'Reminders processed; RESEND_API_KEY not configured, so no emails were sent.',
        count: uniqueReminders.length,
        via,
        actor_id: userId,
      }, 200, 'GET, POST, OPTIONS');
    }

    // Current implementation records reminders and marks them as sent.
    // Replace this block with provider-specific delivery if email sending is required.
    for (const { record } of uniqueReminders) {
      await admin.from('vehicle_maintenance').update({ reminder_sent: true }).eq('id', record.id);
    }

    return jsonResponse(req, {
      success: true,
      message: `Processed ${uniqueReminders.length} maintenance reminders`,
      count: uniqueReminders.length,
      via,
      actor_id: userId,
    }, 200, 'GET, POST, OPTIONS');
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.text();
      return new Response(body, {
        status: e.status,
        headers: jsonResponse(req, {}, 200, 'GET, POST, OPTIONS').headers,
      });
    }

    return jsonResponse(req, {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, 500, 'GET, POST, OPTIONS');
  }
});
