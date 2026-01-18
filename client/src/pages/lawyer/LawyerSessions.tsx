import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, AlertCircle, Filter, Video } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { lawyerAPI, sessionsAPI } from "@/lib/api";

function formatDate(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function LawyerSessions() {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["lawyer", "cases"],
    queryFn: () => lawyerAPI.listCases({}),
  });

  const { data: allSessions, isLoading: loadingSessions, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: sessionsAPI.getAll,
  });

  const caseIdSet = useMemo(() => {
    const list = Array.isArray(cases) ? cases : [];
    return new Set(list.map((c: any) => String(c.id)));
  }, [cases]);

  const caseById = useMemo(() => {
    const map = new Map<string, any>();
    const list = Array.isArray(cases) ? cases : [];
    for (const c of list as any[]) {
      map.set(String(c.id), c);
    }
    return map;
  }, [cases]);

  const filteredSessions = useMemo(() => {
    const list = Array.isArray(allSessions) ? allSessions : [];
    let filtered = list.filter((s: any) => caseIdSet.has(String(s.caseId)));

    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((s: any) => {
        const d = new Date(s.gregorianDate);
        return d >= from;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((s: any) => {
        const d = new Date(s.gregorianDate);
        return d <= to;
      });
    }

    return filtered;
  }, [allSessions, caseIdSet, dateFrom, dateTo]);

  const now = new Date();
  const upcoming = useMemo(
    () => filteredSessions.filter((s: any) => new Date(s.gregorianDate) >= now).sort((a: any, b: any) => new Date(a.gregorianDate).getTime() - new Date(b.gregorianDate).getTime()),
    [filteredSessions, now]
  );

  const past = useMemo(
    () => filteredSessions.filter((s: any) => new Date(s.gregorianDate) < now).sort((a: any, b: any) => new Date(b.gregorianDate).getTime() - new Date(a.gregorianDate).getTime()),
    [filteredSessions, now]
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case "upcoming": return "default";
      case "completed": return "outline";
      case "cancelled": return "destructive";
      case "postponed": return "secondary";
      default: return "secondary";
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("lawyer.sessions.title", { defaultValue: "Sessions" })}</h1>
          <p className="text-muted-foreground">{t("lawyer.sessions.description", { defaultValue: "Court sessions for your cases" })}</p>
        </div>
        <Link href="/lawyer/dashboard">
          <Button variant="outline">{t("lawyer.dashboard", { defaultValue: "Dashboard" })}</Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.sessions.total", { defaultValue: "Total Sessions" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{filteredSessions.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.sessions.upcoming", { defaultValue: "Upcoming" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{upcoming.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.sessions.past", { defaultValue: "Past" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{past.length}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <CardTitle className="text-base">{t("lawyer.filters.title", { defaultValue: "Filters" })}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">{t("lawyer.filters.date_from", { defaultValue: "From Date" })}</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">{t("lawyer.filters.date_to", { defaultValue: "To Date" })}</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                {t("lawyer.filters.clear", { defaultValue: "Clear Filters" })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Tabs */}
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList>
          <TabsTrigger value="upcoming">
            {t("lawyer.sessions.upcoming", { defaultValue: "Upcoming" })} ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            {t("lawyer.sessions.past", { defaultValue: "Past" })} ({past.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("lawyer.sessions.upcoming", { defaultValue: "Upcoming Sessions" })}</CardTitle>
              <CardDescription>{t("lawyer.sessions.upcoming_description", { defaultValue: "Sessions scheduled in the future" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions || loadingCases ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : error ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {(error as any)?.message || t("common.error")}
                </div>
              ) : upcoming.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{t("lawyer.sessions.no_upcoming", { defaultValue: "No upcoming sessions" })}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("sessions.title", { defaultValue: "Title" })}</TableHead>
                      <TableHead>{t("sessions.case", { defaultValue: "Case" })}</TableHead>
                      <TableHead>{t("sessions.date", { defaultValue: "Date" })}</TableHead>
                      <TableHead>{t("sessions.time", { defaultValue: "Time" })}</TableHead>
                      <TableHead>{t("sessions.court", { defaultValue: "Court" })}</TableHead>
                      <TableHead>{t("common.status", { defaultValue: "Status" })}</TableHead>
                      <TableHead>{t("common.actions", { defaultValue: "Actions" })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((session: any) => {
                      const caseData = caseById.get(String(session.caseId));
                      const zoomMeeting = (session as any).zoomMeeting;
                      return (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium">{session.title || "-"}</TableCell>
                          <TableCell>
                            {caseData ? (
                              <Link href={`/lawyer/cases/${caseData.id}`}>
                                <Button variant="link" size="sm" className="p-0 h-auto">
                                  {caseData.caseNumber}
                                </Button>
                              </Link>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{formatDate(session.gregorianDate)}</TableCell>
                          <TableCell>{session.time || "-"}</TableCell>
                          <TableCell>{session.courtName || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadge(session.status) as any}>
                              {t(`sessions.status.${session.status}`, { defaultValue: session.status })}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {zoomMeeting?.joinUrl ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(zoomMeeting.joinUrl, "_blank")}
                                className="gap-2"
                              >
                                <Video className="h-4 w-4" />
                                {t("sessions.join_meeting", { defaultValue: "Join Meeting" })}
                              </Button>
                            ) : session.meetingUrl ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(session.meetingUrl, "_blank")}
                                className="gap-2"
                              >
                                <Video className="h-4 w-4" />
                                {t("sessions.join_meeting", { defaultValue: "Join Meeting" })}
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("lawyer.sessions.past", { defaultValue: "Past Sessions" })}</CardTitle>
              <CardDescription>{t("lawyer.sessions.past_description", { defaultValue: "Sessions that have already occurred" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions || loadingCases ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : past.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{t("lawyer.sessions.no_past", { defaultValue: "No past sessions" })}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("sessions.title", { defaultValue: "Title" })}</TableHead>
                      <TableHead>{t("sessions.case", { defaultValue: "Case" })}</TableHead>
                      <TableHead>{t("sessions.date", { defaultValue: "Date" })}</TableHead>
                      <TableHead>{t("sessions.time", { defaultValue: "Time" })}</TableHead>
                      <TableHead>{t("sessions.court", { defaultValue: "Court" })}</TableHead>
                      <TableHead>{t("common.status", { defaultValue: "Status" })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {past.map((session: any) => {
                      const caseData = caseById.get(String(session.caseId));
                      return (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium">{session.title || "-"}</TableCell>
                          <TableCell>
                            {caseData ? (
                              <Link href={`/lawyer/cases/${caseData.id}`}>
                                <Button variant="link" size="sm" className="p-0 h-auto">
                                  {caseData.caseNumber}
                                </Button>
                              </Link>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{formatDate(session.gregorianDate)}</TableCell>
                          <TableCell>{session.time || "-"}</TableCell>
                          <TableCell>{session.courtName || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadge(session.status) as any}>
                              {t(`sessions.status.${session.status}`, { defaultValue: session.status })}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
