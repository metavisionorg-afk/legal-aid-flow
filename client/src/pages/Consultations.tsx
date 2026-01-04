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
import { Checkbox } from "@/components/ui/checkbox";
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

import { beneficiariesAPI, consultationsAPI, usersAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import type { User } from "@shared/schema";

const UNASSIGNED_LAWYER = "__unassigned__";

const STATUSES = ["pending", "scheduled", "completed", "cancelled"] as const;

export default function Consultations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [path] = useLocation();
  const initialBeneficiaryId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("beneficiaryId") || "";
  }, [path]);

  const [beneficiaryId, setBeneficiaryId] = useState<string>(initialBeneficiaryId);
  const [lawyerId, setLawyerId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [consultationType, setConsultationType] = useState<string>("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [followUpRequired, setFollowUpRequired] = useState<boolean>(false);

  useEffect(() => {
    setBeneficiaryId(initialBeneficiaryId);
  }, [initialBeneficiaryId]);

  const { data: consultations, isLoading: consultationsLoading } = useQuery({
    queryKey: ["consultations", { beneficiaryId }],
    queryFn: () =>
      beneficiaryId ? consultationsAPI.getByBeneficiary(beneficiaryId) : consultationsAPI.getAll(),
  });

  const { data: beneficiaries, isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersAPI.getAll,
  });

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach((u: any) => map.set(u.id, u));
    return map;
  }, [users]);

  const beneficiaryMap = useMemo(() => {
    const map = new Map<string, any>();
    (beneficiaries || []).forEach((b: any) => map.set(b.id, b));
    return map;
  }, [beneficiaries]);

  const createConsultationMutation = useMutation({
    mutationFn: consultationsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      setLawyerId(null);
      setTopic("");
      setDescription("");
      setConsultationType("");
      setStatus("pending");
      setScheduledDate("");
      setNotes("");
      setFollowUpRequired(false);
      toast.success(t("consultations.created"));
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const updateConsultationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => consultationsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleCreate = () => {
    if (!beneficiaryId) {
      toast.error(t("consultations.beneficiary_required"));
      return;
    }
    if (!topic.trim()) {
      toast.error(t("consultations.topic_required"));
      return;
    }
    if (!description.trim()) {
      toast.error(t("consultations.description_required"));
      return;
    }

    createConsultationMutation.mutate({
      beneficiaryId,
      lawyerId: lawyerId ?? null,
      topic: topic.trim(),
      description: description.trim(),
      consultationType: consultationType.trim() || null,
      status,
      scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : null,
      notes: notes.trim() || null,
      followUpRequired,
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#new") {
      setTimeout(() => {
        document.getElementById("new-consultation")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [path]);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("app.consultations")}</h1>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("consultations.new_consultation")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4" id="new-consultation">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("consultations.beneficiary")}</Label>
              <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                <SelectTrigger data-testid="select-consultation-beneficiary">
                  <SelectValue
                    placeholder={beneficiariesLoading ? t("common.loading") : t("consultations.select_beneficiary")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(beneficiaries || []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.fullName} ({b.idNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("consultations.lawyer")}</Label>
              <Select
                value={lawyerId ?? UNASSIGNED_LAWYER}
                onValueChange={(val) => setLawyerId(val === UNASSIGNED_LAWYER ? null : val)}
              >
                <SelectTrigger data-testid="select-consultation-lawyer">
                  <SelectValue placeholder={usersLoading ? t("common.loading") : t("consultations.select_lawyer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_LAWYER}>{t("consultations.unassigned")}</SelectItem>
                  {(users || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="consultation-topic">{t("consultations.topic")}</Label>
            <Input
              id="consultation-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("consultations.topic_placeholder")}
              data-testid="input-consultation-topic"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="consultation-description">{t("consultations.description")}</Label>
            <Textarea
              id="consultation-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("consultations.description_placeholder")}
              data-testid="input-consultation-description"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="consultation-type">{t("consultations.type")}</Label>
              <Input
                id="consultation-type"
                value={consultationType}
                onChange={(e) => setConsultationType(e.target.value)}
                placeholder={t("consultations.type_placeholder")}
                data-testid="input-consultation-type"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("consultations.status")}</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger data-testid="select-consultation-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`consultations.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t("consultations.scheduled_date")}</Label>
              <Input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                data-testid="input-consultation-scheduled-date"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="consultation-notes">{t("consultations.notes")}</Label>
              <Input
                id="consultation-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("consultations.notes_placeholder")}
                data-testid="input-consultation-notes"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="follow-up-required"
              checked={followUpRequired}
              onCheckedChange={(v) => setFollowUpRequired(Boolean(v))}
              data-testid="checkbox-consultation-followup"
            />
            <Label htmlFor="follow-up-required">{t("consultations.follow_up_required")}</Label>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleCreate}
              disabled={createConsultationMutation.isPending}
              data-testid="button-create-consultation"
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
              <TableHead>{t("consultations.number")}</TableHead>
              <TableHead>{t("consultations.beneficiary")}</TableHead>
              <TableHead>{t("consultations.topic")}</TableHead>
              <TableHead>{t("consultations.status")}</TableHead>
              <TableHead>{t("consultations.lawyer")}</TableHead>
              <TableHead>{t("consultations.scheduled_date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consultationsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-44" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-56" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-44" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-44" />
                  </TableCell>
                </TableRow>
              ))
            ) : consultations && consultations.length > 0 ? (
              consultations.map((c: any) => {
                const b = beneficiaryMap.get(c.beneficiaryId);
                const lawyer = c.lawyerId ? userMap.get(c.lawyerId) : undefined;
                return (
                  <TableRow key={c.id} data-testid={`row-consultation-${c.id}`}>
                    <TableCell className="font-medium">{c.consultationNumber}</TableCell>
                    <TableCell>{b ? b.fullName : c.beneficiaryId}</TableCell>
                    <TableCell>{c.topic}</TableCell>
                    <TableCell>
                      <Select
                        value={c.status}
                        onValueChange={(v: any) =>
                          updateConsultationMutation.mutate({ id: c.id, data: { status: v } })
                        }
                      >
                        <SelectTrigger className="h-8" data-testid={`select-consultation-status-${c.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`consultations.statuses.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{lawyer ? lawyer.fullName : t("consultations.unassigned")}</TableCell>
                    <TableCell>{c.scheduledDate ? new Date(c.scheduledDate).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  {t("consultations.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
