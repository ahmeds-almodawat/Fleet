import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, startOfWeek, addHours, isWithinInterval, differenceInMinutes, max, min } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

type TripEvent = {
  id: string;
  kind: "trip";
  start: Date;
  end: Date;
  title: string;
  status: string;
};

type MaintEvent = {
  id: string;
  kind: "maintenance";
  start: Date;
  end: Date;
  title: string;
  status: string;
};

type TimelineEvent = TripEvent | MaintEvent;

function clamp(n: number, minV: number, maxV: number) {
  return Math.max(minV, Math.min(maxV, n));
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = max([aStart, bStart]);
  const e = min([aEnd, bEnd]);
  const mins = differenceInMinutes(e, s);
  return Math.max(0, mins);
}

export function VehicleWeekTimeline({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation();
  const isRtl = (i18n.language || "").startsWith("ar");
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 0 }),
    [weekOffset]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-week-timeline", vehicleId, weekStart.toISOString()],
    queryFn: async () => {
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 7).toISOString();
      const startDate = format(weekStart, "yyyy-MM-dd");
      const endDate = format(addDays(weekStart, 7), "yyyy-MM-dd");

      const [tripsRes, maintRes] = await Promise.all([
        supabase
          .from("trips")
          .select("id, trip_no, destination_text, status, requested_at, closed_at")
          .eq("vehicle_id", vehicleId)
          .gte("requested_at", from)
          .lt("requested_at", to)
          .order("requested_at", { ascending: true }),
        supabase
          .from("vehicle_maintenance")
          .select("id, status, scheduled_date, completed_date, maintenance_type:maintenance_types(name), custom_type_name")
          .eq("vehicle_id", vehicleId)
          .or(`scheduled_date.gte.${startDate},scheduled_date.lt.${endDate},completed_date.gte.${startDate},completed_date.lt.${endDate}`)
      ]);

      if (tripsRes.error) throw tripsRes.error;
      if (maintRes.error) throw maintRes.error;

      const tripEvents: TripEvent[] = (tripsRes.data || []).map((tRow: any) => {
        const start = new Date(tRow.requested_at);
        const end = tRow.closed_at ? new Date(tRow.closed_at) : addHours(start, 1);
        return {
          id: tRow.id,
          kind: "trip",
          start,
          end,
          title: `${t("timeline.trip")} ${tRow.trip_no}: ${tRow.destination_text}`,
          status: tRow.status,
        };
      });

      const maintEvents: MaintEvent[] = (maintRes.data || []).map((mRow: any) => {
        const date = mRow.scheduled_date || mRow.completed_date;
        const start = date ? new Date(`${date}T09:00:00`) : addHours(weekStart, 9);
        const end = addHours(start, 1);
        const name = mRow.maintenance_type?.name || mRow.custom_type_name || t("maintenance.maintenance");
        return {
          id: mRow.id,
          kind: "maintenance",
          start,
          end,
          title: `${t("timeline.maintenance")}: ${name}`,
          status: mRow.status,
        };
      });

      const all = [...tripEvents, ...maintEvents].filter((ev) =>
        isWithinInterval(ev.start, { start: weekStart, end: addDays(weekStart, 7) })
      );
      return all as TimelineEvent[];
    },
  });

  const events = data || [];
  const hourRows = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const metrics = useMemo(() => {
    const totalWeekMinutes = 7 * 24 * 60;
    let busyMinutes = 0;
    let tripMinutes = 0;
    let maintMinutes = 0;

    for (const ev of events) {
      const mins = overlapMinutes(ev.start, ev.end, weekStart, weekEnd);
      busyMinutes += mins;
      if (ev.kind === "trip") tripMinutes += mins;
      if (ev.kind === "maintenance") maintMinutes += mins;
    }

    const utilization = totalWeekMinutes > 0 ? (busyMinutes / totalWeekMinutes) * 100 : 0;

    return {
      tripsInWeek: events.filter((e) => e.kind === "trip").length,
      maintenanceInWeek: events.filter((e) => e.kind === "maintenance").length,
      busyHours: busyMinutes / 60,
      tripHours: tripMinutes / 60,
      maintenanceHours: maintMinutes / 60,
      utilization,
    };
  }, [events, weekStart, weekEnd]);

  const rangeLabel = useMemo(() => {
    const startLabel = format(weekStart, "yyyy-MM-dd");
    const endLabel = format(addDays(weekStart, 6), "yyyy-MM-dd");
    return `${startLabel} → ${endLabel}`;
  }, [weekStart]);

  // Grid sizing: header row + 24 hour rows
  // Columns: time-label + 7 days
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((v) => v - 1)}
            className="print:hidden"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((v) => v + 1)}
            className="print:hidden"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium">{t("timeline.week")}: {rangeLabel}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{t("timeline.trip")}</Badge>
          <Badge variant="outline">{t("timeline.maintenance")}</Badge>
        </div>
      </div>

      {/* Week KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{t("timeline.utilization")}</div>
            <div className="text-lg font-bold">{Math.round(metrics.utilization)}%</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{t("timeline.busyHours")}</div>
            <div className="text-lg font-bold">{Math.round(metrics.busyHours)} {t("common.hours")}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{t("timeline.weekTrips")}</div>
            <div className="text-lg font-bold">{metrics.tripsInWeek}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{t("timeline.weekMaintenance")}</div>
            <div className="text-lg font-bold">{metrics.maintenanceInWeek}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hidden md:block">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{t("timeline.maintenanceHours")}</div>
            <div className="text-lg font-bold">{Math.round(metrics.maintenanceHours)} {t("common.hours")}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-auto">
            <div className="min-w-[900px]">
              {/* Header Row */}
              <div className="grid grid-cols-[90px_repeat(7,1fr)] border-b bg-muted/30">
                <div className="p-2 text-xs font-medium text-muted-foreground border-r">
                  {t("timeline.time")}
                </div>
                {days.map((d) => (
                  <div key={d.toISOString()} className="p-2 text-xs font-medium border-r text-center">
                    {format(d, "EEE")}<div className="text-muted-foreground">{format(d, "MM/dd")}</div>
                  </div>
                ))}
              </div>

              {/* Hour Rows */}
              {hourRows.map((h) => (
                <div key={h} className="grid grid-cols-[90px_repeat(7,1fr)] border-b">
                  <div className="p-2 text-xs text-muted-foreground border-r whitespace-nowrap">
                    {`${String(h).padStart(2, "0")}:00`}
                  </div>
                  {days.map((d) => {
                    const cellStart = addHours(d, h);
                    const cellEnd = addHours(d, h + 1);

                    const cellEvents = events.filter((ev) =>
                      isWithinInterval(cellStart, { start: ev.start, end: ev.end }) ||
                      isWithinInterval(ev.start, { start: cellStart, end: cellEnd })
                    );

                    return (
                      <div key={`${d.toISOString()}-${h}`} className="border-r relative h-10">
                        {cellEvents.slice(0, 2).map((ev) => (
                          <div
                            key={`${ev.kind}-${ev.id}-${h}`}
                            title={ev.title}
                            className={cn(
                              "absolute inset-x-1 top-1 rounded px-2 py-1 text-[10px] leading-tight truncate",
                              ev.kind === "trip"
                                ? "bg-primary/10 text-primary"
                                : "bg-amber-500/10 text-amber-700"
                            )}
                            style={{
                              // slight vertical stacking when two events
                              top: ev.kind === "trip" ? 4 : 18,
                            }}
                          >
                            {ev.kind === "trip" ? t("timeline.tripShort") : t("timeline.maintenanceShort")}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>
          ) : events.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">{t("timeline.noEvents")}</div>
          ) : null}
        </CardContent>
      </Card>

      <div className={cn("text-xs text-muted-foreground", isRtl ? "text-right" : "text-left")}>
        {t("timeline.note")}
      </div>
    </div>
  );
}
