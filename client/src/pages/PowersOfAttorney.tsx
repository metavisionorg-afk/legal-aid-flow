import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { beneficiariesAPI, casesAPI, powersOfAttorneyAPI, uploadsAPI, usersAPI } from "@/lib/api";

import type { Beneficiary, Case, PowerOfAttorney, User } from "@shared/schema";

type PowerOfAttorneyRow = PowerOfAttorney;

type UploadMeta = {
  storageKey: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

function toDatetimeLocalValue(isoDate: string | Date | null | undefined): string {
  if (!isoDate) return "";
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalToIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

export default function PowersOfAttorney() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PowerOfAttorneyRow | null>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [showExpiring, setShowExpiring] = useState(false);

  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [caseId, setCaseId] = useState<string>("");
  const [lawyerId, setLawyerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [scope, setScope] = useState<string>("");
  const [restrictions, setRestrictions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<UploadMeta[]>([]);

  const resetForm = () => {
    setEditing(null);
    setBeneficiaryId("");
    setCaseId("");
    setLawyerId("");
    setIssueDate("");
    setExpiryDate("");
    setScope("");
    setRestrictions("");
    setNotes("");
    setIsActive(true);
    setPendingFiles([]);
    setExistingAttachments([]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const loadAttachments = async (id: string) => {
    const docs = (await powersOfAttorneyAPI.listAttachments(id)) as UploadMeta[];
    setExistingAttachments(docs);
  };

  const openEdit = async (row: PowerOfAttorneyRow) => {
    setEditing(row);
    setBeneficiaryId(String((row as any).beneficiaryId || ""));
    setCaseId(String((row as any).caseId || ""));
    setLawyerId(String((row as any).lawyerId || ""));
    setIssueDate(toDatetimeLocalValue((row as any).issueDate));
    setExpiryDate(toDatetimeLocalValue((row as any).expiryDate));
    setScope(String((row as any).scope || ""));
    setRestrictions(String((row as any).restrictions || ""));
    setNotes(String((row as any).notes || ""));
    setIsActive(Boolean((row as any).isActive));
    setPendingFiles([]);
    setExistingAttachments([]);
    setDialogOpen(true);
    await loadAttachments(row.id);
  };

  const { data: poaData, isLoading: poaLoading } = useQuery({
    queryKey: ["power-of-attorney", showExpiring],
    queryFn: async () => {
      if (showExpiring) return (await powersOfAttorneyAPI.expiring(30)) as PowerOfAttorneyRow[];
      return (await powersOfAttorneyAPI.list()) as PowerOfAttorneyRow[];
    },
  });

  const { data: beneficiariesData } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: async () => (await beneficiariesAPI.getAll()) as Beneficiary[],
  });

  const { data: casesData } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => (await casesAPI.getAll()) as Case[],
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await usersAPI.getAll()) as User[],
  });

  const beneficiaries = useMemo(() => (beneficiariesData || []) as Beneficiary[], [beneficiariesData]);
  const cases = useMemo(() => (casesData || []) as Case[], [casesData]);
  const users = useMemo(() => (usersData || []) as User[], [usersData]);

  const beneficiaryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of beneficiaries) map.set(String((b as any).id), String((b as any).fullName || ""));
    return map;
  }, [beneficiaries]);

  const caseLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cases) {
      map.set(String((c as any).id), `${String((c as any).caseNumber || "")}${(c as any).title ? ` — ${(c as any).title}` : ""}`);
    }
    return map;
  }, [cases]);

  const lawyerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) map.set(String((u as any).id), String((u as any).fullName || ""));
    return map;
  }, [users]);

  const lawyers = useMemo(() => users.filter((u: any) => u.userType === "staff" && u.role === "lawyer"), [users]);

  const rows = useMemo(() => {
    const all = (poaData || []) as PowerOfAttorneyRow[];
    const q = filterQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r: any) => {
      const poaNum = String(r.poaNumber || "").toLowerCase();
      const bName = String(beneficiaryNameById.get(String(r.beneficiaryId)) || "").toLowerCase();
      return poaNum.includes(q) || bName.includes(q);
    });
  }, [poaData, filterQuery, beneficiaryNameById]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const bId = beneficiaryId.trim();
      if (!bId) throw new Error(t("poa.errors.beneficiary_required"));

      const scopeTrimmed = scope.trim();
      if (!scopeTrimmed) throw new Error(t("poa.errors.scope_required"));

      const issue = issueDate.trim();
      if (!issue) throw new Error(t("poa.errors.issue_date_required"));

      const payloadBase: any = {
        beneficiaryId: bId,
        caseId: caseId.trim() ? caseId.trim() : null,
        lawyerId: lawyerId.trim() ? lawyerId.trim() : null,
        issueDate: fromDatetimeLocalToIso(issue),
        expiryDate: expiryDate.trim() ? fromDatetimeLocalToIso(expiryDate.trim()) : null,
        scope: scopeTrimmed,
        restrictions: restrictions.trim() ? restrictions.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        isActive: Boolean(isActive),
      };

      if (!editing) {
        const attachments: UploadMeta[] = [];
        for (const file of pendingFiles) {
          const meta = (await uploadsAPI.upload(file)) as UploadMeta;
          attachments.push(meta);
        }
        return powersOfAttorneyAPI.create({
          ...payloadBase,
          attachments,
        });
      }

      // Update fields first
      const updated = await powersOfAttorneyAPI.update(editing.id, payloadBase);

      // Then add any new attachments
      if (pendingFiles.length) {
        const metas: UploadMeta[] = [];
        for (const file of pendingFiles) {
          const meta = (await uploadsAPI.upload(file)) as UploadMeta;
          metas.push(meta);
        }
        await powersOfAttorneyAPI.addAttachments(editing.id, { documents: metas });
      }

      return updated;
    },
    onSuccess: async () => {
      toast({ title: editing ? t("poa.toasts.updated") : t("poa.toasts.created") });
      setDialogOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["power-of-attorney"] });
      await queryClient.invalidateQueries({ queryKey: ["power-of-attorney", true] });
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => powersOfAttorneyAPI.delete(id),
    onSuccess: async () => {
      toast({ title: t("poa.toasts.deleted") });
      await queryClient.invalidateQueries({ queryKey: ["power-of-attorney"] });
      await queryClient.invalidateQueries({ queryKey: ["power-of-attorney", true] });
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("nav.powers_of_attorney")}</h1>
            <p className="text-muted-foreground">{t("poa.subtitle")}</p>
          </div>
          <Button onClick={openCreate}>
            {t("poa.actions.add")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("poa.table.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
              <div className="w-full md:max-w-sm">
                <Input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t("poa.search_placeholder")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showExpiring} onCheckedChange={(v) => setShowExpiring(Boolean(v))} />
                <span className="text-sm text-muted-foreground">{t("poa.filters.expiring_30")}</span>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("poa.fields.poa_number")}</TableHead>
                    <TableHead>{t("poa.fields.beneficiary")}</TableHead>
                    <TableHead>{t("poa.fields.case")}</TableHead>
                    <TableHead>{t("poa.fields.lawyer")}</TableHead>
                    <TableHead>{t("poa.fields.issue_date")}</TableHead>
                    <TableHead>{t("poa.fields.expiry_date")}</TableHead>
                    <TableHead className="w-[120px]">{t("poa.fields.active")}</TableHead>
                    <TableHead className="text-right rtl:text-left w-[240px]">{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poaLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-44 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : rows.length ? (
                    rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{String(r.poaNumber || "-")}</TableCell>
                        <TableCell>{beneficiaryNameById.get(String(r.beneficiaryId)) || "-"}</TableCell>
                        <TableCell>{r.caseId ? (caseLabelById.get(String(r.caseId)) || String(r.caseId)) : "-"}</TableCell>
                        <TableCell>{r.lawyerId ? (lawyerNameById.get(String(r.lawyerId)) || String(r.lawyerId)) : "-"}</TableCell>
                        <TableCell>{r.issueDate ? new Date(r.issueDate as any).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{r.expiryDate ? new Date(r.expiryDate as any).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{r.isActive ? t("poa.values.active") : t("poa.values.inactive")}</TableCell>
                        <TableCell className="text-right rtl:text-left">
                          <div className="flex justify-end rtl:justify-start gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                              {t("poa.actions.edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(powersOfAttorneyAPI.printUrl(r.id), "_blank")}
                            >
                              {t("poa.actions.print")}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(r.id)}>
                              {t("poa.actions.delete")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {t("poa.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("poa.dialog.edit_title") : t("poa.dialog.add_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("poa.fields.beneficiary")}</Label>
              <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("poa.placeholders.select_beneficiary")} />
                </SelectTrigger>
                <SelectContent>
                  {beneficiaries.map((b: any) => (
                    <SelectItem key={String(b.id)} value={String(b.id)}>
                      {String(b.fullName)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.case")}</Label>
              <Select value={caseId || ""} onValueChange={(v) => setCaseId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("poa.placeholders.select_case_optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("poa.values.none")}</SelectItem>
                  {cases.map((c: any) => (
                    <SelectItem key={String(c.id)} value={String(c.id)}>
                      {String(c.caseNumber || "")}{c.title ? ` — ${String(c.title)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.lawyer")}</Label>
              <Select value={lawyerId || ""} onValueChange={(v) => setLawyerId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("poa.placeholders.select_lawyer_optional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("poa.values.none")}</SelectItem>
                  {lawyers.map((u: any) => (
                    <SelectItem key={String(u.id)} value={String(u.id)}>
                      {String(u.fullName)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("poa.fields.issue_date")}</Label>
                <Input type="datetime-local" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("poa.fields.expiry_date")}</Label>
                <Input type="datetime-local" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.scope")}</Label>
              <Input value={scope} onChange={(e) => setScope(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.restrictions")}</Label>
              <Input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.notes")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={(v) => setIsActive(Boolean(v))} />
              <span className="text-sm text-muted-foreground">{t("poa.fields.active")}</span>
            </div>

            <div className="grid gap-2">
              <Label>{t("poa.fields.attachments")}</Label>
              <Input
                type="file"
                multiple
                onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
              />
              {existingAttachments.length ? (
                <div className="text-sm text-muted-foreground">
                  {t("poa.attachments.count", { count: existingAttachments.length })}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
