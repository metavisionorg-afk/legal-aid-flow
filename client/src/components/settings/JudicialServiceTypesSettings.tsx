import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { JudicialServiceType } from "@shared/schema";
import { judicialServiceTypesAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const QUERY_KEY = ["settings", "judicial-service-types"] as const;

export default function JudicialServiceTypesSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JudicialServiceType | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [search, setSearch] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY as any });
    await queryClient.invalidateQueries({ queryKey: ["judicial-service-types", "active"] as any });
  };

  const resetForm = () => {
    setEditing(null);
    setNameAr("");
    setNameEn("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: JudicialServiceType) => {
    setEditing(row);
    setNameAr(String((row as any).nameAr || ""));
    setNameEn(String((row as any).nameEn || ""));
    setDialogOpen(true);
  };

  const listQuery = useQuery({
    queryKey: QUERY_KEY as any,
    queryFn: () => judicialServiceTypesAPI.listAll(),
  });

  const rows = useMemo(() => {
    const list = Array.isArray(listQuery.data) ? ((listQuery.data as any) as JudicialServiceType[]) : [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = [r.nameAr, r.nameEn].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [listQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedAr = nameAr.trim();
      if (!trimmedAr) throw new Error(t("settings_judicial_service_types.errors.name_ar_required"));

      const payload = {
        nameAr: trimmedAr,
        nameEn: nameEn.trim() ? nameEn.trim() : null,
      };

      if (editing) {
        return judicialServiceTypesAPI.update(editing.id, payload);
      }

      return judicialServiceTypesAPI.create(payload);
    },
    onSuccess: async () => {
      toast({
        title: editing
          ? t("settings_judicial_service_types.toasts.updated")
          : t("settings_judicial_service_types.toasts.created"),
      });
      setDialogOpen(false);
      resetForm();
      await invalidate();
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
      judicialServiceTypesAPI.toggle(input.id, input.isActive),
    onSuccess: invalidate,
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => judicialServiceTypesAPI.delete(id),
    onSuccess: async () => {
      toast({ title: t("settings_judicial_service_types.toasts.deleted") });
      await invalidate();
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive",
      }),
  });

  const errorText = listQuery.isError ? getErrorMessage(listQuery.error, t) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t("settings_judicial_service_types.title")}</h2>
          <p className="text-muted-foreground">{t("settings_judicial_service_types.subtitle")}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-judicial-service-type">
          {t("settings_judicial_service_types.actions.add")}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search") || "Search..."}
        />
      </div>

      {errorText ? <div className="text-sm text-destructive">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_judicial_service_types.table.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings_judicial_service_types.fields.name_ar")}</TableHead>
                  <TableHead>{t("settings_judicial_service_types.fields.name_en")}</TableHead>
                  <TableHead className="w-[140px]">{t("settings_judicial_service_types.fields.active")}</TableHead>
                  <TableHead className="text-right rtl:text-left w-[180px]">
                    {t("common.actions") || "Actions"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-32 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length ? (
                  rows.map((r) => (
                    <TableRow key={r.id} data-testid={`row-judicial-service-type-${r.id}`}>
                      <TableCell className="font-medium">{r.nameAr}</TableCell>
                      <TableCell>{r.nameEn || "-"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(r.isActive)}
                          onCheckedChange={(next) => toggleMutation.mutate({ id: r.id, isActive: Boolean(next) })}
                          aria-label={t("settings_judicial_service_types.fields.active")}
                        />
                      </TableCell>
                      <TableCell className="text-right rtl:text-left">
                        <div className="flex justify-end rtl:justify-start gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(r)}
                            data-testid={`button-edit-${r.id}`}
                          >
                            {t("settings_judicial_service_types.actions.edit")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMutation.mutate(r.id)}
                            data-testid={`button-delete-${r.id}`}
                            disabled={deleteMutation.isPending}
                          >
                            {t("settings_judicial_service_types.actions.delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t("common.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("settings_judicial_service_types.dialog.edit_title")
                : t("settings_judicial_service_types.dialog.add_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="judicial-service-type-name-ar">
                {t("settings_judicial_service_types.fields.name_ar")}
              </Label>
              <Input
                id="judicial-service-type-name-ar"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={t("settings_judicial_service_types.placeholders.name_ar") || "Enter Arabic name"}
                data-testid="input-judicial-service-type-name-ar"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="judicial-service-type-name-en">
                {t("settings_judicial_service_types.fields.name_en")}
              </Label>
              <Input
                id="judicial-service-type-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t("settings_judicial_service_types.placeholders.name_en") || "Enter English name"}
                data-testid="input-judicial-service-type-name-en"
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
              data-testid="button-cancel-judicial-service-type"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-judicial-service-type"
            >
              {saveMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
