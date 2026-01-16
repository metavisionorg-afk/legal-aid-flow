import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { 
  ArrowLeft, 
  Briefcase, 
  User, 
  Calendar, 
  FileText, 
  Scale,
  Clock
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { casesAPI, usersAPI } from "@/lib/api";

export default function PortalCaseDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const locale = i18n.language === "ar" ? ar : enUS;

  const { data: caseData, isLoading } = useQuery({
    queryKey: ["cases", id],
    queryFn: () => casesAPI.getOne(id!),
    enabled: !!id,
  });

  const { data: lawyers } = useQuery({
    queryKey: ["lawyers"],
    queryFn: () => usersAPI.listLawyers(),
  });

  const { data: documents } = useQuery({
    queryKey: ["cases", id, "documents"],
    queryFn: () => casesAPI.listDocuments(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Briefcase className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-medium">{t("portal_cases.case_not_found")}</p>
        <Button
          variant="outline"
          onClick={() => setLocation("/portal/my-cases")}
          className="mt-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("portal_cases.back_to_cases")}
        </Button>
      </div>
    );
  }

  const lawyer = lawyers?.find((l: any) => l.id === caseData.assignedLawyerId);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      pending_review: { variant: "outline", label: t("portal_cases.status.pending_review") },
      accepted_pending_assignment: { variant: "secondary", label: t("portal_cases.status.pending_assignment") },
      assigned: { variant: "default", label: t("portal_cases.status.assigned") },
      in_progress: { variant: "default", label: t("portal_cases.status.in_progress") },
      awaiting_documents: { variant: "secondary", label: t("portal_cases.status.awaiting_documents") },
      awaiting_hearing: { variant: "secondary", label: t("portal_cases.status.awaiting_hearing") },
      awaiting_judgment: { variant: "secondary", label: t("portal_cases.status.awaiting_judgment") },
      completed: { variant: "default", label: t("portal_cases.status.completed") },
      rejected: { variant: "destructive", label: t("portal_cases.status.rejected") },
      closed_admin: { variant: "outline", label: t("portal_cases.status.closed") },
    };

    const config = statusMap[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { variant: any; label: string }> = {
      low: { variant: "outline", label: t("priorities.low") },
      medium: { variant: "secondary", label: t("priorities.medium") },
      high: { variant: "default", label: t("priorities.high") },
      urgent: { variant: "destructive", label: t("priorities.urgent") },
    };

    const config = priorityMap[priority] || { variant: "outline", label: t("common.unknown") };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/portal/my-cases")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("portal_cases.back_to_cases")}
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{caseData.caseNumber}</h1>
            <p className="text-muted-foreground mt-1">{caseData.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(caseData.status)}
          {getPriorityBadge(caseData.priority)}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Case Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Case Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                {t("portal_cases.details.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("portal_cases.details.description")}</p>
                <p className="text-sm">{caseData.description}</p>
              </div>

              {caseData.opponentName && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t("portal_cases.details.opponent_name")}</p>
                    <p className="text-sm font-medium">{caseData.opponentName}</p>
                  </div>
                </>
              )}

              {caseData.opponentLawyer && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{t("portal_cases.details.opponent_lawyer")}</p>
                  <p className="text-sm">{caseData.opponentLawyer}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {t("portal_cases.documents.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("portal_cases.documents.no_documents")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{doc.title || doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(doc.createdAt), {
                              addSuffix: true,
                              locale,
                            })}
                          </p>
                        </div>
                      </div>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex-shrink-0"
                      >
                        {t("common.download")}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Case Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("portal_cases.info.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("portal_cases.info.case_type")}</p>
                <p className="text-sm font-medium">
                  {caseData.caseTypeNameAr || caseData.caseTypeNameEn || (caseData.caseType ? t(`case_types.${caseData.caseType}`) : t("common.unknown"))}
                </p>
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {t("portal_cases.info.assigned_lawyer")}
                </p>
                <p className="text-sm font-medium">
                  {lawyer?.fullName || t("portal_cases.not_assigned")}
                </p>
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {t("portal_cases.info.created_at")}
                </p>
                <p className="text-sm">
                  {format(new Date(caseData.createdAt), "PPP", { locale })}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("portal_cases.info.last_updated")}
                </p>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(caseData.updatedAt), {
                    addSuffix: true,
                    locale,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-base">{t("portal_cases.help.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t("portal_cases.help.description")}
              </p>
              {lawyer && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{t("portal_cases.help.contact_lawyer")}</p>
                  <p className="text-sm">{lawyer.fullName}</p>
                  {lawyer.email && (
                    <a
                      href={`mailto:${lawyer.email}`}
                      className="text-xs text-primary hover:underline block"
                    >
                      {lawyer.email}
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
