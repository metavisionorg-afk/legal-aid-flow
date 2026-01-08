import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import { lawyerAPI } from "@/lib/api";

const STATUS_OPTIONS = ["in_progress", "awaiting_documents", "awaiting_hearing", "completed"] as const;

type StatusOption = (typeof STATUS_OPTIONS)[number];

function formatDate(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function LawyerCases() {
  const { t } = useTranslation();

  const [q, setQ] = useState<string>("");
  const [status, setStatus] = useState<StatusOption | "all">("all");

  const { data: beneficiaries } = useQuery({
    queryKey: ["lawyer", "beneficiaries"],
    queryFn: lawyerAPI.listBeneficiaries,
  });

  const beneficiaryNameById = useMemo(() => {
    const map = new Map<string, string>();
    const list = Array.isArray(beneficiaries) ? beneficiaries : [];
    for (const b of list as any[]) {
      map.set(String(b.id), String(b.fullName || b.idNumber || b.id || "-"));
    }
    return map;
  }, [beneficiaries]);

  const { data: cases, isLoading, error } = useQuery({
    queryKey: ["lawyer", "cases", { status, q }],
    queryFn: () =>
      lawyerAPI.listCases({
        status: status === "all" ? undefined : status,
        q: q.trim() ? q.trim() : undefined,
      }),
  });

  const rows = Array.isArray(cases) ? cases : [];

  const statusLabel = (s: any) =>
    t(`lawyer.status.${String(s)}`, {
      defaultValue: t(`case.status.${String(s)}`, { defaultValue: String(s || "-") }),
    });

  return (
    <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{t("lawyer.my_cases_title")}</h1>
            <p className="text-muted-foreground">{t("lawyer.my_cases")}</p>
          </div>
          <Link href="/lawyer/dashboard">
            <Button variant="outline">{t("lawyer.dashboard", { defaultValue: "Dashboard" })}</Button>
          </Link>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t("lawyer.my_cases_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("lawyer.filters.search_placeholder")}
                />
              </div>
              <div className="w-full md:w-64">
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("lawyer.filters.status")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all", { defaultValue: "All" })}</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`lawyer.status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error ? (
              <div className="text-sm text-destructive">{String((error as any).message || t("common.error"))}</div>
            ) : null}

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cases.case_number", { defaultValue: "Case #" })}</TableHead>
                    <TableHead>{t("cases.title", { defaultValue: "Title" })}</TableHead>
                    <TableHead>{t("beneficiaries.name", { defaultValue: "Beneficiary" })}</TableHead>
                    <TableHead>{t("cases.status", { defaultValue: "Status" })}</TableHead>
                    <TableHead>{t("cases.updated_at", { defaultValue: "Updated" })}</TableHead>
                    <TableHead className="text-right">{t("common.actions", { defaultValue: "" })}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? (
                    rows.map((c: any) => (
                      <TableRow key={String(c.id)}>
                        <TableCell className="font-medium">{c.caseNumber || "-"}</TableCell>
                        <TableCell>{c.title || "-"}</TableCell>
                        <TableCell>{beneficiaryNameById.get(String(c.beneficiaryId)) || "-"}</TableCell>
                        <TableCell>{statusLabel(c.status)}</TableCell>
                        <TableCell>{formatDate(c.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/cases/${c.id}`}>
                            <Button size="sm" variant="outline">
                              {t("common.open", { defaultValue: "Open" })}
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
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
