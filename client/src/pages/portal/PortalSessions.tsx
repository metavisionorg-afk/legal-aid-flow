import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format, isPast, isFuture, parseISO } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, MapPin, Video, Building2, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { casesAPI, tasksAPI } from "@/lib/api";

interface Session {
  id: string;
  caseId: string;
  title: string;
  sessionNumber: number | null;
  gregorianDate: string;
  time: string | null;
  hijriDate: string | null;
  courtName: string | null;
  city: string | null;
  circuit: string | null;
  sessionType: string | null;
  status: string | null;
  meetingUrl: string | null;
  requirements: string | null;
  isConfidential: boolean;
  createdAt: string;
}

export default function PortalSessions() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  // Get beneficiary's cases
  const { data: myCases, isLoading: casesLoading } = useQuery({
    queryKey: ["cases", "my"],
    queryFn: () => casesAPI.getMy(),
  });

  // Get sessions for all beneficiary's cases
  const { data: allSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["portal-sessions"],
    queryFn: () => tasksAPI.getMySessions(),
  });

  const isLoading = casesLoading || sessionsLoading;

  // Filter sessions by time
  const now = new Date();
  const upcomingSessions = (allSessions || []).filter((s: Session) => 
    isFuture(parseISO(s.gregorianDate))
  ).sort((a: Session, b: Session) => 
    new Date(a.gregorianDate).getTime() - new Date(b.gregorianDate).getTime()
  );

  const pastSessions = (allSessions || []).filter((s: Session) => 
    isPast(parseISO(s.gregorianDate))
  ).sort((a: Session, b: Session) => 
    new Date(b.gregorianDate).getTime() - new Date(a.gregorianDate).getTime()
  );

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    
    const statusMap: Record<string, { variant: any; label: string }> = {
      upcoming: { variant: "default", label: t("portal_sessions.status.upcoming") },
      postponed: { variant: "secondary", label: t("portal_sessions.status.postponed") },
      completed: { variant: "outline", label: t("portal_sessions.status.completed") },
      cancelled: { variant: "destructive", label: t("portal_sessions.status.cancelled") },
    };

    const config = statusMap[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSessionTypeIcon = (sessionType: string | null) => {
    if (sessionType === "remote") return <Video className="h-4 w-4" />;
    if (sessionType === "in_person") return <Building2 className="h-4 w-4" />;
    return <Building2 className="h-4 w-4" />;
  };

  const SessionCard = ({ session }: { session: Session }) => {
    const caseInfo = myCases?.find((c: any) => c.id === session.caseId);
    const sessionDate = parseISO(session.gregorianDate);
    
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getSessionTypeIcon(session.sessionType)}
                <h3 className="font-semibold text-lg">{session.title}</h3>
              </div>
              {caseInfo && (
                <p className="text-sm text-muted-foreground">
                  {t("portal_sessions.case")}: {caseInfo.caseNumber}
                </p>
              )}
            </div>
            {getStatusBadge(session.status)}
          </div>

          <div className="grid gap-3">
            {/* Date and Time */}
            <div className="flex items-start gap-3">
              <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {format(sessionDate, "PPP", { locale })}
                </p>
                {session.time && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {session.time}
                  </p>
                )}
                {session.hijriDate && (
                  <p className="text-xs text-muted-foreground">
                    {t("portal_sessions.hijri")}: {session.hijriDate}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            {(session.courtName || session.city) && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{session.courtName}</p>
                  {session.city && (
                    <p className="text-sm text-muted-foreground">{session.city}</p>
                  )}
                  {session.circuit && (
                    <p className="text-xs text-muted-foreground">
                      {t("portal_sessions.circuit")}: {session.circuit}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Meeting URL for remote sessions */}
            {session.sessionType === "remote" && session.meetingUrl && (
              <div className="flex items-center gap-3">
                <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={session.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate"
                >
                  {t("portal_sessions.join_meeting")}
                </a>
              </div>
            )}

            {/* Requirements */}
            {session.requirements && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <span className="font-medium">{t("portal_sessions.requirements")}:</span>{" "}
                  {session.requirements}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const EmptyState = ({ type }: { type: "upcoming" | "past" }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CalendarIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
      <p className="text-lg font-medium mb-2">
        {t(type === "upcoming" ? "portal_sessions.no_upcoming" : "portal_sessions.no_past")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(type === "upcoming" 
          ? "portal_sessions.no_upcoming_description" 
          : "portal_sessions.no_past_description"
        )}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("portal_sessions.title")}</h1>
        <p className="text-muted-foreground mt-2">{t("portal_sessions.subtitle")}</p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : !myCases?.length ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <CalendarIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium mb-2">{t("portal_sessions.no_cases")}</p>
              <p className="text-sm text-muted-foreground">
                {t("portal_sessions.no_cases_description")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="upcoming">
              {t("portal_sessions.tabs.upcoming")} ({upcomingSessions.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              {t("portal_sessions.tabs.past")} ({pastSessions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingSessions.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <EmptyState type="upcoming" />
                </CardContent>
              </Card>
            ) : (
              upcomingSessions.map((session: Session) => (
                <SessionCard key={session.id} session={session} />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastSessions.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <EmptyState type="past" />
                </CardContent>
              </Card>
            ) : (
              pastSessions.map((session: Session) => (
                <SessionCard key={session.id} session={session} />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
