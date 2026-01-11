import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { configAPI, judicialServicesAPI, usersAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type JudicialServiceRow = any;
type DocumentRow = any;

type LawyerUser = { id: string; fullName: string; role?: string; userType?: string };

const ADMIN_STATUS_VALUES = [
  "pending_review",
  "accepted",
  "assigned",
  "in_progress",
  "awaiting_documents",
  "completed",
  "rejected",
  "cancelled",
] as const;

export default function JudicialServices() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const [blocked401, setBlocked401] = useState(false);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<JudicialServiceRow | null>(null);

  const { data: features, isLoading: loadingFeatures } = useQuery({
    queryKey: ["config", "features"],
    queryFn: async () => (await configAPI.features()) as any,
    staleTime: Infinity,
  });

  // Default to enabled if server doesn't expose the flag yet.
  const judicialServicesEnabled = (features as any)?.FEATURE_JUDICIAL_SERVICES !== false;
  const canQuery = !authLoading && Boolean(user) && !blocked401 && judicialServicesEnabled;

  const {
    data: services,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["judicial-services", "staff"],
    enabled: canQuery,
    queryFn: async () => (await judicialServicesAPI.list()) as JudicialServiceRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((error as any)?.response?.status === 401) setBlocked401(true);
  }, [error]);

  const { data: lawyers, error: lawyersError } = useQuery({
    queryKey: ["users", "lawyers"],
    enabled: canQuery,
    queryFn: async () => {
      const rows = (await usersAPI.listLawyers()) as any[];
      return (rows || []).map((u) => ({
        id: String(u.id),
        fullName: String(u.fullName || u.username || u.email || u.id),
      })) as LawyerUser[];
    },
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((lawyersError as any)?.response?.status === 401) setBlocked401(true);
  }, [lawyersError]);

  const {
    data: attachments,
    isLoading: loadingAttachments,
    error: attachmentsError,
  } = useQuery({
    queryKey: ["judicial-services", active?.id, "attachments"],
    enabled: canQuery && Boolean(active?.id),
    queryFn: async () => (await judicialServicesAPI.listAttachments(String(active!.id))) as DocumentRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((attachmentsError as any)?.response?.status === 401) setBlocked401(true);
  }, [attachmentsError]);

  const assignLawyerMutation = useMutation({
    mutationFn: async (input: { serviceId: string; lawyerId: string }) =>
      judicialServicesAPI.assignLawyer(input.serviceId, input.lawyerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["judicial-services", "staff"] });
      toast({ title: t("common.success") ?? "Success", description: "Lawyer assigned." });
    },
    onError: (err) => {
      toast({
        title: t("common.error") ?? "Error",
        description: getErrorMessage(err, t),
        variant: "destructive" as any,
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: { serviceId: string; status: string }) =>
      judicialServicesAPI.updateStatus(input.serviceId, { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["judicial-services", "staff"] });
      toast({ title: t("common.success") ?? "Success", description: "Status updated." });
    },
    onError: (err) => {
      toast({
        title: t("common.error") ?? "Error",
        description: getErrorMessage(err, t),
        variant: "destructive" as any,
      });
    },
  });

  const sorted = useMemo(() => {
    const list = Array.isArray(services) ? [...services] : [];
    list.sort((a, b) => {
      const ad = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [services]);

  return (
    <Layout>
      <div className="space-y-6">
        {loadingFeatures ? (
          <Card>
            <CardContent className="py-10">
              <div className="space-y-3">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : !judicialServicesEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("judicial_services.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {t("common.feature_disabled", { defaultValue: "This feature is currently disabled." })}
              </div>
            </CardContent>
          </Card>
        ) : blocked401 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("common.session_expired", { defaultValue: "Session expired" })}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {t("common.please_login_again", { defaultValue: "Please log in again to continue." })}
              </div>
              <div className="mt-4 flex gap-2">
                <Button asChild>
                  <a href="/login">{t("auth.login", { defaultValue: "Login" })}</a>
                </Button>
                <Button variant="outline" onClick={() => setBlocked401(false)}>
                  {t("common.retry", { defaultValue: "Retry" })}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("judicial_services.title")}</CardTitle>
            <Button
              variant="outline"
              disabled={!canQuery}
              onClick={() => {
                if (!canQuery) return;
                refetch();
              }}
            >
              {t("common.refresh") ?? "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            {!canQuery ? (
              <div className="text-sm text-muted-foreground">
                {authLoading
                  ? (t("common.loading", { defaultValue: "Loading…" }) as any)
                  : t("common.no_data", { defaultValue: "No data." })}
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : error ? (
              <div className="text-sm text-destructive">{getErrorMessage(error, t)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service #</TableHead>
                    <TableHead>{t("app.title")}</TableHead>
                    <TableHead>{t("app.status")}</TableHead>
                    <TableHead>{t("app.priority")}</TableHead>
                    <TableHead>Lawyer</TableHead>
                    <TableHead>{t("app.date")}</TableHead>
                    <TableHead>{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length ? (
                    sorted.map((js) => (
                      <TableRow key={String(js.id)}>
                        <TableCell className="font-mono text-xs">{String(js.serviceNumber || "—")}</TableCell>
                        <TableCell className="font-medium">{String(js.title || "")}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{String(js.status || "")}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{String(js.priority || "")}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {js.assignedLawyerId ? String(js.assignedLawyerId) : "—"}
                        </TableCell>
                        <TableCell>{js.createdAt ? new Date(js.createdAt).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActive(js);
                              setOpen(true);
                            }}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {t("common.empty") ?? t("common.no_data") ?? "No judicial services."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setActive(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("judicial_services.manage_title")}</DialogTitle>
            </DialogHeader>

            {!active ? null : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Service #</div>
                    <div className="font-mono text-sm">{String(active.serviceNumber || "—")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Beneficiary</div>
                    <div className="text-sm">{String(active.beneficiaryId || "—")}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-muted-foreground">Title</div>
                    <div className="text-sm font-medium">{String(active.title || "")}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("judicial_services.assign_lawyer")}</Label>
                    <Select
                      value={active.assignedLawyerId ? String(active.assignedLawyerId) : ""}
                      onValueChange={(lawyerId) => {
                        if (!active?.id) return;
                        assignLawyerMutation.mutate({ serviceId: String(active.id), lawyerId });
                        setActive({ ...active, assignedLawyerId: lawyerId });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("judicial_services.select_lawyer")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(lawyers || []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("judicial_services.update_status")}</Label>
                    <Select
                      value={String(active.status || "")}
                      onValueChange={(status) => {
                        if (!active?.id) return;
                        updateStatusMutation.mutate({ serviceId: String(active.id), status });
                        setActive({ ...active, status });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("judicial_services.select_status")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ADMIN_STATUS_VALUES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Attachments</div>
                  </div>

                  {loadingAttachments ? (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : attachmentsError ? (
                    <div className="text-sm text-destructive">{getErrorMessage(attachmentsError, t)}</div>
                  ) : (
                    <div className="space-y-2">
                      {(attachments || []).length ? (
                        (attachments || []).map((doc: any) => (
                          <div
                            key={String(doc.id)}
                            className="flex items-center justify-between gap-3 rounded-md border p-3"
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {String(doc.title || doc.fileName || "Document")}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {String(doc.fileName || "")} {doc.size ? `• ${doc.size} bytes` : ""}
                              </div>
                            </div>
                            <a className="shrink-0" href={String(doc.fileUrl || "#")} target="_blank" rel="noreferrer">
                              <Button size="sm">Download</Button>
                            </a>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">No attachments.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
