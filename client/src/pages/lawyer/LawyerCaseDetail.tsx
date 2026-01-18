import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Calendar, FileText, User, AlertCircle, StickyNote } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { casesAPI, sessionsAPI } from "@/lib/api";
import { LawyerCaseNotes } from "@/components/lawyer/LawyerCaseNotes";

function formatDate(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function LawyerCaseDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/lawyer/cases/:id");
  const caseId = (params as any)?.id;

  const { data: caseData, isLoading: loadingCase, error: caseError } = useQuery({
    queryKey: ["cases", caseId],
    queryFn: () => casesAPI.getOne(caseId!),
    enabled: Boolean(caseId),
  });

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["cases", caseId, "sessions"],
    queryFn: () => sessionsAPI.getByCase(caseId!),
    enabled: Boolean(caseId),
  });

  const { data: documents, isLoading: loadingDocuments } = useQuery({
    queryKey: ["cases", caseId, "documents"],
    queryFn: () => casesAPI.listDocuments(caseId!),
    enabled: Boolean(caseId),
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ["cases", caseId, "timeline"],
    queryFn: () => casesAPI.getTimeline(caseId!),
    enabled: Boolean(caseId),
  });

  const statusLabel = (status: any) =>
    t(`lawyer.status.${String(status)}`, {
      defaultValue: t(`case.status.${String(status)}`, { defaultValue: String(status || "-") }),
    });

  const priorityLabel = (p: any) =>
    t(`case.priority.${String(p)}`, { defaultValue: String(p || "-") });

  const caseTypeLabel = (c: any) => {
    if (c?.caseTypeNameEn || c?.caseTypeNameAr) {
      return c.caseTypeNameEn || c.caseTypeNameAr || "-";
    }
    return t(`case_types.${String(c?.caseType)}`, { defaultValue: String(c?.caseType || "-") });
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "destructive";
      case "high": return "default";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "secondary";
    }
  };

  const statusVariant = (status: string) => {
    if (["rejected", "cancelled"].includes(status)) return "destructive";
    if (["pending_review", "pending_admin_review", "pending"].includes(status)) return "secondary";
    if (
      [
        "accepted_pending_assignment",
        "accepted",
        "assigned",
        "in_progress",
        "awaiting_documents",
        "awaiting_hearing",
        "awaiting_judgment",
      ].includes(status)
    )
      return "default";
    if (["completed", "closed", "closed_admin"].includes(status)) return "outline";
    return "secondary";
  };

  if (loadingCase) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (caseError || !caseData) {
    return (
      <div className="space-y-6">
        <Link href="/lawyer/cases">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("case.back_to_cases", { defaultValue: "Back to Cases" })}
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(caseError as any)?.message || t("case.case_not_found", { defaultValue: "Case not found" })}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const sessionsList = Array.isArray(sessions) ? sessions : [];
  const documentsList = Array.isArray(documents) ? documents : [];
  const timelineEvents = Array.isArray(timeline) ? timeline : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/lawyer/cases">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("case.back_to_cases", { defaultValue: "Back to Cases" })}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">{caseData.title || t("common.untitled")}</h1>
          <p className="text-muted-foreground">
            {t("cases.case_number", { defaultValue: "Case #" })}: {caseData.caseNumber}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={statusVariant(caseData.status) as any}>
            {statusLabel(caseData.status)}
          </Badge>
          <Badge variant={priorityColor(caseData.priority) as any}>
            {priorityLabel(caseData.priority)}
          </Badge>
        </div>
      </div>

      {/* Case Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t("case.details.title", { defaultValue: "Case Details" })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("case.case_type")}</p>
              <p className="text-sm">{caseTypeLabel(caseData)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("case.priority_label")}</p>
              <p className="text-sm">{priorityLabel(caseData.priority)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("cases.created_at")}</p>
              <p className="text-sm">{formatDate(caseData.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("cases.updated_at")}</p>
              <p className="text-sm">{formatDate(caseData.updatedAt)}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">{t("case.details.description")}</p>
            <p className="text-sm whitespace-pre-wrap">{caseData.description || "-"}</p>
          </div>
          {caseData.opponentName && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">{t("case.details.opponent_name")}</p>
              <p className="text-sm">{caseData.opponentName}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Sessions, Documents, Notes, Timeline */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">
            <Calendar className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t("lawyer.sessions", { defaultValue: "Sessions" })}
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t("documents.title", { defaultValue: "Documents" })}
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t("lawyer.notes.title", { defaultValue: "My Notes" })}
          </TabsTrigger>
          <TabsTrigger value="timeline">
            {t("case.timeline", { defaultValue: "Timeline" })}
          </TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>{t("lawyer.sessions", { defaultValue: "Sessions" })}</CardTitle>
              <CardDescription>
                {t("sessions.court_sessions", { defaultValue: "Court sessions for this case" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : sessionsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{t("sessions.no_sessions", { defaultValue: "No sessions scheduled" })}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("sessions.title", { defaultValue: "Title" })}</TableHead>
                      <TableHead>{t("sessions.date", { defaultValue: "Date" })}</TableHead>
                      <TableHead>{t("sessions.time", { defaultValue: "Time" })}</TableHead>
                      <TableHead>{t("sessions.court", { defaultValue: "Court" })}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionsList.map((session: any) => (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium">{session.title || "-"}</TableCell>
                        <TableCell>{formatDate(session.gregorianDate)}</TableCell>
                        <TableCell>{session.time || "-"}</TableCell>
                        <TableCell>{session.courtName || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>{t("documents.title", { defaultValue: "Documents" })}</CardTitle>
              <CardDescription>
                {t("documents.case_documents", { defaultValue: "Documents related to this case" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocuments ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : documentsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{t("documents.no_documents", { defaultValue: "No documents uploaded" })}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("documents.file_name", { defaultValue: "File Name" })}</TableHead>
                      <TableHead>{t("documents.uploaded_at", { defaultValue: "Uploaded" })}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentsList.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.fileName || doc.title || "-"}</TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">
                              {t("common.view", { defaultValue: "View" })}
                            </Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <LawyerCaseNotes caseId={caseId!} />
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>{t("case.timeline", { defaultValue: "Timeline" })}</CardTitle>
              <CardDescription>{t("case.timeline_description", { defaultValue: "Case history" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTimeline ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t("case.no_timeline", { defaultValue: "No timeline events" })}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {timelineEvents.map((event: any) => (
                    <div key={event.id} className="flex items-start gap-4 border-l-2 pl-4 pb-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {t(`case.timeline.${event.eventType}`, { defaultValue: event.eventType })}
                        </p>
                        {event.note && <p className="text-sm text-muted-foreground mt-1">{event.note}</p>}
                        <p className="text-xs text-muted-foreground mt-2">{formatDate(event.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}