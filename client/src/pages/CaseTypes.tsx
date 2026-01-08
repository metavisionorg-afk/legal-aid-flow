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
import { caseTypesAPI } from "@/lib/api";

type CaseTypeRow = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
  sortOrder: number;
  casesCount?: number;
};

export default function CaseTypes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CaseTypeRow | null>(null);

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sortOrder, setSortOrder] = useState<string>("0");

  const resetForm = () => {
    setEditing(null);
    setNameAr("");
    setNameEn("");
    setSortOrder("0");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: CaseTypeRow) => {
    setEditing(row);
    setNameAr(row.nameAr || "");
    setNameEn(row.nameEn || "");
    setSortOrder(String(row.sortOrder ?? 0));
    setDialogOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["case-types"],
    queryFn: async () => (await caseTypesAPI.listAll()) as CaseTypeRow[],
  });

  const rows = useMemo(() => (data || []) as CaseTypeRow[], [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedAr = nameAr.trim();
      if (!trimmedAr) throw new Error(t("case_types.errors.name_ar_required"));

      const parsedSortOrder = sortOrder.trim() ? Number(sortOrder) : 0;
      const sort = Number.isFinite(parsedSortOrder) ? Math.trunc(parsedSortOrder) : 0;

      if (editing) {
        return caseTypesAPI.update(editing.id, {
          nameAr: trimmedAr,
          nameEn: nameEn.trim() ? nameEn.trim() : null,
          sortOrder: sort,
        });
      }

      return caseTypesAPI.create({
        nameAr: trimmedAr,
        nameEn: nameEn.trim() ? nameEn.trim() : null,
        sortOrder: sort,
      });
    },
    onSuccess: async () => {
      toast({ title: editing ? t("case_types.toasts.updated") : t("case_types.toasts.created") });
      setDialogOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["case-types"] });
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) =>
      caseTypesAPI.toggle(input.id, input.isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["case-types"] });
      await queryClient.invalidateQueries({ queryKey: ["case-types", "active"] });
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => caseTypesAPI.delete(id),
    onSuccess: async () => {
      toast({ title: t("case_types.toasts.deleted") });
      await queryClient.invalidateQueries({ queryKey: ["case-types"] });
      await queryClient.invalidateQueries({ queryKey: ["case-types", "active"] });
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
            <h1 className="text-3xl font-bold tracking-tight">{t("nav.case_types")}</h1>
            <p className="text-muted-foreground">{t("case_types.subtitle")}</p>
          </div>
          <Button onClick={openCreate} data-testid="button-add-case-type">
            {t("case_types.actions.add")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("case_types.table.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("case_types.fields.name_ar")}</TableHead>
                    <TableHead>{t("case_types.fields.name_en")}</TableHead>
                    <TableHead className="w-[120px]">{t("case_types.fields.sort_order")}</TableHead>
                    <TableHead className="w-[140px]">{t("case_types.fields.active")}</TableHead>
                    <TableHead className="w-[140px]">{t("case_types.fields.cases_count")}</TableHead>
                    <TableHead className="text-right rtl:text-left w-[180px]">{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-32 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : rows.length ? (
                    rows.map((r) => (
                      <TableRow key={r.id} data-testid={`row-case-type-${r.id}`}>
                        <TableCell className="font-medium">{r.nameAr}</TableCell>
                        <TableCell>{r.nameEn || "-"}</TableCell>
                        <TableCell>{r.sortOrder ?? 0}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={Boolean(r.isActive)}
                              onCheckedChange={(next) =>
                                toggleMutation.mutate({ id: r.id, isActive: Boolean(next) })
                              }
                              aria-label={t("case_types.fields.active")}
                            />
                          </div>
                        </TableCell>
                        <TableCell>{Number(r.casesCount || 0)}</TableCell>
                        <TableCell className="text-right rtl:text-left">
                          <div className="flex justify-end rtl:justify-start gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(r)}
                              data-testid={`button-edit-${r.id}`}
                            >
                              {t("case_types.actions.edit")}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteMutation.mutate(r.id)}
                              disabled={Number(r.casesCount || 0) > 0}
                              data-testid={`button-delete-${r.id}`}
                            >
                              {t("case_types.actions.delete")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {t("case_types.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("case_types.hint_delete")}
            </p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t("case_types.dialog.edit_title") : t("case_types.dialog.add_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="case-type-name-ar">{t("case_types.fields.name_ar")}</Label>
              <Input
                id="case-type-name-ar"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                data-testid="input-name-ar"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-type-name-en">{t("case_types.fields.name_en")}</Label>
              <Input
                id="case-type-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                data-testid="input-name-en"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-type-sort">{t("case_types.fields.sort_order")}</Label>
              <Input
                id="case-type-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                data-testid="input-sort-order"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
