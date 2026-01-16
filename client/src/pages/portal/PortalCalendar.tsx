import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, isToday, isPast, parseISO, addMonths, subMonths } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, FileText, Building2, AlertCircle, CheckCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import { casesAPI, tasksAPI, judicialServicesAPI } from "@/lib/api";

interface Session {
  id: string;
  caseId: string;
  title: string;
  gregorianDate: string;
  time: string | null;
  courtName: string | null;
  city: string | null;
  status: string | null;
}

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  priority: string;
}

interface JudicialService {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CalendarEvent {
  id: string;
  type: "session" | "task" | "milestone";
  date: Date;
  title: string;
  description: string;
  status?: string;
  priority?: string;
  icon: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

export default function PortalCalendar() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch sessions
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["portal-sessions"],
    queryFn: () => tasksAPI.getMySessions(),
  });

  // Fetch tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/my"],
    queryFn: () => tasksAPI.getMy(),
  });

  // Fetch judicial services (for milestones)
  const { data: services = [], isLoading: servicesLoading } = useQuery<JudicialService[]>({
    queryKey: ["/api/judicial-services/my"],
    queryFn: () => judicialServicesAPI.listMy(),
  });

  const isLoading = sessionsLoading || tasksLoading || servicesLoading;

  // Aggregate events
  const events = useMemo<CalendarEvent[]>(() => {
    const allEvents: CalendarEvent[] = [];

    // Sessions
    sessions.forEach((session) => {
      try {
        const date = parseISO(session.gregorianDate);
        allEvents.push({
          id: `session-${session.id}`,
          type: "session",
          date,
          title: session.title,
          description: `${session.courtName || ""} ${session.time ? `• ${session.time}` : ""}`.trim(),
          status: session.status || undefined,
          icon: "📅",
          variant: session.status === "completed" ? "outline" : "default",
        });
      } catch (e) {
        // Skip invalid dates
      }
    });

    // Tasks with due dates
    tasks.forEach((task) => {
      if (task.dueDate) {
        try {
          const date = parseISO(task.dueDate);
          const isPastDue = isPast(date) && task.status !== "completed";
          allEvents.push({
            id: `task-${task.id}`,
            type: "task",
            date,
            title: task.title,
            description: t("portal_calendar.task_due"),
            status: task.status,
            priority: task.priority,
            icon: "✅",
            variant: isPastDue ? "destructive" : task.priority === "urgent" ? "destructive" : "secondary",
          });
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    // Judicial service milestones (recent updates)
    services.forEach((service) => {
      if (service.status === "accepted" || service.status === "rejected") {
        try {
          const date = parseISO(service.updatedAt);
          allEvents.push({
            id: `milestone-${service.id}`,
            type: "milestone",
            date,
            title: service.title,
            description: t(`portal_calendar.milestone_${service.status}`),
            status: service.status,
            icon: "⚖️",
            variant: service.status === "accepted" ? "default" : "outline",
          });
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    return allEvents;
  }, [sessions, tasks, services, t]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale, weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { locale, weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return events.filter((event) => isSameDay(event.date, date));
  };

  // Get events for selected date
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  // Navigation
  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-8 w-8" />
            {t("portal_calendar.title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("portal_calendar.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={goToToday}>
          {t("portal_calendar.today")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {t("portal_calendar.stats.sessions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
            <p className="text-xs text-muted-foreground">{t("portal_calendar.stats.total")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {t("portal_calendar.stats.tasks")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tasks.filter((t) => t.dueDate).length}
            </div>
            <p className="text-xs text-muted-foreground">{t("portal_calendar.stats.with_due_dates")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t("portal_calendar.stats.milestones")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {services.filter((s) => s.status === "accepted" || s.status === "rejected").length}
            </div>
            <p className="text-xs text-muted-foreground">{t("portal_calendar.stats.updates")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Calendar */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {format(currentMonth, "MMMM yyyy", { locale })}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={previousMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                <div key={index} className="text-center text-sm font-medium text-muted-foreground p-2">
                  {format(new Date(2024, 0, index), "EEE", { locale })}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dayEvents = getEventsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      relative p-2 h-20 text-left rounded-md border transition-colors
                      ${!isCurrentMonth ? "bg-muted/30 text-muted-foreground" : "hover:bg-accent"}
                      ${isSelected ? "bg-accent border-primary" : "border-border"}
                      ${isTodayDate ? "font-bold border-primary/50" : ""}
                    `}
                  >
                    <div className="text-sm">
                      {format(day, "d")}
                    </div>
                    {dayEvents.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={`
                              w-1.5 h-1.5 rounded-full
                              ${event.variant === "destructive" ? "bg-destructive" : ""}
                              ${event.variant === "default" ? "bg-primary" : ""}
                              ${event.variant === "secondary" ? "bg-secondary" : ""}
                              ${event.variant === "outline" ? "bg-muted-foreground" : ""}
                            `}
                          />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{dayEvents.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected date events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedDate
                ? format(selectedDate, "PPP", { locale })
                : t("portal_calendar.select_date")}
            </CardTitle>
            {selectedDate && selectedDateEvents.length > 0 && (
              <CardDescription>
                {t("portal_calendar.events_count", { count: selectedDateEvents.length })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              {!selectedDate ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {t("portal_calendar.no_date_selected")}
                  </p>
                </div>
              ) : selectedDateEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium mb-1">
                    {t("portal_calendar.no_events")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("portal_calendar.no_events_description")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDateEvents.map((event) => (
                    <Card key={event.id} className="border-l-4" style={{
                      borderLeftColor: event.variant === "destructive" ? "hsl(var(--destructive))" : 
                                       event.variant === "default" ? "hsl(var(--primary))" :
                                       event.variant === "secondary" ? "hsl(var(--secondary))" :
                                       "hsl(var(--muted-foreground))"
                    }}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            <span className="text-xl">{event.icon}</span>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-medium">
                                {event.title}
                              </CardTitle>
                              <CardDescription className="text-xs mt-1">
                                {event.description}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant={event.variant} className="text-xs shrink-0">
                            {t(`portal_calendar.type.${event.type}`)}
                          </Badge>
                        </div>
                      </CardHeader>
                      {(event.status || event.priority) && (
                        <CardContent className="pt-0">
                          <div className="flex items-center gap-2">
                            {event.status && (
                              <Badge variant="outline" className="text-xs">
                                {t(`portal_calendar.status.${event.status}`, event.status)}
                              </Badge>
                            )}
                            {event.priority && (
                              <Badge variant={event.priority === "urgent" ? "destructive" : "secondary"} className="text-xs">
                                {t(`portal_calendar.priority.${event.priority}`, event.priority)}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t("portal_calendar.info.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("portal_calendar.info.message")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
