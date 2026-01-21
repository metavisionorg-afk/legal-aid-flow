import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocation } from "wouter";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";

import "@fullcalendar/core/index.css";
import "@fullcalendar/daygrid/index.css";

import { getCalendarMonth, type CalendarEvent, type CalendarScope } from "@/lib/calendarApi";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function getTypeLabel(type: CalendarEvent["type"], t: (key: string, opts?: any) => string) {
  if (type === "session") return t("calendar.types.session", { defaultValue: "Session" });
  if (type === "task") return t("calendar.types.task", { defaultValue: "Task" });
  return t("calendar.types.case", { defaultValue: "Case" });
}

function buildOpenHref(scope: CalendarScope, event: CalendarEvent): string {
  if (event.type === "case") {
    if (scope === "beneficiary") return `/portal/cases/${event.id}`;
    if (scope === "lawyer") return `/lawyer/cases/${event.id}`;
    return `/cases/${event.id}`;
  }

  if (event.type === "task") {
    if (scope === "beneficiary") return "/portal/tasks";
    return "/tasks";
  }

  // session
  if (scope === "beneficiary") return "/portal/sessions";
  if (scope === "lawyer") return "/lawyer/sessions";
  return "/sessions";
}

export function UnifiedMonthlyCalendar(props: {
  scope: CalendarScope;
  title?: string;
  embedded?: boolean;
}) {
  const { scope, title, embedded } = props;
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();

  const [monthParam, setMonthParam] = useState(() => format(new Date(), "yyyy-MM"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendar", scope, monthParam],
    queryFn: async () => getCalendarMonth({ scope, month: monthParam }),
  });

  const events = Array.isArray(data?.events) ? data!.events : [];

  const fcEvents = useMemo<EventInput[]>(
    () =>
      events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        start: ev.date,
        extendedProps: {
          type: ev.type,
          relatedId: ev.relatedId ?? null,
          status: ev.status ?? null,
          priority: ev.priority ?? null,
        },
      })),
    [events],
  );

  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const eventToSelected = (api: EventApi): CalendarEvent => {
    const ext = api.extendedProps as any;
    return {
      id: String(api.id),
      title: String(api.title || ""),
      date: api.start ? api.start.toISOString() : new Date().toISOString(),
      type: (ext?.type as CalendarEvent["type"]) || "task",
      relatedId: typeof ext?.relatedId === "string" ? ext.relatedId : null,
      status: typeof ext?.status === "string" ? ext.status : null,
      priority: typeof ext?.priority === "string" ? ext.priority : null,
    };
  };

  const onEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    setSelected(eventToSelected(arg.event));
  };

  const onDatesSet = (arg: DatesSetArg) => {
    // For dayGridMonth, currentStart is the first day of the month.
    const next = format(arg.view.currentStart, "yyyy-MM");
    setMonthParam(next);
  };

  const renderEventContent = (arg: EventContentArg) => {
    const type = (arg.event.extendedProps as any)?.type as CalendarEvent["type"] | undefined;
    const dotClass =
      type === "session"
        ? "bg-red-600"
        : type === "task"
          ? "bg-green-600"
          : "bg-blue-600";

    return (
      <div className="lafc-event flex items-center gap-1 min-w-0">
        <span className={`lafc-dot ${dotClass}`} />
        <span className="lafc-title truncate">{arg.event.title}</span>
      </div>
    );
  };

  const Wrapper = embedded ? "div" : Card;

  return (
    <Wrapper className={embedded ? undefined : "w-full"}>
      {embedded ? null : (
        <CardHeader className="pb-3">
          <CardTitle>{title ?? t("calendar.title")}</CardTitle>
        </CardHeader>
      )}

      <CardContent className={embedded ? "p-0" : undefined}>
        <div className="mt-2">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-8 w-64" />
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">{String((error as any)?.message || error)}</div>
          ) : (
            <div className="lafc">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "",
                }}
                height="auto"
                dayMaxEvents={true}
                events={fcEvents}
                datesSet={onDatesSet}
                eventClick={onEventClick}
                eventContent={renderEventContent}
                locale={i18n.language}
                buttonText={{
                  today: t("calendar.today", { defaultValue: "Today" }),
                  month: t("calendar.month", { defaultValue: "Month" }),
                }}
                moreLinkText={(n) =>
                  t("calendar.more", {
                    count: n,
                    defaultValue: `+${n} more`,
                  })
                }
                dayHeaderFormat={{ weekday: "short" }}
              />
            </div>
          )}
        </div>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("calendar.dialog.title", { defaultValue: "Details" })}</DialogTitle>
            </DialogHeader>

            {selected ? (
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium">{selected.title}</div>
                  <div className="text-muted-foreground">
                    {getTypeLabel(selected.type, t)}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={() => {
                      const href = buildOpenHref(scope, selected);
                      setSelected(null);
                      setLocation(href);
                    }}
                  >
                    {t("calendar.actions.view_details", { defaultValue: "View details" })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Best-effort: print current view (calendar + dialog).
                      window.print();
                    }}
                  >
                    {t("calendar.actions.print", { defaultValue: "Print" })}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Wrapper>
  );
}
