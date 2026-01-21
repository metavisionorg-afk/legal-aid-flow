import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { BeneficiaryRegistrationCard } from "@/components/beneficiaries/BeneficiaryRegistrationCard";
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
import { Archive, Eye, Filter, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { beneficiariesAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useEffect, useState } from "react";

export default function Beneficiaries() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const statusLabel = (s: unknown) =>
    t(`beneficiaries.status.${String(s ?? "")}`, { defaultValue: String(s ?? "") });

  const [createOpen, setCreateOpen] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<"view" | "edit">("view");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<any>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteBeneficiary, setPendingDeleteBeneficiary] = useState<any>(null);

  const [editDraft, setEditDraft] = useState<{
    fullName: string;
    phone: string;
    email: string;
    city: string;
  }>({
    fullName: "",
    phone: "",
    email: "",
    city: "",
  });

  useEffect(() => {
    if (!selectedBeneficiary) return;
    setEditDraft({
      fullName: String(selectedBeneficiary.fullName ?? ""),
      phone: String(selectedBeneficiary.phone ?? ""),
      email: String(selectedBeneficiary.email ?? ""),
      city: String(selectedBeneficiary.city ?? ""),
    });
  }, [selectedBeneficiary?.id]);

  const { data: beneficiaries, isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
  });

  const updateBeneficiaryMutation = useMutation({
    mutationFn: async (input: { id: string; updates: any }) => {
      return beneficiariesAPI.update(String(input.id), input.updates);
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      if (selectedBeneficiary && String((updated as any)?.id) === String(selectedBeneficiary?.id)) {
        setSelectedBeneficiary(updated);
      }
      toast({ title: t("common.success", { defaultValue: "Success" }) });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: getErrorMessage(err, t) || t("common.error", { defaultValue: "Error" }),
        variant: "destructive",
      });
    },
  });

  const deleteBeneficiaryMutation = useMutation({
    mutationFn: async (id: string) => beneficiariesAPI.delete(String(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      setDeleteDialogOpen(false);
      setPendingDeleteBeneficiary(null);
      toast({ title: t("common.success", { defaultValue: "Success" }) });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: getErrorMessage(err, t) || t("common.error", { defaultValue: "Error" }),
        variant: "destructive",
      });
    },
  });

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('app.beneficiaries')}</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-beneficiary">
              <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t('app.add_new')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("beneficiaries.add_title")}</DialogTitle>
            </DialogHeader>

            <div className="flex justify-center">
              <BeneficiaryRegistrationCard
                mode="staff"
                onCancel={() => setCreateOpen(false)}
                onSuccess={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
                  setCreateOpen(false);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("beneficiaries.columns.id", { defaultValue: "المعرّف" })}</TableHead>
              <TableHead>{t('intake.full_name')}</TableHead>
              <TableHead>{t('intake.id_number')}</TableHead>
              <TableHead>{t('intake.phone')}</TableHead>
              <TableHead>{t('app.status')}</TableHead>
              <TableHead className="text-right rtl:text-left">{t('app.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                </TableRow>
              ))
            ) : beneficiaries && beneficiaries.length > 0 ? (
              beneficiaries.map((ben: any) => (
                <TableRow
                  key={ben.id}
                  data-testid={`row-beneficiary-${ben.id}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement | null)?.closest?.('[data-row-action="true"]')) return;
                    setSelectedBeneficiary(ben);
                    setDetailsMode("view");
                    setDetailsOpen(true);
                  }}
                >
                  <TableCell className="font-medium">{ben.id.slice(0, 8)}</TableCell>
                  <TableCell>{ben.fullName}</TableCell>
                  <TableCell>{ben.idNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{ben.phone}</TableCell>
                  <TableCell>
                    <Badge variant={ben.status === "active" ? "default" : "secondary"}>
                      {statusLabel(ben.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right rtl:text-left">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="icon"
                        data-row-action="true"
                        aria-label={t("common.edit", { defaultValue: "Edit" })}
                        data-testid={`button-edit-${ben.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBeneficiary(ben);
                          setDetailsMode("edit");
                          setDetailsOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="secondary"
                        size="icon"
                        data-row-action="true"
                        aria-label={t("common.view", { defaultValue: "View" })}
                        data-testid={`button-view-${ben.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBeneficiary(ben);
                          setDetailsMode("view");
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      {String(ben.status || "") === "archived" ? (
                        <Button
                          variant="secondary"
                          size="icon"
                          data-row-action="true"
                          aria-label={t("common.restore", { defaultValue: "Restore" })}
                          data-testid={`button-restore-${ben.id}`}
                          disabled={updateBeneficiaryMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateBeneficiaryMutation.mutate({ id: String(ben.id), updates: { status: "active" } });
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="icon"
                          data-row-action="true"
                          aria-label={t("beneficiaries.actions.archive", { defaultValue: "Archive" })}
                          data-testid={`button-archive-${ben.id}`}
                          disabled={updateBeneficiaryMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateBeneficiaryMutation.mutate({ id: String(ben.id), updates: { status: "archived" } });
                          }}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="destructive"
                        size="icon"
                        data-row-action="true"
                        aria-label={t("common.delete", { defaultValue: "Delete" })}
                        data-testid={`button-delete-${ben.id}`}
                        disabled={deleteBeneficiaryMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteBeneficiary(ben);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("beneficiaries.empty", { defaultValue: "لا يوجد مستفيدون" })}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedBeneficiary(null);
            setDetailsMode("view");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailsMode === "edit"
                ? t("beneficiaries.actions.edit_details", { defaultValue: "Edit details" })
                : t("beneficiaries.actions.view_profile", { defaultValue: "View profile" })}
            </DialogTitle>
          </DialogHeader>

          {selectedBeneficiary ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={String(selectedBeneficiary.status) === "active" ? "default" : "secondary"}>
                  {statusLabel(selectedBeneficiary.status)}
                </Badge>
                <div className="text-sm text-muted-foreground">{String(selectedBeneficiary.idNumber || "")}</div>
              </div>

              {detailsMode === "edit" ? (
                <div className="rounded-md border p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("intake.full_name")}</Label>
                      <Input
                        value={editDraft.fullName}
                        onChange={(e) => setEditDraft((p) => ({ ...p, fullName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("intake.phone")}</Label>
                      <Input
                        value={editDraft.phone}
                        onChange={(e) => setEditDraft((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("auth.email", { defaultValue: "Email" })}</Label>
                      <Input
                        value={editDraft.email}
                        onChange={(e) => setEditDraft((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("beneficiary_register.city", { defaultValue: "City" })}</Label>
                      <Input
                        value={editDraft.city}
                        onChange={(e) => setEditDraft((p) => ({ ...p, city: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setDetailsMode("view")}>
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </Button>
                    <Button
                      onClick={() =>
                        updateBeneficiaryMutation.mutate({
                          id: String(selectedBeneficiary.id),
                          updates: {
                            fullName: editDraft.fullName,
                            phone: editDraft.phone,
                            email: editDraft.email,
                            city: editDraft.city,
                          },
                        })
                      }
                      disabled={updateBeneficiaryMutation.isPending}
                      data-testid="button-beneficiary-save"
                    >
                      {updateBeneficiaryMutation.isPending
                        ? t("common.loading", { defaultValue: "Loading" })
                        : t("common.save", { defaultValue: "Save" })}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("intake.full_name")}: </span>
                    {String(selectedBeneficiary.fullName || "")}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">{t("intake.phone")}: </span>
                    {String(selectedBeneficiary.phone || "")}
                  </div>
                  {selectedBeneficiary.email ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("auth.email", { defaultValue: "Email" })}: </span>
                      {String(selectedBeneficiary.email || "")}
                    </div>
                  ) : null}
                  {selectedBeneficiary.city ? (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("beneficiary_register.city", { defaultValue: "City" })}: </span>
                      {String(selectedBeneficiary.city || "")}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setDetailsMode("edit")}>
                      {t("beneficiaries.actions.edit_details", { defaultValue: "Edit details" })}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete", { defaultValue: "Delete" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("beneficiaries.actions.delete_confirm", { defaultValue: "Are you sure you want to delete this beneficiary?" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeleteBeneficiary?.id) return;
                deleteBeneficiaryMutation.mutate(String(pendingDeleteBeneficiary.id));
              }}
            >
              {deleteBeneficiaryMutation.isPending
                ? t("common.loading", { defaultValue: "Loading" })
                : t("common.delete", { defaultValue: "Delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
