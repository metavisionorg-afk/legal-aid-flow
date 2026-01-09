import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Skeleton } from "@/components/ui/skeleton";

import { casesAPI, sessionsAPI, uploadsAPI } from "@/lib/api";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

function toHijriString(date: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

export default function Sessions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [path] = useLocation();
  const initialCaseId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("caseId") || "";
  }, [path]);

  const [caseId, setCaseId] = useState<string>(initialCaseId);

  useEffect(() => {
    setCaseId(initialCaseId);
  }, [initialCaseId]);

  const [dateGregorian, setDateGregorian] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [courtName, setCourtName] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [circuit, setCircuit] = useState<string>("");
  const [sessionType, setSessionType] = useState<string>("in_person");
  const [status, setStatus] = useState<string>("upcoming");
  const [meetingUrl, setMeetingUrl] = useState<string>("");
  const [requirements, setRequirements] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isConfidential, setIsConfidential] = useState<boolean>(false);
  const [reminderMinutes, setReminderMinutes] = useState<string>("");
  const [addToTimeline, setAddToTimeline] = useState<boolean>(true);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions", { caseId }],
    queryFn: () => (caseId ? sessionsAPI.getByCase(caseId) : sessionsAPI.getAll()),
  });

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: casesAPI.getAll,
  });

  const caseMap = useMemo(() => {
    const map = new Map<string, any>();
    (cases || []).forEach((c: any) => map.set(c.id, c));
    return map;
  }, [cases]);

  const gregorianDateTime = useMemo(() => {
    if (!dateGregorian || !time) return null;
    const d = new Date(`${dateGregorian}T${time}`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }, [dateGregorian, time]);

  const hijriPreview = useMemo(() => {
    if (!gregorianDateTime) return "";
    return toHijriString(gregorianDateTime);
  }, [gregorianDateTime]);

  const createSessionMutation = useMutation({
    mutationFn: sessionsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setDateGregorian("");
      setTime("");
      setCourtName("");
      setCity("");
      setCircuit("");
      setSessionType("in_person");
      setStatus("upcoming");
      setMeetingUrl("");
      setRequirements("");
      setNotes("");
      setIsConfidential(false);
      setReminderMinutes("");
      setAddToTimeline(true);
      setAttachments([]);
      toast.success(t("sessions.created"));
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleCreate = () => {
    if (!caseId) {
      toast.error(t("sessions.case_required"));
      return;
    }
    if (!dateGregorian) {
      toast.error(t("sessions.date_required"));
      return;
    }
    if (!time) {
      toast.error(t("sessions.time_required"));
      return;
    }
    if (!courtName.trim()) {
      toast.error(t("sessions.court_required"));
      return;
    }
    if (!city.trim()) {
      toast.error(t("sessions.city_required"));
      return;
    }
    if (sessionType === "remote" && !meetingUrl.trim()) {
      toast.error(t("sessions.meeting_url_required"));
      return;
    }

    const gd = new Date(`${dateGregorian}T${time}`);
    if (Number.isNaN(gd.getTime())) {
      toast.error(t("sessions.date_invalid"));
      return;
    }

    createSessionMutation.mutate({
      caseId,
      dateGregorian: gd.toISOString(),
      time,
      hijriDate: hijriPreview || null,
      sessionType,
      status,
      meetingUrl: meetingUrl.trim() || null,
      requirements: requirements.trim() || null,
      notes: notes.trim() || null,
      isConfidential,
      reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
      addToTimeline,
      courtName: courtName.trim(),
      city: city.trim(),
      circuit: circuit.trim() || null,
      attachments,
    });
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setUploading(true);
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadsAPI.upload(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
      toast.success(t("sessions.attachments_uploaded"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (storageKey: string) => {
    setAttachments((prev) => prev.filter((a: any) => a.storageKey !== storageKey));
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#new") {
      setTimeout(() => {
        document
          .getElementById("new-session")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [path]);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("app.sessions")}</h1>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("sessions.new_session")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4" id="new-session">
          <div className="grid gap-2">
            <Label>{t("sessions.case")}</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger data-testid="select-session-case">
                <SelectValue
                  placeholder={casesLoading ? t("common.loading") : t("sessions.select_case")}
                />
              </SelectTrigger>
              <SelectContent>
                {(cases || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.caseNumber} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("sessions.date_gregorian")}</Label>
              <Input
                type="date"
                value={dateGregorian}
                onChange={(e) => setDateGregorian(e.target.value)}
                data-testid="input-session-date"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.time")}</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="input-session-time"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.hijri_date")}</Label>
              <Input value={hijriPreview} readOnly data-testid="input-session-hijri-preview" />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-session-status">
                  <SelectValue placeholder={t("sessions.select_status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">{t("sessions.status_upcoming")}</SelectItem>
                  <SelectItem value="postponed">{t("sessions.status_postponed")}</SelectItem>
                  <SelectItem value="completed">{t("sessions.status_completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("sessions.status_cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.session_type")}</Label>
              <Select value={sessionType} onValueChange={setSessionType}>
                <SelectTrigger data-testid="select-session-type">
                  <SelectValue placeholder={t("sessions.select_session_type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">{t("sessions.type_in_person")}</SelectItem>
                  <SelectItem value="remote">{t("sessions.type_remote")}</SelectItem>
                  <SelectItem value="hybrid">{t("sessions.type_hybrid")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-meeting-url">{t("sessions.meeting_url")}</Label>
              <Input
                id="session-meeting-url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder={t("sessions.meeting_url_placeholder")}
                data-testid="input-session-meeting-url"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-court">{t("sessions.court_name")}</Label>
              <Input
                id="session-court"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
                placeholder={t("sessions.court_name_placeholder")}
                data-testid="input-session-court"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-city">{t("sessions.city")}</Label>
              <Input
                id="session-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("sessions.city_placeholder")}
                data-testid="input-session-city"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-circuit">{t("sessions.circuit")}</Label>
              <Input
                id="session-circuit"
                value={circuit}
                onChange={(e) => setCircuit(e.target.value)}
                placeholder={t("sessions.circuit_placeholder")}
                data-testid="input-session-circuit"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-reminder">{t("sessions.reminder_minutes")}</Label>
              <Input
                id="session-reminder"
                type="number"
                min={0}
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                placeholder={t("sessions.reminder_minutes_placeholder")}
                data-testid="input-session-reminder"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="session-requirements">{t("sessions.requirements")}</Label>
            <Textarea
              id="session-requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder={t("sessions.requirements_placeholder")}
              data-testid="input-session-requirements"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="session-notes">{t("sessions.notes")}</Label>
            <Textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("sessions.notes_placeholder")}
              data-testid="input-session-notes"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="grid gap-1">
                <Label>{t("sessions.confidential")}</Label>
              </div>
              <Switch checked={isConfidential} onCheckedChange={setIsConfidential} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="grid gap-1">
                <Label>{t("sessions.add_to_timeline")}</Label>
              </div>
              <Switch checked={addToTimeline} onCheckedChange={setAddToTimeline} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-attachments">{t("sessions.attachments")}</Label>
              <Input
                id="session-attachments"
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => void handleUploadFiles(e.target.files)}
                disabled={uploading}
                data-testid="input-session-attachments"
              />
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="grid gap-2">
              <Label>{t("sessions.attachments_list")}</Label>
              <div className="rounded-md border">
                {attachments.map((a: any) => (
                  <div key={a.storageKey} className="flex items-center justify-between gap-3 p-3 border-b last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.fileName}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.mimeType}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeAttachment(a.storageKey)}>
                      {t("common.remove")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleCreate}
              disabled={createSessionMutation.isPending || uploading}
              data-testid="button-create-session"
            >
              {t("common.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("sessions.case")}</TableHead>
              <TableHead>{t("sessions.title")}</TableHead>
              <TableHead>{t("sessions.gregorian_date")}</TableHead>
              <TableHead>{t("sessions.hijri_date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                </TableRow>
              ))
            ) : sessions && sessions.length > 0 ? (
              sessions.map((s: any) => {
                const c = caseMap.get(s.caseId);
                return (
                  <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                    <TableCell className="font-medium">
                      {c ? `${c.caseNumber} — ${c.title}` : s.caseId}
                    </TableCell>
                    <TableCell>{s.title}</TableCell>
                    <TableCell>{new Date(s.gregorianDate).toLocaleString()}</TableCell>
                    <TableCell>{s.hijriDate || toHijriString(new Date(s.gregorianDate))}</TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  {t("sessions.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
