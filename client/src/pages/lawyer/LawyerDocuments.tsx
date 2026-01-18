import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileText, Download, Eye, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

import { lawyerAPI, casesAPI } from "@/lib/api";

function formatDate(value: any): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "-";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default function LawyerDocuments() {
  const { t } = useTranslation();
  const [q, setQ] = useState<string>("");
  const [selectedCaseId, setSelectedCaseId] = useState<string>("all");

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["lawyer", "cases"],
    queryFn: () => lawyerAPI.listCases({}),
  });

  const casesList = Array.isArray(cases) ? cases : [];

  const caseById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of casesList as any[]) {
      map.set(String(c.id), c);
    }
    return map;
  }, [casesList]);

  // Fetch documents for all cases
  const documentsQueries = useQuery({
    queryKey: ["lawyer", "documents", "all-cases", casesList.map((c: any) => c.id)],
    queryFn: async () => {
      const allDocs: any[] = [];
      for (const c of casesList as any[]) {
        try {
          const docs = await casesAPI.listDocuments(String(c.id));
          if (Array.isArray(docs)) {
            allDocs.push(...docs.map((d: any) => ({ ...d, caseId: c.id })));
          }
        } catch {
          // Skip on error
        }
      }
      return allDocs;
    },
    enabled: casesList.length > 0,
  });

  const allDocuments = useMemo(() => {
    return Array.isArray(documentsQueries.data) ? documentsQueries.data : [];
  }, [documentsQueries.data]);

  const filteredDocuments = useMemo(() => {
    let filtered = allDocuments;

    if (selectedCaseId !== "all") {
      filtered = filtered.filter((d: any) => String(d.caseId) === selectedCaseId);
    }

    if (q.trim()) {
      const search = q.toLowerCase();
      filtered = filtered.filter((d: any) => {
        const fileName = String(d.fileName || d.title || "").toLowerCase();
        return fileName.includes(search);
      });
    }

    return filtered.sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [allDocuments, selectedCaseId, q]);

  const isLoading = loadingCases || documentsQueries.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("lawyer.documents.title", { defaultValue: "Documents" })}</h1>
          <p className="text-muted-foreground">{t("lawyer.documents.description", { defaultValue: "View and download case documents" })}</p>
        </div>
        <Link href="/lawyer/dashboard">
          <Button variant="outline">{t("lawyer.dashboard", { defaultValue: "Dashboard" })}</Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.documents.total", { defaultValue: "Total Documents" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{allDocuments.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.documents.cases_with_docs", { defaultValue: "Cases with Documents" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {new Set(allDocuments.map((d: any) => d.caseId)).size}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("lawyer.documents.recent", { defaultValue: "Recent (7 days)" })}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {
                  allDocuments.filter((d: any) => {
                    const date = new Date(d.createdAt);
                    const now = new Date();
                    const diff = now.getTime() - date.getTime();
                    return diff <= 7 * 24 * 60 * 60 * 1000;
                  }).length
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("lawyer.documents.list", { defaultValue: "Documents Library" })}</CardTitle>
          <CardDescription>
            {t("lawyer.documents.list_description", { defaultValue: "All documents from your assigned cases" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("lawyer.documents.search_placeholder", { defaultValue: "Search documents..." })}
              />
            </div>
            <div className="w-full md:w-64">
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("lawyer.documents.filter_by_case", { defaultValue: "Filter by case" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all", { defaultValue: "All Cases" })}</SelectItem>
                  {casesList.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.caseNumber} - {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {documentsQueries.error ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {(documentsQueries.error as any)?.message || t("common.error")}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">
                {t("lawyer.documents.no_documents", { defaultValue: "No documents found" })}
              </p>
              <p className="text-sm">
                {q || selectedCaseId !== "all"
                  ? t("lawyer.documents.try_different_filters", { defaultValue: "Try different filters" })
                  : t("lawyer.documents.no_documents_yet", { defaultValue: "No documents have been uploaded yet" })}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("documents.file_name", { defaultValue: "File Name" })}</TableHead>
                  <TableHead>{t("cases.case_number", { defaultValue: "Case" })}</TableHead>
                  <TableHead>{t("documents.file_size", { defaultValue: "Size" })}</TableHead>
                  <TableHead>{t("documents.uploaded_at", { defaultValue: "Uploaded" })}</TableHead>
                  <TableHead className="text-right">{t("common.actions", { defaultValue: "Actions" })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc: any) => {
                  const caseData = caseById.get(String(doc.caseId));
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {doc.fileName || doc.title || "-"}
                        </div>
                      </TableCell>
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
                      <TableCell className="text-sm text-muted-foreground">{formatFileSize(doc.size)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4 mr-1" />
                              {t("common.view", { defaultValue: "View" })}
                            </Button>
                          </a>
                          <a href={doc.fileUrl} download>
                            <Button size="sm" variant="ghost">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
