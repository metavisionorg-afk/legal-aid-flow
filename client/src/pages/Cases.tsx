import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, Filter, Pencil, Search, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { casesAPI, uploadsAPI, usersAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { canCreateCase, isAdmin, isBeneficiary, isLawyer } from "@/lib/authz";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LawyerPortalLayout } from "@/components/layout/LawyerPortalLayout";
import Forbidden from "@/pages/Forbidden";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { NewCaseDialog } from "@/components/cases/NewCaseDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Cases() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const [docsOpen, setDocsOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [caseDialogMode, setCaseDialogMode] = useState<"view" | "edit">("view");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docIsPublic, setDocIsPublic] = useState<boolean>(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteCase, setPendingDeleteCase] = useState<any>(null);

  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    opponentName: string;
    opponentLawyer: string;
    opponentContact: string;
    priority: "low" | "medium" | "high" | "urgent";
  }>({
    title: "",
    description: "",
    opponentName: "",
    opponentLawyer: "",
    opponentContact: "",
    priority: "medium",
  });

  const [matchCaseRoute, caseRouteParams] = useRoute("/cases/:id");
  const [matchLawyerCaseRoute, lawyerCaseRouteParams] = useRoute("/lawyer/cases/:id");
  const lastOpenedCaseIdRef = useRef<string | null>(null);

  const isBen = isBeneficiary(user);
  const isAdminUser = isAdmin(user);
  const isLawyerUser = isLawyer(user);
  const canCreate = canCreateCase(user);
  const allowed = isBeneficiary(user) || isAdmin(user) || isLawyer(user);
  const isLawyerPortalRoute = Boolean(isLawyerUser && location.startsWith("/lawyer"));

  const canEditCase = (c: any) => {
    if (!user || !c) return false;
    if (isBen) return false;
    // Admins can edit any case; lawyers only their assigned cases.
    if (isAdminUser) return true;
    if (isLawyerUser) return String(c.assignedLawyerId || "") === String(user.id);
    return false;
  };

  const canDeleteCase = (c: any) => {
    if (!user || !c) return false;
    if (isBen) return false;
    // Safer default: only admins can delete.
    return isAdminUser;
  };

  // If a lawyer lands on the staff cases route, keep them inside the lawyer portal.
  useEffect(() => {
    if (loading || !user || !isLawyerUser) return;
    if (location.startsWith("/lawyer")) return;

    if (matchCaseRoute) {
      const id = String((caseRouteParams as any)?.id || "");
      setLocation(id ? `/lawyer/cases/${id}` : "/lawyer/cases");
      return;
    }

    if (location === "/cases") {
      setLocation("/lawyer/cases");
    }
  }, [loading, user, isLawyerUser, location, matchCaseRoute, (caseRouteParams as any)?.id, setLocation]);

  const statusLabel = (status: unknown) =>
    t(`case.status.${String(status)}`, { defaultValue: String(status || "-") });

  const statusVariant = (status: unknown) => {
    const s = String(status || "");
    if (["rejected", "cancelled"].includes(s)) return "destructive" as const;
    if (["pending_review", "pending_admin_review", "pending"].includes(s)) return "secondary" as const;
    if (
      [
        "accepted_pending_assignment",
        "accepted",
        "assigned",
        "in_progress",
        "awaiting_documents",
        "awaiting_hearing",
        "awaiting_judgment",
      ].includes(s)
    )
      return "default" as const;
    if (["completed", "closed", "closed_admin"].includes(s)) return "outline" as const;
    return "secondary" as const;
  };

  useEffect(() => {
    if (loading) return;
    if (!user) setLocation("/portal", { replace: true });
  }, [loading, user, setLocation]);

  const { data: cases, isLoading } = useQuery({
    queryKey: ["cases", isBen ? "my" : "all"],
    queryFn: isBen ? casesAPI.getMy : casesAPI.getAll,
    enabled: Boolean(!loading && user && allowed),
  });

  useEffect(() => {
    const id = matchLawyerCaseRoute
      ? String((lawyerCaseRouteParams as any)?.id || "")
      : matchCaseRoute
        ? String((caseRouteParams as any)?.id || "")
        : "";

    if (!id) return;
    if (!cases || !Array.isArray(cases)) return;
    if (lastOpenedCaseIdRef.current === id) return;

    const found = cases.find((c: any) => String(c.id) === id);
    if (!found) return;

    setSelectedCase(found);
    setDocsOpen(true);
    setCaseDialogMode("view");
    lastOpenedCaseIdRef.current = id;
  }, [matchCaseRoute, (caseRouteParams as any)?.id, matchLawyerCaseRoute, (lawyerCaseRouteParams as any)?.id, cases]);

  useEffect(() => {
    if (!selectedCase) return;
    setEditDraft({
      title: String(selectedCase.title ?? ""),
      description: String(selectedCase.description ?? ""),
      opponentName: String(selectedCase.opponentName ?? ""),
      opponentLawyer: String(selectedCase.opponentLawyer ?? ""),
      opponentContact: String(selectedCase.opponentContact ?? ""),
      priority: (String(selectedCase.priority || "medium") as any) || "medium",
    });
  }, [selectedCase?.id]);

  const { data: caseDocuments, isLoading: loadingDocs } = useQuery({
    queryKey: ["case-documents", selectedCase?.id],
    queryFn: () => casesAPI.listDocuments(String(selectedCase.id)),
    enabled: Boolean(!loading && user && allowed && docsOpen && selectedCase?.id),
  });

  const uploadDocsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      if (!docFile) throw new Error("No file");

      const meta = await uploadsAPI.upload(docFile);
      return casesAPI.uploadDocuments(String(selectedCase.id), {
        isPublic: isBen ? true : docIsPublic,
        documents: [meta],
      });
    },
    onSuccess: async () => {
      setDocFile(null);
      await queryClient.invalidateQueries({ queryKey: ["case-documents", selectedCase?.id] });
      toast({ title: t("common.success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const { data: selectedCaseFresh } = useQuery({
    queryKey: ["case", selectedCase?.id],
    queryFn: () => casesAPI.getOne(String(selectedCase.id)),
    enabled: Boolean(!loading && user && allowed && docsOpen && selectedCase?.id),
  });

  useEffect(() => {
    if (selectedCaseFresh) setSelectedCase(selectedCaseFresh);
  }, [selectedCaseFresh]);

  const { data: timeline } = useQuery({
    queryKey: ["case-timeline", selectedCase?.id],
    queryFn: () => casesAPI.getTimeline(String(selectedCase.id)),
    enabled: Boolean(!loading && user && allowed && docsOpen && selectedCase?.id),
  });

  const { data: allUsers } = useQuery({
    queryKey: ["users"],
    queryFn: usersAPI.getAll,
    enabled: Boolean(!loading && user && isAdminUser),
  });

  const lawyers = (Array.isArray(allUsers) ? allUsers : []).filter(
    (u: any) => u && u.userType === "staff" && u.role === "lawyer",
  );

  const lawyerNameById = new Map(
    lawyers.map((u: any) => [String(u.id), String(u.fullName || u.username || u.email || u.id)] as const),
  );

  const [rejectReason, setRejectReason] = useState<string>("");
  const [assignLawyerId, setAssignLawyerId] = useState<string>("");
  const [nextStatus, setNextStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState<string>("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      return casesAPI.approve(String(selectedCase.id));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      toast({ title: t("common.success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      if (!canEditCase(selectedCase)) throw new Error("Forbidden");
      const title = editDraft.title.trim();
      if (!title) throw new Error(t("cases.validation.title_required", { defaultValue: "Title is required" }));

      return casesAPI.update(String(selectedCase.id), {
        title,
        description: String(editDraft.description ?? ""),
        opponentName: editDraft.opponentName.trim() ? editDraft.opponentName.trim() : null,
        opponentLawyer: editDraft.opponentLawyer.trim() ? editDraft.opponentLawyer.trim() : null,
        opponentContact: editDraft.opponentContact.trim() ? editDraft.opponentContact.trim() : null,
        priority: editDraft.priority,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      toast({ title: t("common.success") });
      setCaseDialogMode("view");
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      if (!pendingDeleteCase?.id) throw new Error("No case selected");
      if (!canDeleteCase(pendingDeleteCase)) throw new Error("Forbidden");
      return casesAPI.delete(String(pendingDeleteCase.id));
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      setPendingDeleteCase(null);
      if (selectedCase && pendingDeleteCase && String(selectedCase.id) === String(pendingDeleteCase.id)) {
        setDocsOpen(false);
        setSelectedCase(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast({ title: t("cases.deleted", { defaultValue: t("common.success") }) });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      return casesAPI.reject(String(selectedCase.id), rejectReason);
    },
    onSuccess: async () => {
      setRejectReason("");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      toast({ title: t("common.success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const assignLawyerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      if (!assignLawyerId) throw new Error("No lawyer selected");
      return casesAPI.assignLawyer(String(selectedCase.id), assignLawyerId);
    },
    onSuccess: async () => {
      setAssignLawyerId("");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      toast({ title: t("common.success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const listAssignLawyerMutation = useMutation({
    mutationFn: async (input: { caseId: string; lawyerId: string }) => {
      return casesAPI.assignLawyer(input.caseId, input.lawyerId);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });

      if (String(selectedCase?.id) === String(variables.caseId)) {
        await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
        await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      }

      toast({ title: t("cases.lawyer_assigned_success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("cases.lawyer_assigned_error"),
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCase?.id) throw new Error("No case selected");
      if (!nextStatus) throw new Error("No status selected");
      return casesAPI.updateStatus(String(selectedCase.id), nextStatus, statusNote);
    },
    onSuccess: async () => {
      setNextStatus("");
      setStatusNote("");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
      await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      toast({ title: t("cases.status_updated") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  const ADMIN_STATUSES = [
    "pending_review",
    "rejected",
    "accepted_pending_assignment",
    "assigned",
    "closed_admin",
  ] as const;

  const ACTION_SELECT_VALUE = "__action__";

  const listUpdateStatusMutation = useMutation({
    mutationFn: async (input: { caseId: string; status: string }) => {
      return casesAPI.updateStatus(input.caseId, input.status);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["cases"] });

      if (String(selectedCase?.id) === String(variables.caseId)) {
        await queryClient.invalidateQueries({ queryKey: ["case", selectedCase?.id] });
        await queryClient.invalidateQueries({ queryKey: ["case-timeline", selectedCase?.id] });
      }

      toast({ title: t("cases.status_updated") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("common.error"),
        variant: "destructive",
      });
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!allowed) {
    return <Forbidden redirectTo="/portal" />;
  }

  const page = (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.cases')}</h1>
        {canCreate ? <NewCaseDialog /> : null}
      </div>

      <Tabs defaultValue="all" className="w-full">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="all">{t("cases.filters.all")}</TabsTrigger>
            <TabsTrigger value="active">{t("cases.filters.active")}</TabsTrigger>
            <TabsTrigger value="pending">{t("cases.filters.pending")}</TabsTrigger>
            <TabsTrigger value="closed">{t("cases.filters.closed")}</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
              <Input
                placeholder={t('app.search')}
                className="pl-9 rtl:pr-9 rtl:pl-3"
                data-testid="input-search"
              />
            </div>
            <Button variant="outline" size="icon" data-testid="button-filter">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="all" className="mt-0">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cases.case_number', { defaultValue: 'Case Number' })}</TableHead>
                  <TableHead>{t('intake.case_type')}</TableHead>
                  <TableHead>{t('cases.title', { defaultValue: 'Title' })}</TableHead>
                  <TableHead>{t('app.priority')}</TableHead>
                  <TableHead>{t('app.status')}</TableHead>
                  <TableHead>{t("cases.lawyer")}</TableHead>
                  <TableHead className="text-right rtl:text-left">{t('app.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    </TableRow>
                  ))
                ) : cases && cases.length > 0 ? (
                  cases.map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-case-${c.id}`}>
                      <TableCell className="font-medium">
                        <div>{c.caseNumber}</div>
                      </TableCell>
                      <TableCell>{c.caseType ? t(`case_types.${c.caseType}`, { defaultValue: t("common.unknown") }) : t("common.unknown")}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.title}</TableCell>
                      <TableCell>
                        <Badge variant={c.priority === "urgent" ? "destructive" : c.priority === "high" ? "default" : "secondary"}>
                          {c.priority ? t(`priorities.${c.priority}`, { defaultValue: t("common.unknown") }) : t("common.unknown")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(c.status)}>
                            {statusLabel(c.status)}
                          </Badge>
                          {isAdminUser ? (
                            <Select
                              value={ACTION_SELECT_VALUE}
                              onValueChange={(next) =>
                                listUpdateStatusMutation.mutate({
                                  caseId: String(c.id),
                                  status: next,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-[220px]">
                                <SelectValue placeholder={t("cases.change_status")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ACTION_SELECT_VALUE} disabled className="hidden">
                                  {t("cases.change_status")}
                                </SelectItem>
                                {ADMIN_STATUSES.filter((s) => s !== String(c.status)).map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {statusLabel(s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="text-sm">
                            {c.assignedLawyerId
                              ? (lawyerNameById.get(String(c.assignedLawyerId)) ?? String(c.assignedLawyerId))
                              : t("cases.unassigned")}
                          </div>

                          {isAdminUser ? (
                            <Select
                              value={ACTION_SELECT_VALUE}
                              onValueChange={(next) =>
                                listAssignLawyerMutation.mutate({
                                  caseId: String(c.id),
                                  lawyerId: next,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-[220px]" aria-label={t("cases.select_lawyer")}>
                                <SelectValue placeholder={t("cases.select_lawyer")} />
                              </SelectTrigger>
                              <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
                                <SelectItem value={ACTION_SELECT_VALUE} disabled className="hidden">
                                  {t("cases.select_lawyer")}
                                </SelectItem>
                                {lawyers.map((u: any) => (
                                  <SelectItem key={u.id} value={String(u.id)}>
                                    {String(u.fullName || u.username || u.email || u.id)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right rtl:text-left">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => {
                              setSelectedCase(c);
                              setCaseDialogMode("edit");
                              setDocsOpen(true);
                            }}
                            disabled={!canEditCase(c)}
                            aria-label={t("common.edit")}
                            data-testid={`button-edit-${c.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => {
                              setSelectedCase(c);
                              setCaseDialogMode("view");
                              setDocsOpen(true);
                            }}
                            aria-label={t("common.view")}
                            data-testid={`button-view-${c.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => {
                              setPendingDeleteCase(c);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={!canDeleteCase(c) || deleteCaseMutation.isPending}
                            aria-label={t("common.delete")}
                            data-testid={`button-delete-${c.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {t("cases.no_cases")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="active">
          <div className="p-4 text-center text-muted-foreground">Active cases view</div>
        </TabsContent>
        <TabsContent value="pending">
          <div className="p-4 text-center text-muted-foreground">Pending cases view</div>
        </TabsContent>
        <TabsContent value="closed">
          <div className="p-4 text-center text-muted-foreground">Closed cases view</div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={docsOpen}
        onOpenChange={(open) => {
          setDocsOpen(open);
          if (!open) {
            setSelectedCase(null);
            setCaseDialogMode("view");
            setDocFile(null);
            setDocIsPublic(false);
            setRejectReason("");
            setAssignLawyerId("");
            setNextStatus("");
            setStatusNote("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("beneficiary_portal.documents")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {selectedCase?.caseNumber} — {selectedCase?.title}
            </div>

            {!isBen && caseDialogMode === "edit" ? (
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">{t("common.edit")}</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("cases.fields.title", { defaultValue: "Title" })}</Label>
                    <Input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("app.priority")}</Label>
                    <Select
                      value={editDraft.priority}
                      onValueChange={(v) =>
                        setEditDraft((p) => ({
                          ...p,
                          priority: v as any,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                        <SelectItem value="urgent">urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("cases.fields.description", { defaultValue: "Description" })}</Label>
                  <Textarea
                    value={editDraft.description}
                    onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("cases.fields.opponent_name", { defaultValue: "Opponent" })}</Label>
                    <Input
                      value={editDraft.opponentName}
                      onChange={(e) => setEditDraft((p) => ({ ...p, opponentName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("cases.fields.opponent_lawyer", { defaultValue: "Opponent lawyer" })}</Label>
                    <Input
                      value={editDraft.opponentLawyer}
                      onChange={(e) => setEditDraft((p) => ({ ...p, opponentLawyer: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("cases.fields.opponent_contact", { defaultValue: "Opponent contact" })}</Label>
                    <Input
                      value={editDraft.opponentContact}
                      onChange={(e) => setEditDraft((p) => ({ ...p, opponentContact: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setCaseDialogMode("view")}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={() => updateCaseMutation.mutate()}
                    disabled={updateCaseMutation.isPending || !canEditCase(selectedCase)}
                    data-testid="button-case-save"
                  >
                    {updateCaseMutation.isPending ? t("common.loading") : t("common.save")}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(selectedCase?.status)}>
                {statusLabel(selectedCase?.status)}
              </Badge>
              {selectedCase?.assignedLawyerId ? (
                <Badge variant="secondary">
                  {t("cases.assigned_lawyer")}: {String(selectedCase.assignedLawyerId)}
                </Badge>
              ) : null}
            </div>

            {isBen && ["pending_review", "pending_admin_review"].includes(String(selectedCase?.status)) ? (
              <div className="text-sm text-muted-foreground">{t("cases.submitted")}</div>
            ) : null}

            {isAdminUser && ["pending_review", "pending_admin_review"].includes(String(selectedCase?.status)) ? (
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">{t("cases.case_status")}</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    data-testid="button-case-approve"
                  >
                    {approveMutation.isPending ? t("common.loading") : t("common.approve")}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>{t("common.note")}</Label>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <Button
                    variant="destructive"
                    onClick={() => rejectMutation.mutate()}
                    disabled={rejectMutation.isPending}
                    data-testid="button-case-reject"
                  >
                    {rejectMutation.isPending ? t("common.loading") : t("common.reject")}
                  </Button>
                </div>
              </div>
            ) : null}

            {isAdminUser && ["accepted_pending_assignment", "accepted"].includes(String(selectedCase?.status)) ? (
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">{t("cases.assign_lawyer")}</div>
                <Select value={assignLawyerId} onValueChange={setAssignLawyerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cases.select_lawyer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(allUsers) ? allUsers : [])
                      .filter((u: any) => u && u.userType === "staff" && u.role === "lawyer")
                      .map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => assignLawyerMutation.mutate()}
                  disabled={!assignLawyerId || assignLawyerMutation.isPending}
                  data-testid="button-case-assign-lawyer"
                >
                  {assignLawyerMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            ) : null}

            {isLawyerUser && selectedCase?.assignedLawyerId === user?.id ? (
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">{t("cases.update_status")}</div>
                <Select value={nextStatus} onValueChange={setNextStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cases.select_status")} />
                  </SelectTrigger>
                  <SelectContent>
                    {["in_progress", "awaiting_documents", "awaiting_hearing", "awaiting_judgment", "completed"]
                      .filter((s) => s !== String(selectedCase?.status))
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="space-y-2">
                  <Label>{t("common.note")}</Label>
                  <Textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                </div>
                <Button
                  onClick={() => updateStatusMutation.mutate()}
                  disabled={!nextStatus || updateStatusMutation.isPending}
                  data-testid="button-case-update-status"
                >
                  {updateStatusMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cases.new_case.document_file")}</TableHead>
                    <TableHead>{t("cases.new_case.document_type")}</TableHead>
                    <TableHead className="text-right rtl:text-left">{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingDocs ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : caseDocuments && caseDocuments.length ? (
                    caseDocuments.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.fileName || d.title || "Document"}</TableCell>
                        <TableCell>{d.mimeType || d.fileType || "-"}</TableCell>
                        <TableCell className="text-right rtl:text-left">
                          <Button variant="outline" size="sm" asChild>
                            <a href={d.fileUrl} target="_blank" rel="noreferrer">
                              {t("common.view")}
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        {t("beneficiary_portal.no_documents")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("cases.new_case.document_file")}</Label>
                <Input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {!isBen ? (
                <div className="space-y-2">
                  <Label>{t("cases.new_case.document_visibility")}</Label>
                  <div className="flex items-center gap-2">
                    <ToggleSwitch checked={docIsPublic} onCheckedChange={setDocIsPublic} />
                    <span className="text-sm text-muted-foreground">{docIsPublic ? t("cases.new_case.public") : t("cases.new_case.private")}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setDocsOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => uploadDocsMutation.mutate()}
                disabled={!docFile || uploadDocsMutation.isPending}
              >
                {uploadDocsMutation.isPending ? t("common.loading") : t("common.upload")}
              </Button>
            </div>

            {Array.isArray(timeline) && timeline.length ? (
              <div className="rounded-md border p-4 space-y-2">
                <div className="text-sm font-medium">{t("cases.timeline")}</div>
                <div className="space-y-2">
                  {timeline.map((e: any) => (
                    <div key={e.id} className="text-sm">
                      <div className="text-muted-foreground">
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}
                      </div>
                      <div>
                        {String(e.eventType)}
                        {e.toStatus ? <span>{" "}→ {statusLabel(e.toStatus)}</span> : null}
                        {e.note ? <span className="text-muted-foreground"> — {String(e.note)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cases.delete_confirm_title", { defaultValue: t("common.confirm") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cases.delete_confirm_description", {
                defaultValue: "هل أنت متأكد من حذف هذه القضية؟ لا يمكن التراجع عن هذا الإجراء.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteCaseMutation.mutate();
              }}
            >
              {deleteCaseMutation.isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isBen) return <PortalLayout>{page}</PortalLayout>;
  if (isLawyerPortalRoute) return <LawyerPortalLayout>{page}</LawyerPortalLayout>;
  return <Layout>{page}</Layout>;
}
