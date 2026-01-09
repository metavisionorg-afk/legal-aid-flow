import { useMemo, useState } from "react";
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

import { beneficiariesAPI, tasksAPI, uploadsAPI, usersAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import type { Beneficiary, Task, User } from "@shared/schema";

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

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export default function Tasks() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("follow_up");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [lawyerId, setLawyerId] = useState<string>("");
  const [caseId, setCaseId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

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

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!title.trim()) throw new Error("Title is required");
      if (!beneficiaryId) throw new Error("Beneficiary is required");

      return tasksAPI.create({
        beneficiaryId,
        title: title.trim(),
        description: description.trim() || null,
        taskType,
        priority,
        lawyerId: lawyerId || null,
        caseId: caseId.trim() ? caseId.trim() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
    },
    onSuccess: async () => {
      toast.success("Task created");
      setTitle("");
      setDescription("");
      setBeneficiaryId("");
      setLawyerId("");
      setCaseId("");
      setDueDate("");
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
                <Label>{t("app.actions")}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
              </div>

              <div className="space-y-2">
                <Label>{t("app.assigned_to")}</Label>
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loadingBeneficiaries ? t("common.loading") : "Select beneficiary"}
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
                <Label>Lawyer (optional)</Label>
                <Select value={lawyerId} onValueChange={setLawyerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingUsers ? t("common.loading") : "Select lawyer"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {lawyers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("app.status")}</Label>
                <Select value={taskType} onValueChange={(v) => setTaskType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((tt) => (
                      <SelectItem key={tt} value={tt}>
                        {tt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("app.priority")}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("app.date")}</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Case ID (optional)</Label>
                <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="case uuid" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("intake.description")}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
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
                    <TableHead>Title</TableHead>
                    <TableHead>{t("app.assigned_to")}</TableHead>
                    <TableHead>Lawyer</TableHead>
                    <TableHead>{t("app.priority")}</TableHead>
                    <TableHead>{t("app.status")}</TableHead>
                    <TableHead>Attachments</TableHead>
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
                          <Badge variant="secondary">{task.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              task.status === "completed"
                                ? "default"
                                : task.status === "cancelled"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {task.status}
                          </Badge>
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
                                View / Add
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Task attachments</DialogTitle>
                              </DialogHeader>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Add attachment</Label>
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
                                      <span className="text-sm">Visible to beneficiary</span>
                                    </div>
                                    <Button
                                      onClick={() => addAttachmentMutation.mutate()}
                                      disabled={addAttachmentMutation.isPending || !attachFile}
                                    >
                                      {addAttachmentMutation.isPending ? t("common.loading") : "Attach"}
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Existing attachments</Label>
                                  {loadingAttachments ? (
                                    <div className="space-y-2">
                                      <Skeleton className="h-10 w-full" />
                                      <Skeleton className="h-10 w-full" />
                                    </div>
                                  ) : (attachments || []).length === 0 ? (
                                    <div className="text-sm text-muted-foreground">No attachments</div>
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
                                              {a.isPublic ? "Public" : "Internal"}
                                            </div>
                                          </div>
                                          <a
                                            className="text-sm underline"
                                            href={a.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Download
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
                            {task.status === "completed" ? "Reopen" : "Complete"}
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
