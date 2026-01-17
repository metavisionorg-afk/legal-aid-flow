import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, Bell, FileText, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { lawyerAPI, sessionsAPI, notificationsAPI } from "@/lib/api";

function formatDate(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function LawyerDashboard() {
  const { t } = useTranslation();

  const { data: dashboard, isLoading: loadingDashboard, error: dashboardError } = useQuery({
    queryKey: ["lawyer", "dashboard"],
    queryFn: lawyerAPI.getDashboard,
  });

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["lawyer", "cases", { for: "dashboard" }],
    queryFn: () => lawyerAPI.listCases(),
  });

  const { data: allSessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["sessions", "all"],
    queryFn: sessionsAPI.getAll,
  });

  const { data: notifications, isLoading: loadingNotifications } = useQuery({
    queryKey: ["notifications", "my"],
    queryFn: notificationsAPI.getMy,
  });

  const latestCases = useMemo(() => {
    const list = Array.isArray(cases) ? cases : [];
    return [...list]
      .sort((a: any, b: any) => {
        const ad = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bd = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bd - ad;
      })
      .slice(0, 5);
  }, [cases]);

  const upcomingSessions = useMemo(() => {
    const allSessionsList = Array.isArray(allSessions) ? allSessions : [];
    const caseIds = new Set(Array.isArray(cases) ? cases.map((c: any) => String(c.id)) : []);
    const now = new Date();
    
    return allSessionsList
      .filter((s: any) => {
        if (!s.caseId || !caseIds.has(String(s.caseId))) return false;
        const sessionDate = s.gregorianDate ? new Date(s.gregorianDate) : null;
        return sessionDate && sessionDate >= now;
      })
      .sort((a: any, b: any) => {
        const ad = a.gregorianDate ? new Date(a.gregorianDate).getTime() : 0;
        const bd = b.gregorianDate ? new Date(b.gregorianDate).getTime() : 0;
        return ad - bd;
      })
      .slice(0, 5);
  }, [allSessions, cases]);

  const unreadNotifications = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    return list.filter((n: any) => !n.isRead).slice(0, 3);
  }, [notifications]);

  const byStatus = (dashboard as any)?.counts?.byStatus || {};
  const kpi = {
    total: Number((dashboard as any)?.counts?.totalCases ?? 0),
    in_progress: Number(byStatus?.in_progress ?? 0),
    awaiting_documents: Number(byStatus?.awaiting_documents ?? 0),
    completed: Number(byStatus?.completed ?? 0),
  };

  const statusLabel = (status: any) =>
    t(`lawyer.status.${String(status)}`, {
      defaultValue: t(`case.status.${String(status)}`, { defaultValue: String(status || "-") }),
    });

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("lawyer.portal_title")}</h1>
          <p className="text-muted-foreground">{t("lawyer.dashboard_title")}</p>
        </div>

        {(dashboardError as any) ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("common.error")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {String((dashboardError as any)?.message || t("common.error"))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("lawyer.kpis.total_cases")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{kpi.total}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("lawyer.kpis.in_progress")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{kpi.in_progress}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("lawyer.kpis.awaiting_documents")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{kpi.awaiting_documents}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("lawyer.kpis.completed")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{kpi.completed}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("lawyer.dashboard_page.upcoming_sessions")}</CardTitle>
                <CardDescription>{t("lawyer.dashboard_page.upcoming_sessions_description")}</CardDescription>
              </div>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : upcomingSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{t("lawyer.dashboard_page.no_upcoming_sessions")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map((session: any) => (
                  <div key={session.id} className="flex items-start gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{session.title || t("common.untitled")}</h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <span>{formatDate(session.gregorianDate)}</span>
                        {session.time && <span>• {session.time}</span>}
                        {session.courtName && <span>• {session.courtName}</span>}
                      </div>
                    </div>
                    {session.status && (
                      <Badge variant={session.status === "upcoming" ? "default" : "secondary"}>
                        {t(`sessions.status.${session.status}`, { defaultValue: session.status })}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        {!loadingNotifications && unreadNotifications.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("lawyer.dashboard_page.notifications")}</CardTitle>
                  <CardDescription>{t("lawyer.dashboard_page.unread_notifications")}</CardDescription>
                </div>
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {unreadNotifications.map((notif: any) => (
                  <Alert key={notif.id}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{notif.message}</p>
                        </div>
                        {notif.createdAt && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(notif.createdAt)}
                          </span>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Latest Cases */}
        <Card>
          <CardHeader>
            <CardTitle>{t("lawyer.latest_cases")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCases ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cases.case_number", { defaultValue: "#" })}</TableHead>
                    <TableHead>{t("cases.title", { defaultValue: "Title" })}</TableHead>
                    <TableHead>{t("cases.status", { defaultValue: "Status" })}</TableHead>
                    <TableHead>{t("cases.updated_at", { defaultValue: "Updated" })}</TableHead>
                    <TableHead className="text-right">{t("common.actions", { defaultValue: "" })}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestCases.length ? (
                    latestCases.map((c: any) => (
                      <TableRow key={String(c.id)}>
                        <TableCell className="font-medium">{c.caseNumber || "-"}</TableCell>
                        <TableCell>{c.title || "-"}</TableCell>
                        <TableCell>{statusLabel(c.status)}</TableCell>
                        <TableCell>{formatDate(c.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/lawyer/cases/${c.id}`}>
                            <Button size="sm" variant="outline">{t("common.open", { defaultValue: "Open" })}</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        {t("common.no_data", { defaultValue: "No data" })}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
