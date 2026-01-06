import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { Layout } from "@/components/layout/Layout";
import { PortalLayout } from "@/components/layout/PortalLayout";
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

import { beneficiariesAPI, serviceRequestsAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin, isBeneficiary, isLawyer } from "@/lib/authz";

const SERVICE_TYPES = [
  "legal_consultation",
  "court_representation",
  "contract_drafting_review",
  "complaint_drafting",
  "other",
] as const;

const STATUSES = ["new", "in_review", "accepted", "rejected"] as const;

export default function Consultations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const serviceTypeLabel = (value: string) => t(`service_types.${value}`, value);
  const statusLabel = (value: string) => t(`serviceRequests.statuses.${value}`, value);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const allowed = isBeneficiary(user) || isAdmin(user) || isLawyer(user);
  if (!allowed) {
    setLocation("/unauthorized");
    return null;
  }

  const isBen = isBeneficiary(user);

  const [path] = useLocation();
  const initialBeneficiaryId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("beneficiaryId") || "";
  }, [path]);
  const { data: myRequests, isLoading: myLoading } = useQuery({
    queryKey: ["serviceRequests", "my"],
    queryFn: serviceRequestsAPI.listMy,
    enabled: isBen,
  });

  const { data: allRequests, isLoading: allLoading } = useQuery({
    queryKey: ["serviceRequests", "all"],
    queryFn: serviceRequestsAPI.listAll,
    enabled: !isBen,
  });

  const { data: beneficiaries, isLoading: beneficiariesLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: beneficiariesAPI.getAll,
    enabled: !isBen,
  });

  const beneficiaryMap = useMemo(() => {
    const map = new Map<string, any>();
    (beneficiaries || []).forEach((b: any) => map.set(b.id, b));
    return map;
  }, [beneficiaries]);

  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>("legal_consultation");
  const [serviceTypeOther, setServiceTypeOther] = useState<string>("");
  const [issueSummary, setIssueSummary] = useState<string>("");
  const [issueDetails, setIssueDetails] = useState<string>("");
  const [urgent, setUrgent] = useState<boolean>(false);

  const createRequestMutation = useMutation({
    mutationFn: serviceRequestsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceRequests", "my"] });
      setServiceType("legal_consultation");
      setServiceTypeOther("");
      setIssueSummary("");
      setIssueDetails("");
      setUrgent(false);
      toast.success(t("common.success"));
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: (typeof STATUSES)[number] }) =>
      serviceRequestsAPI.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceRequests", "all"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err));
    },
  });

  const handleCreate = () => {
    if (!issueSummary.trim()) {
      toast.error(t("serviceRequests.issue_summary_required"));
      return;
    }

    createRequestMutation.mutate({
      serviceType,
      serviceTypeOther: serviceType === "other" ? serviceTypeOther.trim() || null : null,
      issueSummary: issueSummary.trim(),
      issueDetails: issueDetails.trim() || null,
      urgent,
    });
  };

  const page = (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("app.consultations")}</h1>
      </div>

      {isBen ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("serviceRequests.new_request")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("serviceRequests.service_type")}</Label>
              <Select value={serviceType} onValueChange={(v: any) => setServiceType(v)}>
                <SelectTrigger data-testid="select-service-request-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {serviceTypeLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {serviceType === "other" ? (
              <div className="grid gap-2">
                <Label>{t("serviceRequests.service_type_other")}</Label>
                <Input value={serviceTypeOther} onChange={(e) => setServiceTypeOther(e.target.value)} />
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>{t("serviceRequests.issue_summary")}</Label>
              <Input
                value={issueSummary}
                onChange={(e) => setIssueSummary(e.target.value)}
                data-testid="input-service-request-summary"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("serviceRequests.issue_details")}</Label>
              <Textarea
                value={issueDetails}
                onChange={(e) => setIssueDetails(e.target.value)}
                data-testid="input-service-request-details"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={urgent} onCheckedChange={(v: any) => setUrgent(Boolean(v))} />
              <Label>{t("serviceRequests.urgent")}</Label>
            </div>

            <div className="flex items-center justify-end">
              <Button
                onClick={handleCreate}
                disabled={createRequestMutation.isPending}
                data-testid="button-create-service-request"
              >
                {createRequestMutation.isPending ? t("common.loading") : t("serviceRequests.submit")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{isBen ? t("serviceRequests.my_requests") : t("serviceRequests.management")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("serviceRequests.status")}</TableHead>
                {!isBen ? <TableHead>{t("serviceRequests.beneficiary")}</TableHead> : null}
                <TableHead>{t("serviceRequests.service_type")}</TableHead>
                <TableHead>{t("serviceRequests.issue_summary")}</TableHead>
                <TableHead>{t("serviceRequests.created_at")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isBen ? myLoading : allLoading) ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx}>
                    <TableCell colSpan={isBen ? 4 : 5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (isBen ? myRequests : allRequests) && (isBen ? myRequests : allRequests).length > 0 ? (
                (isBen ? myRequests : allRequests).map((r: any) => {
                  const ben = !isBen ? beneficiaryMap.get(r.beneficiaryId) : null;
                  return (
                    <TableRow key={r.id} data-testid={`row-service-request-${r.id}`}>
                      <TableCell className="font-medium">
                        {!isBen ? (
                          <Select
                            value={r.status}
                            onValueChange={(v: any) => updateStatusMutation.mutate({ id: r.id, status: v })}
                          >
                            <SelectTrigger className="h-8" data-testid={`select-service-request-status-${r.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {statusLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          statusLabel(r.status)
                        )}
                      </TableCell>
                      {!isBen ? <TableCell>{ben ? ben.fullName : r.beneficiaryId}</TableCell> : null}
                      <TableCell>{serviceTypeLabel(r.serviceType)}</TableCell>
                      <TableCell>{r.issueSummary}</TableCell>
                      <TableCell>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={isBen ? 4 : 5} className="text-center text-muted-foreground">
                    {t("serviceRequests.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );

  return isBen ? <PortalLayout>{page}</PortalLayout> : <Layout>{page}</Layout>;
}
