import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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

function toHijriLabel(dateInput: string, t: (key: string, options?: any) => string): string {
  if (!dateInput) return "";
  try {
    // `dateInput` is expected as yyyy-mm-dd
    const date = new Date(`${dateInput}T00:00:00`);
    if (Number.isNaN(date.getTime())) return t("tasks.form.hijri_pending");

    // Use built-in Islamic calendar formatting (no extra deps).
    const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return fmt.format(date);
  } catch {
    return t("tasks.form.hijri_pending");
  }
}

export default function Tasks() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const statusLabel = (s: string) => t(`tasks.status.${s}`, { defaultValue: String(s) });
  const priorityLabel = (p: string) => t(`tasks.priority.${p}`, { defaultValue: String(p) });

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
      if (!user?.id) throw new Error("Not authenticated");
      if (!title.trim()) throw new Error("Title is required");
      if (!beneficiaryId) throw new Error("Beneficiary is required");
      if (!dueDate) throw new Error("Gregorian date is required");

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
      toast.success("Task created");
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
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      tasksAPI.update(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => tasksAPI.delete(id),
    onSuccess: async () => {
      toast.success("Task deleted");
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
      if (!attachmentsTaskId) throw new Error("Task not selected");
      if (!attachFile) throw new Error("File is required");

      const uploaded = await uploadsAPI.upload(attachFile);
      return tasksAPI.addAttachments(String(attachmentsTaskId), {
        isPublic: attachIsPublic,
        documents: [uploaded],
      });
    },
    onSuccess: async () => {
      toast.success("Attachment added");
      setAttachFile(null);
      await queryClient.invalidateQueries({ queryKey: ["taskAttachments", attachmentsTaskId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("app.tasks")}</h1>
          <p className="text-muted-foreground">{t("app.add_new")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("app.add_new")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("tasks.form.title_required")}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("tasks.form.title_placeholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("tasks.form.beneficiary_required")}</Label>
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingBeneficiaries
                          ? t("common.loading")
                          : t("tasks.form.select_beneficiary")
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
                <Label>{t("tasks.form.lawyer_optional")}</Label>
                <Select
                  value={lawyerId}
                  onValueChange={(v) => setLawyerId(v === LAWYER_NONE_VALUE ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingUsers ? t("common.loading") : t("tasks.form.select_lawyer_optional")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LAWYER_NONE_VALUE}>{t("tasks.form.none")}</SelectItem>
                    {lawyers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("tasks.form.task_type")}</Label>
                <Select value={taskType} onValueChange={(v) => setTaskType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((tt) => (
                      <SelectItem key={tt} value={tt}>
                        {t(`tasks.types.${tt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("tasks.form.priority")}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`tasks.priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("tasks.form.gregorian_date_required")}</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{t("tasks.form.hijri_date")}: </span>
                  {hijriDateLabel || t("tasks.form.hijri_pending")}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("tasks.form.case_optional")}</Label>
                <Select
                  value={caseId ?? CASE_NONE_VALUE}
                  onValueChange={(v) => setCaseId(v === CASE_NONE_VALUE ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loadingCases ? t("common.loading") : t("tasks.form.select_case_optional")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CASE_NONE_VALUE}>{t("tasks.form.none")}</SelectItem>
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
                <Label>{t("tasks.form.description")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("tasks.form.description_placeholder")}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("tasks.form.attachments")}</Label>
                <div className="flex flex-col gap-3">
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      uploadAttachmentsMutation.mutate(files);
                      // allow selecting same files again later
                      e.currentTarget.value = "";
                    }}
                  />

                  {(newAttachments || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("tasks.form.attachments_empty")}</div>
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
                            {t("common.delete")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={notifyBeneficiary}
                    onCheckedChange={(v) => setNotifyBeneficiary(Boolean(v))}
                  />
                  <span className="text-sm">{t("tasks.form.notify_beneficiary")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={showInPortal}
                    onCheckedChange={(v) => setShowInPortal(Boolean(v))}
                  />
                  <span className="text-sm">{t("tasks.form.show_in_portal")}</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => createTaskMutation.mutate()}
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("app.tasks")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTasks ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tasks.table.title")}</TableHead>
                    <TableHead>{t("app.assigned_to")}</TableHead>
                    <TableHead>{t("tasks.table.lawyer")}</TableHead>
                    <TableHead>{t("app.priority")}</TableHead>
                    <TableHead>{t("app.status")}</TableHead>
                    <TableHead>{t("tasks.table.attachments")}</TableHead>
                    <TableHead>{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tasks || []).map((task) => {
                    const beneficiary = (task as any).beneficiaryId
                      ? beneficiariesById.get(String((task as any).beneficiaryId))
                      : null;
                    const assignee = usersById.get(task.assignedTo);
                    const lawyer = (task as any).lawyerId
                      ? usersById.get(String((task as any).lawyerId))
                      : null;
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>{beneficiary?.fullName || assignee?.fullName || task.assignedTo}</TableCell>
                        <TableCell>{lawyer?.fullName || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{priorityLabel(String(task.priority))}</Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const status = String(task.status);
                            return (
                          <Badge
                            variant={
                              status === "completed"
                                ? "default"
                                : status === "cancelled"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {statusLabel(status)}
                          </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAttachmentsTaskId(task.id);
                                  setAttachIsPublic(true);
                                  setAttachFile(null);
                                }}
                              >
                                {t("tasks.actions.view_add", { defaultValue: "عرض/إضافة" })}
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{t("tasks.dialog.task_attachments")}</DialogTitle>
                              </DialogHeader>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>{t("tasks.dialog.add_attachment")}</Label>
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
                                      <span className="text-sm">{t("tasks.dialog.visible_to_beneficiary")}</span>
                                    </div>
                                    <Button
                                      onClick={() => addAttachmentMutation.mutate()}
                                      disabled={addAttachmentMutation.isPending || !attachFile}
                                    >
                                      {addAttachmentMutation.isPending ? t("common.loading") : t("tasks.dialog.attach")}
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>{t("tasks.dialog.existing_attachments")}</Label>
                                  {loadingAttachments ? (
                                    <div className="space-y-2">
                                      <Skeleton className="h-10 w-full" />
                                      <Skeleton className="h-10 w-full" />
                                    </div>
                                  ) : (attachments || []).length === 0 ? (
                                    <div className="text-sm text-muted-foreground">{t("tasks.dialog.no_attachments")}</div>
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
                                              {a.isPublic ? t("tasks.dialog.public") : t("tasks.dialog.internal")}
                                            </div>
                                          </div>
                                          <a
                                            className="text-sm underline"
                                            href={a.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {t("common.download")}
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
                        <TableCell className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateTaskMutation.mutate({
                                id: task.id,
                                patch: {
                                  status:
                                    task.status === "completed" ? "pending" : "completed",
                                  completedAt:
                                    task.status === "completed" ? null : new Date(),
                                },
                              })
                            }
                            disabled={updateTaskMutation.isPending}
                          >
                            {task.status === "completed"
                              ? t("tasks.actions.reopen", { defaultValue: "إعادة فتح" })
                              : t("tasks.actions.complete", { defaultValue: "إكمال" })}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteTaskMutation.mutate(task.id)}
                            disabled={deleteTaskMutation.isPending}
                          >
                            {t("common.delete")}
                          </Button>
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
    </Layout>
  );
}
