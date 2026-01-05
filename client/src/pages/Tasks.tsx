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

import { tasksAPI, usersAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import type { Task, User } from "@shared/schema";

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
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await tasksAPI.getAll()) as Task[],
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await usersAPI.getAll()) as Omit<User, "password">[],
  });

  const usersById = useMemo(() => {
    const map = new Map<string, Omit<User, "password">>();
    (users || []).forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!title.trim()) throw new Error("Title is required");
      if (!assignedTo) throw new Error("Assignee is required");

      return tasksAPI.create({
        title: title.trim(),
        description: description.trim() || null,
        taskType,
        priority,
        assignedTo,
        // Some environments validate assignedBy in schema; send it defensively.
        assignedBy: user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: "pending",
        caseId: null,
        completedAt: null,
      });
    },
    onSuccess: async () => {
      toast.success("Task created");
      setTitle("");
      setDescription("");
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
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingUsers ? t("common.loading") : "Select user"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(users || []).map((u) => (
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
                    <TableHead>{t("app.priority")}</TableHead>
                    <TableHead>{t("app.status")}</TableHead>
                    <TableHead>{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tasks || []).map((task) => {
                    const assignee = usersById.get(task.assignedTo);
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>{assignee?.fullName || task.assignedTo}</TableCell>
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
