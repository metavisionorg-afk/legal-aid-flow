import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { tasksAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type TaskRow = any;
type DocumentRow = any;

export default function PortalTasks() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const {
    data: tasks,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["tasks", "my"],
    queryFn: async () => (await tasksAPI.getMy()) as TaskRow[],
  });

  const {
    data: attachments,
    isLoading: loadingAttachments,
    error: attachmentsError,
  } = useQuery({
    queryKey: ["tasks", activeTaskId, "attachments"],
    enabled: Boolean(activeTaskId),
    queryFn: async () => (await tasksAPI.listAttachments(String(activeTaskId))) as DocumentRow[],
  });

  const sorted = useMemo(() => {
    const list = Array.isArray(tasks) ? [...tasks] : [];
    list.sort((a, b) => {
      const ad = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [tasks]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("portal.my_tasks")}</CardTitle>
          <Button variant="outline" onClick={() => refetch()}>
            {t("common.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">
              {getErrorMessage(error, t)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("portal_tasks.table.title")}</TableHead>
                  <TableHead>{t("app.status")}</TableHead>
                  <TableHead>{t("app.priority")}</TableHead>
                  <TableHead>{t("app.date")}</TableHead>
                  <TableHead>{t("app.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length ? (
                  sorted.map((task) => (
                    <TableRow key={String(task.id)}>
                      <TableCell className="font-medium">{String(task.title || "")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(task.status || "")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{String(task.priority || "")}</Badge>
                      </TableCell>
                      <TableCell>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : t("portal_tasks.placeholder.none")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveTaskId(String(task.id));
                            setOpen(true);
                          }}
                        >
                          {t("portal_tasks.actions.attachments")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("portal_tasks.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActiveTaskId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("portal_tasks.attachments.title")}</DialogTitle>
          </DialogHeader>

          {loadingAttachments ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : attachmentsError ? (
            <div className="text-sm text-destructive">
              {getErrorMessage(attachmentsError, t)}
            </div>
          ) : (
            <div className="space-y-2">
              {(attachments || []).length ? (
                (attachments || []).map((doc: any) => {
                  const fileName = typeof doc?.fileName === "string" ? doc.fileName : "";

                  const sizeValue =
                    typeof doc?.size === "number"
                      ? doc.size
                      : typeof doc?.size === "string"
                        ? Number(doc.size)
                        : null;

                  const size =
                    typeof sizeValue === "number" && Number.isFinite(sizeValue) && sizeValue >= 0
                      ? sizeValue
                      : null;

                  const metaText =
                    fileName && size !== null
                      ? t("portal_tasks.attachments.meta_with_size", { fileName, size })
                      : fileName
                        ? t("portal_tasks.attachments.meta_without_size", { fileName })
                        : size !== null
                          ? t("portal_tasks.attachments.meta_size_only", { size })
                          : null;

                  return (
                    <div key={String(doc.id)} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{String(doc.title || doc.fileName || t("documents.document"))}</div>
                        {metaText ? (
                          <div className="text-xs text-muted-foreground truncate">{metaText}</div>
                        ) : null}
                      </div>
                      {doc.fileUrl ? (
                        <a
                          className="shrink-0"
                          href={String(doc.fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm">{t("documents.download")}</Button>
                        </a>
                      ) : (
                        <Button size="sm" disabled>
                          {t("portal_tasks.actions.no_file")}
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground">{t("portal_tasks.attachments.empty")}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
