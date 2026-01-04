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

import { casesAPI, sessionsAPI } from "@/lib/api";
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

  const [title, setTitle] = useState<string>("");
  const [sessionNumber, setSessionNumber] = useState<string>("");
  const [gregorianDate, setGregorianDate] = useState<string>("");
  const [sessionLocation, setSessionLocation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");
  const [nextSessionDate, setNextSessionDate] = useState<string>("");

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

  const hijriPreview = useMemo(() => {
    if (!gregorianDate) return "";
    const d = new Date(gregorianDate);
    if (Number.isNaN(d.getTime())) return "";
    return toHijriString(d);
  }, [gregorianDate]);

  const createSessionMutation = useMutation({
    mutationFn: sessionsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setTitle("");
      setSessionNumber("");
      setGregorianDate("");
      setSessionLocation("");
      setNotes("");
      setOutcome("");
      setNextSessionDate("");
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
    if (!title.trim()) {
      toast.error(t("sessions.title_required"));
      return;
    }
    if (!gregorianDate) {
      toast.error(t("sessions.date_required"));
      return;
    }

    const gd = new Date(gregorianDate);
    if (Number.isNaN(gd.getTime())) {
      toast.error(t("sessions.date_invalid"));
      return;
    }

    createSessionMutation.mutate({
      caseId,
      title: title.trim(),
      sessionNumber: sessionNumber ? Number(sessionNumber) : null,
      gregorianDate: gd.toISOString(),
      hijriDate: hijriPreview || null,
      location: sessionLocation.trim() || null,
      notes: notes.trim() || null,
      outcome: outcome.trim() || null,
      nextSessionDate: nextSessionDate ? new Date(nextSessionDate).toISOString() : null,
    });
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
              <Label htmlFor="session-title">{t("sessions.title")}</Label>
              <Input
                id="session-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("sessions.title_placeholder")}
                data-testid="input-session-title"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-number">{t("sessions.session_number")}</Label>
              <Input
                id="session-number"
                type="number"
                value={sessionNumber}
                onChange={(e) => setSessionNumber(e.target.value)}
                placeholder={t("sessions.session_number_placeholder")}
                data-testid="input-session-number"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.gregorian_date")}</Label>
              <Input
                type="datetime-local"
                value={gregorianDate}
                onChange={(e) => setGregorianDate(e.target.value)}
                data-testid="input-session-gregorian-date"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.hijri_date")}</Label>
              <Input value={hijriPreview} readOnly data-testid="input-session-hijri-preview" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session-location">{t("sessions.location")}</Label>
              <Input
                id="session-location"
                value={sessionLocation}
                onChange={(e) => setSessionLocation(e.target.value)}
                placeholder={t("sessions.location_placeholder")}
                data-testid="input-session-location"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("sessions.next_session_date")}</Label>
              <Input
                type="datetime-local"
                value={nextSessionDate}
                onChange={(e) => setNextSessionDate(e.target.value)}
                data-testid="input-session-next-date"
              />
            </div>
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

          <div className="grid gap-2">
            <Label htmlFor="session-outcome">{t("sessions.outcome")}</Label>
            <Textarea
              id="session-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={t("sessions.outcome_placeholder")}
              data-testid="input-session-outcome"
            />
          </div>

          <div className="pt-2">
            <Button
              onClick={handleCreate}
              disabled={createSessionMutation.isPending}
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
