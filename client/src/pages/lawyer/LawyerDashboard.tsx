import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { lawyerAPI } from "@/lib/api";

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
                          <Link href={`/cases/${c.id}`}>
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
