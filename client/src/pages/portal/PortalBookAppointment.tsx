import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { appointmentsAPI, expertsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";

type AppointmentType = "online" | "in_person";

export default function PortalBookAppointment() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: experts, isLoading: expertsLoading } = useQuery({
    queryKey: ["experts"],
    queryFn: expertsAPI.getAll,
  });

  const [expertId, setExpertId] = useState<string>("");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("online");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [duration, setDuration] = useState<number>(60);
  const [topic, setTopic] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [location, setLocationText] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: (payload: any) => appointmentsAPI.create(payload),
    onSuccess: () => {
      toast.success(t("common.success"));
      setLocation("/portal");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleSubmit = () => {
    if (!expertId) {
      toast.error("Expert is required");
      return;
    }
    if (!scheduledDate) {
      toast.error("Date is required");
      return;
    }
    if (!topic.trim()) {
      toast.error("Topic is required");
      return;
    }

    createMutation.mutate({
      expertId,
      appointmentType,
      scheduledDate,
      duration,
      topic: topic.trim(),
      notes: notes.trim() || null,
      location: appointmentType === "in_person" ? (location.trim() || null) : null,
    });
  };

  const expertLabel = (e: any) => {
    const user = e?.user;
    return user?.fullName || user?.email || e?.userId || e?.id || "Expert";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("portal.book_appointment")}</h1>
        <p className="text-muted-foreground mt-2">{t("portal.title")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("portal.book_appointment")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Expert</Label>
            <Select value={expertId} onValueChange={setExpertId}>
              <SelectTrigger disabled={expertsLoading}>
                <SelectValue placeholder={expertsLoading ? t("common.loading") : "Select expert"} />
              </SelectTrigger>
              <SelectContent>
                {(experts || []).map((e: any) => {
                  const value = e?.user?.id || e?.userId;
                  if (!value) return null;
                  return (
                    <SelectItem key={value} value={value}>
                      {expertLabel(e)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={appointmentType} onValueChange={(v: any) => setAppointmentType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="in_person">In person</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Date</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={15}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value || 60))}
            />
          </div>

          <div className="grid gap-2">
            <Label>Topic</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>

          {appointmentType === "in_person" ? (
            <div className="grid gap-2">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocationText(e.target.value)} />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setLocation("/portal")}>Back</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? t("common.loading") : t("common.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
