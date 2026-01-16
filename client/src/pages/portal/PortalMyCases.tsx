import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Eye, Briefcase } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { casesAPI, usersAPI } from "@/lib/api";
import { NewCaseDialog } from "@/components/cases/NewCaseDialog";

export default function PortalMyCases() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  const { data: myCases, isLoading } = useQuery({
    queryKey: ["cases", "my"],
    queryFn: () => casesAPI.getMy(),
  });

  // Fetch lawyers for assigned lawyer names
  const { data: lawyers } = useQuery({
    queryKey: ["lawyers"],
    queryFn: () => usersAPI.listLawyers(),
  });

  const getLawyerName = (lawyerId: string | null) => {
    if (!lawyerId) return t("portal_cases.not_assigned");
    const lawyer = lawyers?.find((l: any) => l.id === lawyerId);
    return lawyer?.fullName || t("portal_cases.not_assigned");
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("portal_cases.title")}</h1>
          <p className="text-muted-foreground mt-2">{t("portal_cases.subtitle")}</p>
        </div>
        <NewCaseDialog />
      </div>

      {/* Cases Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {t("portal_cases.my_cases_list")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : !myCases?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium mb-2">{t("portal_cases.no_cases")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("portal_cases.no_cases_description")}</p>
              <NewCaseDialog />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("portal_cases.case_number")}</TableHead>
                    <TableHead>{t("portal_cases.case_type")}</TableHead>
                    <TableHead>{t("portal_cases.status")}</TableHead>
                    <TableHead>{t("portal_cases.assigned_lawyer")}</TableHead>
                    <TableHead>{t("portal_cases.last_update")}</TableHead>
                    <TableHead className="w-[100px]">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myCases.map((c: any) => (
                    <TableRow key={c.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{c.caseNumber}</TableCell>
                      <TableCell>
                        {c.caseTypeNameAr || c.caseTypeNameEn || (c.caseType ? t(`case_types.${c.caseType}`) : t("common.unknown"))}
                      </TableCell>
                      <TableCell>{getStatusBadge(c.status)}</TableCell>
                      <TableCell>{getLawyerName(c.assignedLawyerId)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(c.updatedAt), {
                          addSuffix: true,
                          locale,
                        })}
                      </TableCell>
                      <TableCell>
                        <Link href={`/portal/cases/${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">{t("portal_cases.view_details")}</span>
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
