import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { judicialServicesAPI } from "@/lib/api";
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

type JudicialServiceRow = any;
type DocumentRow = any;

export default function PortalMyRequests() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);

  const {
    data: services,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["judicial-services", "my"],
    queryFn: async () => (await judicialServicesAPI.listMy()) as JudicialServiceRow[],
  });

  const {
    data: attachments,
    isLoading: loadingAttachments,
    error: attachmentsError,
  } = useQuery({
    queryKey: ["judicial-services", activeServiceId, "attachments"],
    enabled: Boolean(activeServiceId),
    queryFn: async () => (await judicialServicesAPI.listAttachments(String(activeServiceId))) as DocumentRow[],
  });

  const sorted = useMemo(() => {
    const list = Array.isArray(services) ? [...services] : [];
    list.sort((a, b) => {
      const ad = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [services]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("portal.my_requests")}</CardTitle>
          <Button variant="outline" onClick={() => refetch()}>
            {t("common.refresh") ?? "Refresh"}
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
            <div className="text-sm text-destructive">{getErrorMessage(error, t)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>{t("app.status")}</TableHead>
                  <TableHead>{t("app.priority")}</TableHead>
                  <TableHead>{t("app.date")}</TableHead>
                  <TableHead>{t("app.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length ? (
                  sorted.map((js) => (
                    <TableRow key={String(js.id)}>
                      <TableCell className="font-mono text-xs">
                        {String(js.serviceNumber || "—")}
                      </TableCell>
                      <TableCell className="font-medium">{String(js.title || "")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{String(js.status || "")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{String(js.priority || "")}</Badge>
                      </TableCell>
                      <TableCell>
                        {js.createdAt ? new Date(js.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveServiceId(String(js.id));
                            setOpen(true);
                          }}
                        >
                          Attachments
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("common.empty") ?? t("common.no_data") ?? "No requests yet."}
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
          if (!next) setActiveServiceId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>

          {loadingAttachments ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : attachmentsError ? (
            <div className="text-sm text-destructive">{getErrorMessage(attachmentsError, t)}</div>
          ) : (
            <div className="space-y-2">
              {(attachments || []).length ? (
                (attachments || []).map((doc: any) => (
                  <div
                    key={String(doc.id)}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {String(doc.title || doc.fileName || "Document")}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {String(doc.fileName || "")} {doc.size ? `• ${doc.size} bytes` : ""}
                      </div>
                    </div>
                    <a className="shrink-0" href={String(doc.fileUrl || "#")} target="_blank" rel="noreferrer">
                      <Button size="sm">Download</Button>
                    </a>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No attachments.</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
