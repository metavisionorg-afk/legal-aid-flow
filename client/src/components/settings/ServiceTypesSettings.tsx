import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { serviceTypesAPI } from "@/lib/api";

type ServiceTypeRow = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
};

export function ServiceTypesSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceTypeRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nameAr: "",
    nameEn: "",
  });

  const { data: serviceTypes = [], isLoading } = useQuery<ServiceTypeRow[]>({
    queryKey: ["settings", "service-types"],
    queryFn: () => serviceTypesAPI.listAll(),
  });

  const createOrUpdateMutation = useMutation({
    mutationFn: async (payload: { nameAr: string; nameEn?: string | null }) => {
      if (editing) {
        return serviceTypesAPI.update(editing.id, payload);
      }
      return serviceTypesAPI.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "service-types"] });
      toast.success(
        editing
          ? t("settings.service_types.updated_success")
          : t("settings.service_types.created_success")
      );
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        t("settings.service_types.save_failed");
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) =>
      serviceTypesAPI.toggle(input.id, input.isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "service-types"] });
      toast.success(t("settings.service_types.toggle_success"));
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        t("settings.service_types.toggle_failed");
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => serviceTypesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "service-types"] });
      toast.success(t("settings.service_types.deleted_success"));
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        t("settings.service_types.delete_failed");
      toast.error(message);
    },
  });

  const resetForm = () => {
    setEditing(null);
    setFormData({ nameAr: "", nameEn: "" });
  };

  const handleOpenDialog = (item?: ServiceTypeRow) => {
    if (item) {
      setEditing(item);
      setFormData({ nameAr: item.nameAr, nameEn: item.nameEn || "" });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) {
      toast.error(t("settings.service_types.name_ar_required"));
      return;
    }
    createOrUpdateMutation.mutate({
      nameAr: formData.nameAr.trim(),
      nameEn: formData.nameEn.trim() || null,
    });
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    toggleMutation.mutate({ id, isActive: !currentActive });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">
            {t("settings.service_types.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.service_types.description")}
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setDialogOpen(true);
            } else {
              setDialogOpen(false);
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              {t("settings.service_types.add_new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t("settings.service_types.edit_title")
                  : t("settings.service_types.create_title")}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? t("settings.service_types.edit_description")
                  : t("settings.service_types.create_description")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nameAr">
                  {t("settings.service_types.name_ar")}
                  <span className="text-red-500 mr-1">*</span>
                </Label>
                <Input
                  id="nameAr"
                  value={formData.nameAr}
                  onChange={(e) =>
                    setFormData({ ...formData, nameAr: e.target.value })
                  }
                  dir="rtl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameEn">
                  {t("settings.service_types.name_en")}
                </Label>
                <Input
                  id="nameEn"
                  value={formData.nameEn}
                  onChange={(e) =>
                    setFormData({ ...formData, nameEn: e.target.value })
                  }
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                  disabled={createOrUpdateMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createOrUpdateMutation.isPending}>
                  {createOrUpdateMutation.isPending
                    ? t("common.saving")
                    : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.service_types.name_ar")}</TableHead>
              <TableHead>{t("settings.service_types.name_en")}</TableHead>
              <TableHead>{t("settings.service_types.key")}</TableHead>
              <TableHead>{t("settings.service_types.status")}</TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("settings.service_types.no_types")}
                </TableCell>
              </TableRow>
            ) : (
              serviceTypes.map((item) => (
                <TableRow key={item.id}>
                  <TableCell dir="rtl" className="font-medium">
                    {item.nameAr}
                  </TableCell>
                  <TableCell>{item.nameEn || "-"}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {item.key}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive
                        ? t("settings.service_types.active")
                        : t("settings.service_types.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(item.id, item.isActive)}
                        disabled={toggleMutation.isPending}
                      >
                        {item.isActive ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.service_types.delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.service_types.delete_confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
