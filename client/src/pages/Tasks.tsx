import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Filter, Pencil, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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

import { beneficiariesAPI, casesAPI, tasksAPI, uploadsAPI, usersAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import type { Beneficiary, Case as CaseRow, Task, User } from "@shared/schema";

type AttachmentRow = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  size?: number | null;
  isPublic?: boolean | null;
  createdAt?: string | Date | null;
};

const TASK_TYPES = [
  "follow_up",
  "document_preparation",
  "court_appearance",
  "client_meeting",
  "research",
  "other",
] as const;

const LAWYER_NONE_VALUE = "__none__";
const CASE_NONE_VALUE = "__no_case__";

const PRIORITIES = ["low", "medium", "high"] as const;

const STATUS_DEFAULTS: Record<string, string> = {
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
  follow_up: "متابعة",
  awaiting_beneficiary: "بانتظار المستفيد",
  under_review: "قيد المراجعة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

const PRIORITY_DEFAULTS: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  urgent: "عاجل",
};

const TASK_TYPE_DEFAULTS: Record<string, string> = {
  follow_up: "متابعة",
  document_preparation: "إعداد مستندات",
  court_appearance: "حضور جلسة",
  client_meeting: "اجتماع مع العميل",
  research: "بحث",
  other: "أخرى",
};

function toHijriLabel(dateInput: string, t: (key: string, options?: any) => string): string {
  if (!dateInput) return "";
  try {
    // `dateInput` is expected as yyyy-mm-dd
    const date = new Date(`${dateInput}T00:00:00`);
    if (Number.isNaN(date.getTime())) return t("tasks.form.hijri_pending", { defaultValue: "غير متاح" });

    // Use built-in Islamic calendar formatting (no extra deps).
    const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return fmt.format(date);
  } catch {
    return t("tasks.form.hijri_pending", { defaultValue: "غير متاح" });
  }
}

function toYyyyMmDd(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(value: unknown): string {
  const s = toYyyyMmDd(value);
  return s || "—";
}

export default function Tasks() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const statusLabel = (s: string) =>
    t(`tasks.status.${s}`, { defaultValue: STATUS_DEFAULTS[s] ?? t("tasks.status.unknown", { defaultValue: "غير معروف" }) });
  const priorityLabel = (p: string) =>
    t(`tasks.priority.${p}`, { defaultValue: PRIORITY_DEFAULTS[p] ?? t("tasks.priority.unknown", { defaultValue: "غير معروف" }) });
  const taskTypeLabel = (tt: string) =>
    t(`tasks.types.${tt}`, { defaultValue: TASK_TYPE_DEFAULTS[tt] ?? t("tasks.types.other", { defaultValue: "أخرى" }) });

  const statusVariant = (s: string) => {
    const status = String(s || "");
    if (status === "completed") return "default" as const;
    if (status === "cancelled") return "destructive" as const;
    if (status === "in_progress") return "secondary" as const;
    if (status === "under_review") return "secondary" as const;
    if (status === "awaiting_beneficiary") return "outline" as const;
    return "secondary" as const;
  };

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogMode, setTaskDialogMode] = useState<"create" | "view" | "edit">("create");
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("follow_up");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [lawyerId, setLawyerId] = useState<string | undefined>(undefined);
  const [caseId, setCaseId] = useState<string | undefined>(undefined);
  const [dueDate, setDueDate] = useState<string>(""); // yyyy-mm-dd
  const [hijriDateLabel, setHijriDateLabel] = useState<string>("");

  const [notifyBeneficiary, setNotifyBeneficiary] = useState<boolean>(true);
  const [showInPortal, setShowInPortal] = useState<boolean>(true);

  const [newAttachments, setNewAttachments] = useState<any[]>([]);

  const [attachmentsTaskId, setAttachmentsTaskId] = useState<string | null>(null);
  const [attachIsPublic, setAttachIsPublic] = useState<boolean>(true);
  const [attachFile, setAttachFile] = useState<File | null>(null);

  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await tasksAPI.getAll()) as Task[],
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await usersAPI.getAll()) as Omit<User, "password">[],
  });

  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: async () => (await beneficiariesAPI.getAll()) as Beneficiary[],
  });

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => (await casesAPI.getAll()) as CaseRow[],
  });

  const usersById = useMemo(() => {
    const map = new Map<string, Omit<User, "password">>();
    (users || []).forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const beneficiariesById = useMemo(() => {
    const map = new Map<string, Beneficiary>();
    (beneficiaries || []).forEach((b) => map.set(b.id, b));
    return map;
  }, [beneficiaries]);

  const lawyers = useMemo(() => {
    return (users || []).filter((u) => u.userType === "staff" && (u as any).role === "lawyer");
  }, [users]);

  const casesForBeneficiary = useMemo(() => {
    const all = cases || [];
    if (!beneficiaryId) return all;
    return all.filter((c) => String((c as any).beneficiaryId || "") === String(beneficiaryId));
  }, [cases, beneficiaryId]);

  useEffect(() => {
    if (!dueDate) {
      setHijriDateLabel("");
      return;
    }
    setHijriDateLabel(toHijriLabel(dueDate, t));
  }, [dueDate, t]);

  const uploadAttachmentsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: any[] = [];
      for (const file of files) {
        uploaded.push(await uploadsAPI.upload(file));
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      if (!uploaded.length) return;
      setNewAttachments((prev) => [...prev, ...uploaded]);
      toast.success(t("tasks.toasts.attachments_uploaded", { count: uploaded.length }));
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error(t("tasks.errors.not_authenticated", { defaultValue: "غير مصرح" }));
      if (!title.trim()) throw new Error(t("tasks.errors.title_required", { defaultValue: "عنوان المهمة مطلوب" }));
      if (!beneficiaryId) throw new Error(t("tasks.errors.beneficiary_required", { defaultValue: "المستفيد مطلوب" }));
      if (!dueDate) throw new Error(t("tasks.errors.date_required", { defaultValue: "التاريخ مطلوب" }));

      const created = await tasksAPI.create({
        beneficiaryId,
        title: title.trim(),
        description: description.trim() || null,
        taskType,
        priority,
        lawyerId: lawyerId ?? null,
        caseId: caseId ? caseId : null,
        dueDate: new Date(`${dueDate}T00:00:00`).toISOString(),
        notifyBeneficiary,
        showInPortal,
      });

      if (newAttachments.length) {
        await tasksAPI.addAttachments(String((created as any).id), {
          isPublic: showInPortal,
          documents: newAttachments,
        });
      }

      return created;
    },
    onSuccess: async () => {
      toast.success(t("tasks.toasts.created", { defaultValue: "تم إنشاء المهمة" }));
      setTitle("");
      setDescription("");
      setBeneficiaryId("");
      setLawyerId(undefined);
      setCaseId(undefined);
      setDueDate("");
      setHijriDateLabel("");
      setNotifyBeneficiary(true);
      setShowInPortal(true);
      setNewAttachments([]);
      setTaskDialogOpen(false);
      setTaskDialogMode("create");
      setActiveTask(null);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<any> }) => tasksAPI.update(id, patch),
    onSuccess: async () => {
      toast.success(t("tasks.toasts.updated", { defaultValue: "تم تحديث المهمة" }));
      setTaskDialogOpen(false);
      setTaskDialogMode("create");
      setActiveTask(null);
      setNewAttachments([]);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => tasksAPI.delete(id),
    onSuccess: async () => {
      toast.success(t("tasks.toasts.deleted", { defaultValue: "تم حذف المهمة" }));
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const { data: attachments, isLoading: loadingAttachments } = useQuery({
    queryKey: ["taskAttachments", attachmentsTaskId],
    queryFn: async () => (await tasksAPI.listAttachments(String(attachmentsTaskId))) as AttachmentRow[],
    enabled: Boolean(attachmentsTaskId),
  });

  const addAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!attachmentsTaskId) throw new Error(t("tasks.errors.task_not_selected", { defaultValue: "لم يتم اختيار مهمة" }));
      if (!attachFile) throw new Error(t("tasks.errors.file_required", { defaultValue: "الملف مطلوب" }));

      const uploaded = await uploadsAPI.upload(attachFile);
      return tasksAPI.addAttachments(String(attachmentsTaskId), {
        isPublic: attachIsPublic,
        documents: [uploaded],
      });
    },
    onSuccess: async () => {
      toast.success(t("tasks.toasts.attachment_added", { defaultValue: "تمت إضافة المرفق" }));
      setAttachFile(null);
      await queryClient.invalidateQueries({ queryKey: ["taskAttachments", attachmentsTaskId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const openCreateDialog = () => {
    setTaskDialogMode("create");
    setActiveTask(null);
    setTitle("");
    setDescription("");
    setTaskType("follow_up");
    setPriority("medium");
    setBeneficiaryId("");
    setLawyerId(undefined);
    setCaseId(undefined);
    setDueDate("");
    setHijriDateLabel("");
    setNotifyBeneficiary(true);
    setShowInPortal(true);
    setNewAttachments([]);
    setTaskDialogOpen(true);
  };

  const openViewDialog = (task: Task) => {
    setTaskDialogMode("view");
    setActiveTask(task);
    setTaskDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setTaskDialogMode("edit");
    setActiveTask(task);
    setTitle(String((task as any).title || ""));
    setDescription(String((task as any).description || ""));
    setTaskType(String((task as any).taskType || "follow_up") as any);
    setPriority(String((task as any).priority || "medium") as any);
    setBeneficiaryId(String((task as any).beneficiaryId || ""));
    setLawyerId((task as any).lawyerId ? String((task as any).lawyerId) : undefined);
    setCaseId((task as any).caseId ? String((task as any).caseId) : undefined);
    setDueDate(toYyyyMmDd((task as any).dueDate));
    setHijriDateLabel("");
    setNotifyBeneficiary(true);
    setShowInPortal(Boolean((task as any).showInPortal ?? true));
    setNewAttachments([]);
    setTaskDialogOpen(true);
  };

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = Array.isArray(tasks) ? tasks : [];

    return all
      .filter((task) => {
        const status = String((task as any).status || "");
        const pr = String((task as any).priority || "");
        const tt = String((task as any).taskType || "");
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (priorityFilter !== "all" && pr !== priorityFilter) return false;
        if (typeFilter !== "all" && tt !== typeFilter) return false;
        return true;
      })
      .filter((task) => {
        if (!q) return true;
        const beneficiary = (task as any).beneficiaryId
          ? beneficiariesById.get(String((task as any).beneficiaryId))
          : null;
        const lawyer = (task as any).lawyerId ? usersById.get(String((task as any).lawyerId)) : null;

        const hay = [
          String((task as any).title || ""),
          String((task as any).description || ""),
          String(beneficiary?.fullName || ""),
          String(lawyer?.fullName || ""),
          String((task as any).taskType || ""),
          String((task as any).priority || ""),
          String((task as any).status || ""),
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      });
  }, [tasks, search, statusFilter, priorityFilter, typeFilter, beneficiariesById, usersById]);

  const TaskForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("tasks.form.title_required", { defaultValue: "عنوان المهمة" })}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("tasks.form.title_placeholder", { defaultValue: "اكتب عنوان المهمة" })}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.beneficiary_required", { defaultValue: "المستفيد" })}</Label>
          <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loadingBeneficiaries
                    ? t("common.loading")
                    : t("tasks.form.select_beneficiary", { defaultValue: "اختر المستفيد" })
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(beneficiaries || []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.lawyer_optional", { defaultValue: "المحامي (اختياري)" })}</Label>
          <Select
            value={lawyerId}
            onValueChange={(v) => setLawyerId(v === LAWYER_NONE_VALUE ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loadingUsers ? t("common.loading") : t("tasks.form.select_lawyer_optional", { defaultValue: "اختر المحامي" })
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LAWYER_NONE_VALUE}>{t("tasks.form.none", { defaultValue: "بدون" })}</SelectItem>
              {lawyers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.task_type", { defaultValue: "نوع المهمة" })}</Label>
          <Select value={taskType} onValueChange={(v) => setTaskType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((tt) => (
                <SelectItem key={tt} value={tt}>
                  {taskTypeLabel(tt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.priority", { defaultValue: "الأولوية" })}</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {priorityLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.gregorian_date_required", { defaultValue: "التاريخ (ميلادي)" })}</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("tasks.form.hijri_date", { defaultValue: "التاريخ (هجري)" })}: </span>
            {hijriDateLabel || t("tasks.form.hijri_pending", { defaultValue: "غير متاح" })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("tasks.form.case_optional", { defaultValue: "القضية (اختياري)" })}</Label>
          <Select
            value={caseId ?? CASE_NONE_VALUE}
            onValueChange={(v) => setCaseId(v === CASE_NONE_VALUE ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={loadingCases ? t("common.loading") : t("tasks.form.select_case_optional", { defaultValue: "اختر القضية" })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CASE_NONE_VALUE}>{t("tasks.form.none", { defaultValue: "بدون" })}</SelectItem>
              {(casesForBeneficiary || []).map((c) => (
                <SelectItem key={(c as any).id} value={String((c as any).id)}>
                  {String((c as any).caseNumber || "")}
                  {" — "}
                  {String((c as any).title || "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>{t("tasks.form.description", { defaultValue: "الوصف" })}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("tasks.form.description_placeholder", { defaultValue: "اكتب وصف المهمة" })}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>{t("tasks.form.attachments", { defaultValue: "المرفقات" })}</Label>
          <div className="flex flex-col gap-3">
            <Input
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                uploadAttachmentsMutation.mutate(files);
                e.currentTarget.value = "";
              }}
            />

            {(newAttachments || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("tasks.form.attachments_empty", { defaultValue: "لا توجد مرفقات" })}</div>
            ) : (
              <div className="space-y-2">
                {newAttachments.map((a: any) => (
                  <div
                    key={String(a.storageKey || a.fileUrl || a.fileName)}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{String(a.fileName || "")}</div>
                      <div className="text-xs text-muted-foreground truncate">{String(a.fileUrl || "")}</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setNewAttachments((prev) =>
                          prev.filter((x: any) => String(x.storageKey || x.fileUrl) !== String(a.storageKey || a.fileUrl)),
                        )
                      }
                    >
                      {t("tasks.actions.remove_attachment", { defaultValue: "إزالة" })}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox checked={notifyBeneficiary} onCheckedChange={(v) => setNotifyBeneficiary(Boolean(v))} />
            <span className="text-sm">{t("tasks.form.notify_beneficiary", { defaultValue: "إشعار المستفيد" })}</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={showInPortal} onCheckedChange={(v) => setShowInPortal(Boolean(v))} />
            <span className="text-sm">{t("tasks.form.show_in_portal", { defaultValue: "إظهار في بوابة المستفيد" })}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={async () => {
            if (taskDialogMode === "edit" && activeTask?.id) {
              const patch: any = {
                beneficiaryId: beneficiaryId || null,
                title: title.trim(),
                description: description.trim() || null,
                taskType,
                priority,
                lawyerId: lawyerId ?? null,
                caseId: caseId ? caseId : null,
                dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
                showInPortal,
              };

              await updateTaskMutation.mutateAsync({ id: String(activeTask.id), patch });

              if (newAttachments.length) {
                await tasksAPI.addAttachments(String(activeTask.id), {
                  isPublic: showInPortal,
                  documents: newAttachments,
                });
                setNewAttachments([]);
                toast.success(t("tasks.toasts.attachments_added", { defaultValue: "تمت إضافة المرفقات" }));
              }

              await queryClient.invalidateQueries({ queryKey: ["tasks"] });
              return;
            }

            createTaskMutation.mutate();
          }}
          disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
        >
          {createTaskMutation.isPending || updateTaskMutation.isPending
            ? t("common.loading")
            : taskDialogMode === "edit"
              ? t("tasks.actions.save_changes", { defaultValue: "حفظ التعديلات" })
              : t("tasks.actions.save", { defaultValue: "حفظ" })}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setTaskDialogOpen(false)}
        >
          {t("tasks.actions.cancel", { defaultValue: "إلغاء" })}
        </Button>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button
            onClick={openCreateDialog}
            data-testid="button-add-task"
          >
            {t("tasks.actions.add", { defaultValue: "إضافة مهمة" })}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{t("app.tasks")}</h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tasks.filters.search", { defaultValue: "بحث" })}
                className="pl-9 rtl:pr-9 rtl:pl-3"
                data-testid="input-tasks-search"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setStatusFilter("all");
                setPriorityFilter("all");
                setTypeFilter("all");
              }}
              aria-label={t("tasks.filters.reset", { defaultValue: "إعادة ضبط الفلاتر" })}
              data-testid="button-tasks-filter"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("tasks.filters.status", { defaultValue: "الحالة" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tasks.filters.all", { defaultValue: "الكل" })}</SelectItem>
                {Object.keys(STATUS_DEFAULTS).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("tasks.filters.priority", { defaultValue: "الأولوية" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tasks.filters.all", { defaultValue: "الكل" })}</SelectItem>
                {Object.keys(PRIORITY_DEFAULTS).map((p) => (
                  <SelectItem key={p} value={p}>
                    {priorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("tasks.filters.type", { defaultValue: "نوع المهمة" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tasks.filters.all", { defaultValue: "الكل" })}</SelectItem>
                {TASK_TYPES.map((tt) => (
                  <SelectItem key={tt} value={tt}>
                    {taskTypeLabel(tt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tasks.table.title", { defaultValue: "عنوان المهمة" })}</TableHead>
                <TableHead>{t("tasks.table.beneficiary", { defaultValue: "المستفيد" })}</TableHead>
                <TableHead>{t("tasks.table.lawyer", { defaultValue: "المحامي" })}</TableHead>
                <TableHead>{t("tasks.table.type", { defaultValue: "نوع المهمة" })}</TableHead>
                <TableHead>{t("tasks.table.priority", { defaultValue: "الأولوية" })}</TableHead>
                <TableHead>{t("tasks.table.status", { defaultValue: "الحالة" })}</TableHead>
                <TableHead>{t("tasks.table.date", { defaultValue: "التاريخ" })}</TableHead>
                <TableHead>{t("tasks.table.attachments", { defaultValue: "المرفقات" })}</TableHead>
                <TableHead className="text-right rtl:text-left">{t("tasks.table.actions", { defaultValue: "الإجراءات" })}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loadingTasks ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTasks.length ? (
                filteredTasks.map((task) => {
                  const beneficiary = (task as any).beneficiaryId
                    ? beneficiariesById.get(String((task as any).beneficiaryId))
                    : null;
                  const lawyer = (task as any).lawyerId
                    ? usersById.get(String((task as any).lawyerId))
                    : null;
                  const status = String((task as any).status || "pending");
                  const pr = String((task as any).priority || "medium");
                  const tt = String((task as any).taskType || "other");

                  return (
                    <TableRow
                      key={task.id}
                      data-testid={`row-task-${task.id}`}
                      className="cursor-pointer"
                      onClick={() => openViewDialog(task)}
                    >
                      <TableCell className="font-medium max-w-[220px] truncate">{String((task as any).title || "")}</TableCell>
                      <TableCell>{beneficiary?.fullName || t("tasks.values.unknown", { defaultValue: "غير معروف" })}</TableCell>
                      <TableCell>{lawyer?.fullName || "—"}</TableCell>
                      <TableCell>{taskTypeLabel(tt)}</TableCell>
                      <TableCell>
                        <Badge variant={pr === "high" || pr === "urgent" ? "default" : "secondary"}>
                          {priorityLabel(pr)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
                      </TableCell>
                      <TableCell>{formatDisplayDate((task as any).dueDate)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Dialog>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttachmentsTaskId(task.id);
                              setAttachIsPublic(true);
                              setAttachFile(null);
                            }}
                          >
                            {t("tasks.actions.attachments", { defaultValue: "المرفقات" })}
                          </Button>
                          <DialogContent className="max-w-2xl w-[95vw] max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{t("tasks.dialog.task_attachments", { defaultValue: "مرفقات المهمة" })}</DialogTitle>
                            </DialogHeader>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>{t("tasks.dialog.add_attachment", { defaultValue: "إضافة مرفق" })}</Label>
                                <div className="flex flex-col gap-3">
                                  <Input
                                    type="file"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0] || null;
                                      setAttachFile(f);
                                    }}
                                  />
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={attachIsPublic}
                                      onCheckedChange={(v) => setAttachIsPublic(Boolean(v))}
                                    />
                                    <span className="text-sm">{t("tasks.dialog.visible_to_beneficiary", { defaultValue: "مرئي للمستفيد" })}</span>
                                  </div>
                                  <Button
                                    onClick={() => addAttachmentMutation.mutate()}
                                    disabled={addAttachmentMutation.isPending || !attachFile}
                                  >
                                    {addAttachmentMutation.isPending ? t("common.loading") : t("tasks.dialog.attach", { defaultValue: "إرفاق" })}
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>{t("tasks.dialog.existing_attachments", { defaultValue: "المرفقات الحالية" })}</Label>
                                {loadingAttachments ? (
                                  <div className="space-y-2">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                  </div>
                                ) : (attachments || []).length === 0 ? (
                                  <div className="text-sm text-muted-foreground">{t("tasks.dialog.no_attachments", { defaultValue: "لا توجد مرفقات" })}</div>
                                ) : (
                                  <div className="space-y-2">
                                    {(attachments || []).map((a) => (
                                      <div
                                        key={a.id}
                                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                                      >
                                        <div className="min-w-0">
                                          <div className="font-medium text-sm truncate">{a.fileName}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {a.isPublic
                                              ? t("tasks.dialog.public", { defaultValue: "عام" })
                                              : t("tasks.dialog.internal", { defaultValue: "داخلي" })}
                                          </div>
                                        </div>
                                        <a
                                          className="text-sm underline"
                                          href={a.fileUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {t("tasks.actions.download", { defaultValue: "تحميل" })}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                      <TableCell className="text-right rtl:text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(task);
                            }}
                            aria-label={t("tasks.actions.edit", { defaultValue: "تعديل" })}
                            data-testid={`button-edit-${task.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openViewDialog(task);
                            }}
                            aria-label={t("tasks.actions.view", { defaultValue: "معاينة" })}
                            data-testid={`button-view-${task.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteTask(task);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deleteTaskMutation.isPending}
                            aria-label={t("tasks.actions.delete", { defaultValue: "حذف" })}
                            data-testid={`button-delete-${task.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {t("tasks.empty", { defaultValue: "لا توجد مهام" })}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setTaskDialogMode("create");
            setActiveTask(null);
            setNewAttachments([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl w-[95vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {taskDialogMode === "create"
                ? t("tasks.dialog.create_title", { defaultValue: "إضافة مهمة" })
                : taskDialogMode === "edit"
                  ? t("tasks.dialog.edit_title", { defaultValue: "تعديل مهمة" })
                  : t("tasks.dialog.view_title", { defaultValue: "معاينة مهمة" })}
            </DialogTitle>
          </DialogHeader>

          {taskDialogMode === "view" ? (
            <div className="space-y-4">
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-lg font-semibold">{String((activeTask as any)?.title || "")}</div>
                <div className="text-sm text-muted-foreground">{String((activeTask as any)?.description || "") || "—"}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.beneficiary", { defaultValue: "المستفيد" })}</div>
                  <div className="font-medium">
                    {(() => {
                      const bId = (activeTask as any)?.beneficiaryId;
                      const b = bId ? beneficiariesById.get(String(bId)) : null;
                      return b?.fullName || t("tasks.values.unknown", { defaultValue: "غير معروف" });
                    })()}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.lawyer", { defaultValue: "المحامي" })}</div>
                  <div className="font-medium">
                    {(() => {
                      const lId = (activeTask as any)?.lawyerId;
                      const l = lId ? usersById.get(String(lId)) : null;
                      return l?.fullName || "—";
                    })()}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.type", { defaultValue: "نوع المهمة" })}</div>
                  <div className="font-medium">{taskTypeLabel(String((activeTask as any)?.taskType || "other"))}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.priority", { defaultValue: "الأولوية" })}</div>
                  <div className="font-medium">{priorityLabel(String((activeTask as any)?.priority || "medium"))}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.status", { defaultValue: "الحالة" })}</div>
                  <div className="font-medium">{statusLabel(String((activeTask as any)?.status || "pending"))}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">{t("tasks.fields.date", { defaultValue: "التاريخ" })}</div>
                  <div className="font-medium">{formatDisplayDate((activeTask as any)?.dueDate)}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("tasks.fields.hijri", { defaultValue: "هجري" })}: {toHijriLabel(formatDisplayDate((activeTask as any)?.dueDate), t) || "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setTaskDialogOpen(false)}
                >
                  {t("tasks.actions.close", { defaultValue: "إغلاق" })}
                </Button>
              </div>
            </div>
          ) : (
            <TaskForm />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks.delete_confirm_title", { defaultValue: "تأكيد الحذف" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks.delete_confirm_description", { defaultValue: "هل أنت متأكد من حذف هذه المهمة؟" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteTask(null)}>
              {t("tasks.actions.cancel", { defaultValue: "إلغاء" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = pendingDeleteTask?.id;
                if (!id) return;
                setDeleteDialogOpen(false);
                setPendingDeleteTask(null);
                await deleteTaskMutation.mutateAsync(String(id));
              }}
            >
              {t("tasks.actions.delete", { defaultValue: "حذف" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
