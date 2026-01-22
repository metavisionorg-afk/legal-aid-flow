import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { useLocation } from "wouter";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

import arLocale from "@fullcalendar/core/locales/ar";
import enGbLocale from "@fullcalendar/core/locales/en-gb";
import type {
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";

import { calendarAPI, type CalendarItem } from "@/lib/api";
import type { CalendarScope } from "@/lib/calendarApi";

import { getCalendarDotClass, type CalendarItemType } from "@/components/calendar/calendarColors";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

function getTypeLabel(type: CalendarItemType, t: (key: string, opts?: any) => string) {
  if (type === "task") return t("calendar.type.task", { defaultValue: "Task" });
  if (type === "session") return t("calendar.type.session", { defaultValue: "Session" });
  if (type === "case") return t("calendar.type.case", { defaultValue: "Case" });
  return t("calendar.type.event", { defaultValue: "Event" });
}

function buildOpenHref(scope: CalendarScope, item: CalendarItem): string {
  if (item.type === "case") {
    if (scope === "beneficiary") return `/portal/cases/${item.entityId}`;
    if (scope === "lawyer") return `/lawyer/cases/${item.entityId}`;
    return `/cases/${item.entityId}`;
  }

  if (item.type === "task") {
    if (scope === "beneficiary") return "/portal/tasks";
    return "/tasks";
  }

  // session/event
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

  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  });

  const [filters, setFilters] = useState(() => ({
    tasks: true,
    sessions: true,
    cases: true,
  }));

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendar", "range", range.from, range.to],
    queryFn: async () => calendarAPI.list({ from: range.from, to: range.to }),
  });

  const items = Array.isArray((data as any)?.items) ? ((data as any).items as CalendarItem[]) : [];

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (it.type === "task") return filters.tasks;
      if (it.type === "session") return filters.sessions;
      if (it.type === "case") return filters.cases;
      return true;
    });
  }, [items, filters]);

  const fcEvents = useMemo<EventInput[]>(
    () =>
      filteredItems.map((it) => ({
        id: it.id,
        title: it.title,
        start: it.start,
        end: it.end,
        allDay: it.allDay,
        extendedProps: {
          item: it,
        },
      })),
    [filteredItems],
  );

  const [selected, setSelected] = useState<CalendarItem | null>(null);

  const eventToSelected = (api: EventApi): CalendarItem => {
    const ext = api.extendedProps as any;
    const item = ext?.item as CalendarItem | undefined;
    if (item) return item;
    return {
      id: String(api.id),
      type: "event",
      title: String(api.title || ""),
      start: api.start ? api.start.toISOString() : new Date().toISOString(),
      allDay: Boolean(api.allDay),
      entityId: String(api.id),
    };
  };

  const onEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    setSelected(eventToSelected(arg.event));
  };

  const onDatesSet = (arg: DatesSetArg) => {
    // For dayGridMonth, currentStart is the first day of the month and currentEnd is exclusive.
    const from = format(arg.view.currentStart, "yyyy-MM-dd");
    const to = format(addDays(arg.view.currentEnd, -1), "yyyy-MM-dd");
    setRange((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
  };

  const renderEventContent = (arg: EventContentArg) => {
    const type = ((arg.event.extendedProps as any)?.item?.type as CalendarItemType | undefined) ?? "event";
    const dotClass = getCalendarDotClass(type);

    return (
      <div className="lafc-event flex items-center gap-1 min-w-0">
        <span className={`lafc-dot ${dotClass}`} />
        <span className="lafc-title truncate">{arg.event.title}</span>
      </div>
    );
  };

  const isRtl = i18n.language === "ar";
  const calendarLocale = isRtl ? "ar" : "en-gb";

  const Wrapper = embedded ? "div" : Card;

  return (
    <Wrapper className={embedded ? undefined : "w-full"}>
      {embedded ? null : (
        <CardHeader className="pb-3">
          <CardTitle>{title ?? t("calendar.title", { defaultValue: "Calendar" })}</CardTitle>
        </CardHeader>
      )}

      <CardContent className={embedded ? "p-0" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="calendar-filter-tasks"
                checked={filters.tasks}
                onCheckedChange={(checked) => setFilters((p) => ({ ...p, tasks: Boolean(checked) }))}
              />
              <Label htmlFor="calendar-filter-tasks">{t("calendar.filters.tasks", { defaultValue: "Tasks" })}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="calendar-filter-sessions"
                checked={filters.sessions}
                onCheckedChange={(checked) => setFilters((p) => ({ ...p, sessions: Boolean(checked) }))}
              />
              <Label htmlFor="calendar-filter-sessions">
                {t("calendar.filters.sessions", { defaultValue: "Sessions" })}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="calendar-filter-cases"
                checked={filters.cases}
                onCheckedChange={(checked) => setFilters((p) => ({ ...p, cases: Boolean(checked) }))}
              />
              <Label htmlFor="calendar-filter-cases">{t("calendar.filters.cases", { defaultValue: "Cases" })}</Label>
            </div>
          </div>
        </div>

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
          ) : filteredItems.length === 0 ? (
            <div className="p-4">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("calendar.empty", { defaultValue: "No events in this range" })}</EmptyTitle>
                  <EmptyDescription>
                    {t("calendar.empty_hint", { defaultValue: "Try adjusting filters or switching months." })}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
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
                timeZone="local"
                locales={[arLocale, enGbLocale]}
                locale={calendarLocale}
                direction={isRtl ? "rtl" : "ltr"}
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
                      const href = selected.url || buildOpenHref(scope, selected);
                      setSelected(null);
                      setLocation(href);
                    }}
                  >
                    {t("calendar.dialog.open", { defaultValue: "Open" })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Best-effort: print current view (calendar + dialog).
                      window.print();
                    }}
                  >
                    {t("calendar.dialog.print", { defaultValue: "Print" })}
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
