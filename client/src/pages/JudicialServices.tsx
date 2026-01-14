import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Layout } from "@/components/layout/Layout";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import {
  beneficiariesAPI,
  configAPI,
  judicialServicesAPI,
  judicialServiceTypesAPI,
  uploadsAPI,
  usersAPI,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/authz";

type JudicialServiceRow = any;
type DocumentRow = any;

type LawyerUser = { id: string; fullName: string; role?: string; userType?: string };
type BeneficiaryRow = { id: string; fullName?: string; idNumber?: string };
type JudicialServiceTypeRow = { id: string; nameAr?: string | null; nameEn?: string | null; isActive?: boolean };

const judicialServiceStatusSchema = z.enum(["new", "in_review", "accepted", "rejected"]);
type JudicialServiceStatus = z.infer<typeof judicialServiceStatusSchema>;

const ADMIN_STATUS_VALUES: JudicialServiceStatus[] = ["new", "in_review", "accepted", "rejected"];

function getJudicialServiceStatusLabel(t: any, status: unknown): string {
  const parsed = judicialServiceStatusSchema.safeParse(status);
  if (parsed.success) {
    return t(`judicial_services.status.${parsed.data}`);
  }

  // Legacy display-only statuses (do not write back to DB).
  if (status === "assigned") {
    return t("judicial_services.status.assigned_legacy");
  }

  return t("judicial_services.status.unknown");
}

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
type Priority = z.infer<typeof prioritySchema>;

function getPriorityLabel(t: any, value: unknown): string {
  const parsed = prioritySchema.safeParse(value);
  if (!parsed.success) return t("judicial_services.priority.unknown");
  return t(`judicial_services.priority.${parsed.data}`);
}

const CREATE_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;

type CreateJudicialServiceValues = {
  beneficiaryId: string;
  serviceTypeId: string;
  title: string;
  description?: string | null;
  priority: (typeof CREATE_PRIORITY_VALUES)[number];
  lawyerId?: string | null;
};

export default function JudicialServices() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const canManageStatus = isAdmin(user);

  const createJudicialServiceSchema = useMemo(
    () =>
      z
        .object({
          beneficiaryId: z.string().min(1, t("judicial_services.validation.beneficiary_required")),
          serviceTypeId: z.string().min(1, t("judicial_services.validation.service_type_required")),
          title: z.string().trim().min(1, t("judicial_services.validation.title_required")),
          description: z.string().trim().optional().nullable(),
          priority: z.enum(CREATE_PRIORITY_VALUES).default("medium"),
          lawyerId: z.string().optional().nullable(),
        })
        .strict(),
    [t],
  );

  const [blocked401, setBlocked401] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<JudicialServiceRow | null>(null);

  const createForm = useForm<CreateJudicialServiceValues>({
    resolver: zodResolver(createJudicialServiceSchema),
    defaultValues: {
      beneficiaryId: "",
      serviceTypeId: "",
      title: "",
      description: "",
      priority: "medium",
      lawyerId: null,
    },
    mode: "onTouched",
  });

  const { data: features, isLoading: loadingFeatures } = useQuery({
    queryKey: ["config", "features"],
    queryFn: async () => (await configAPI.features()) as any,
    staleTime: Infinity,
  });

  // Default to enabled if server doesn't expose the flag yet.
  const judicialServicesEnabled = (features as any)?.FEATURE_JUDICIAL_SERVICES !== false;
  const canQuery = !authLoading && Boolean(user) && !blocked401 && judicialServicesEnabled;

  const {
    data: services,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["judicial-services", "staff"],
    enabled: canQuery,
    queryFn: async () => (await judicialServicesAPI.list()) as JudicialServiceRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((error as any)?.response?.status === 401) setBlocked401(true);
  }, [error]);

  const { data: lawyers, error: lawyersError } = useQuery({
    queryKey: ["users", "lawyers"],
    enabled: canQuery,
    queryFn: async () => {
      const rows = (await usersAPI.listLawyers()) as any[];
      return (rows || []).map((u) => ({
        id: String(u.id),
        fullName: String(u.fullName || u.username || u.email || u.id),
      })) as LawyerUser[];
    },
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((lawyersError as any)?.response?.status === 401) setBlocked401(true);
  }, [lawyersError]);

  const { data: serviceTypes, error: serviceTypesError } = useQuery({
    queryKey: ["judicial-service-types", "active"],
    enabled: canQuery && createOpen,
    queryFn: async () => (await judicialServiceTypesAPI.listActive()) as JudicialServiceTypeRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((serviceTypesError as any)?.response?.status === 401) setBlocked401(true);
  }, [serviceTypesError]);

  const { data: beneficiaries, error: beneficiariesError } = useQuery({
    queryKey: ["beneficiaries"],
    enabled: canQuery && createOpen,
    queryFn: async () => (await beneficiariesAPI.getAll()) as BeneficiaryRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((beneficiariesError as any)?.response?.status === 401) setBlocked401(true);
  }, [beneficiariesError]);

  const {
    data: attachments,
    isLoading: loadingAttachments,
    error: attachmentsError,
  } = useQuery({
    queryKey: ["judicial-services", active?.id, "attachments"],
    enabled: canQuery && Boolean(active?.id),
    queryFn: async () => (await judicialServicesAPI.listAttachments(String(active!.id))) as DocumentRow[],
    retry: (failureCount, err: any) => {
      if (err?.response?.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if ((attachmentsError as any)?.response?.status === 401) setBlocked401(true);
  }, [attachmentsError]);

  const assignLawyerMutation = useMutation({
    mutationFn: async (input: { serviceId: string; lawyerId: string }) =>
      judicialServicesAPI.assignLawyer(input.serviceId, input.lawyerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["judicial-services", "staff"] });
      toast({
        title: t("common.success"),
        description: t("judicial_services.toasts.lawyer_assigned"),
      });
    },
    onError: (err) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive" as any,
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: { serviceId: string; status: string }) =>
      judicialServicesAPI.updateStatus(input.serviceId, { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["judicial-services", "staff"] });
      toast({
        title: t("common.success"),
        description: t("judicial_services.toasts.status_updated"),
      });
    },
    onError: (err) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive" as any,
      });
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: async (values: CreateJudicialServiceValues) => {
      const created = await judicialServicesAPI.create({
        beneficiaryId: values.beneficiaryId,
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        serviceTypeId: values.serviceTypeId,
        priority: values.priority,
      });

      const serviceId = String((created as any)?.id);
      const warnings: string[] = [];

      if (values.lawyerId && values.lawyerId.trim()) {
        try {
          await judicialServicesAPI.assignLawyer(serviceId, values.lawyerId.trim());
        } catch (err: any) {
          if (err?.response?.status === 401) setBlocked401(true);
          warnings.push(t("judicial_services.warnings.assign_lawyer_failed") as any);
        }
      }

      if (createFiles.length) {
        try {
          const uploaded = await Promise.all(createFiles.map((f) => uploadsAPI.upload(f)));
          await judicialServicesAPI.addAttachments(serviceId, {
            isPublic: true,
            documents: uploaded,
          });
        } catch (err: any) {
          if (err?.response?.status === 401) setBlocked401(true);
          warnings.push(t("judicial_services.warnings.attachments_failed") as any);
        }
      }

      return { created, warnings };
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ["judicial-services", "staff"] });

      const warnings = Array.isArray(result?.warnings) ? (result.warnings as string[]) : [];
      toast({
        title: t("common.success"),
        description:
          warnings.length > 0
            ? t("judicial_services.toasts.created_with_warnings", {
                warnings: warnings.join(t("common.separators.sentence_space")),
              })
            : (t("judicial_services.toasts.created") as any),
      });

      setCreateOpen(false);
      createForm.reset();
      setCreateFiles([]);
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) setBlocked401(true);
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t),
        variant: "destructive" as any,
      });
    },
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

  const lawyerNameById = useMemo(() => {
    const map = new Map<string, string>();
    (lawyers || []).forEach((l) => map.set(String(l.id), String(l.fullName)));
    return map;
  }, [lawyers]);

  return (
    <Layout>
      <div className="space-y-6">
        {loadingFeatures ? (
          <Card>
            <CardContent className="py-10">
              <div className="space-y-3">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : !judicialServicesEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("judicial_services.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {t("common.feature_disabled")}
              </div>
            </CardContent>
          </Card>
        ) : blocked401 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("common.session_expired")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {t("common.please_login_again")}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => setLocation("/login", { replace: true })}>
                  {t("auth.login")}
                </Button>
                <Button variant="outline" onClick={() => setBlocked401(false)}>
                  {t("common.retry")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("judicial_services.title")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                disabled={!canQuery}
                onClick={() => {
                  if (!canQuery) return;
                  setCreateOpen(true);
                }}
              >
                {t("judicial_services.actions.add")}
              </Button>
              <Button
                variant="outline"
                disabled={!canQuery}
                onClick={() => {
                  if (!canQuery) return;
                  refetch();
                }}
              >
                {t("common.refresh")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!canQuery ? (
              <div className="text-sm text-muted-foreground">
                {authLoading
                  ? (t("common.loading") as any)
                  : t("common.no_data")}
              </div>
            ) : isLoading ? (
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
                    <TableHead>{t("judicial_services.table.headers.service_number")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.title")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.status")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.priority")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.lawyer")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.date")}</TableHead>
                    <TableHead>{t("judicial_services.table.headers.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length ? (
                    sorted.map((js) => (
                      <TableRow key={String(js.id)}>
                        <TableCell className="font-mono text-xs">{String(js.serviceNumber || t("common.placeholder.none"))}</TableCell>
                        <TableCell className="font-medium">{String(js.title || t("judicial_services.fields.untitled"))}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getJudicialServiceStatusLabel(t, (js as any).status)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getPriorityLabel(t, (js as any).priority)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {js.assignedLawyerId
                            ? (lawyerNameById.get(String(js.assignedLawyerId)) || t("judicial_services.fields.unknown_lawyer"))
                            : t("common.placeholder.none")}
                        </TableCell>
                        <TableCell>{js.createdAt ? new Date(js.createdAt).toLocaleDateString() : t("common.placeholder.none")}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActive(js);
                              setOpen(true);
                            }}
                          >
                            {t("judicial_services.actions.manage")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {t("judicial_services.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next);
            if (!next) {
              createForm.reset();
              setCreateFiles([]);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("judicial_services.dialog.add_title")}</DialogTitle>
            </DialogHeader>

            <Form {...createForm}>
              <form
                className="space-y-4"
                onSubmit={createForm.handleSubmit((values) => createServiceMutation.mutate(values))}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="beneficiaryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("judicial_services.fields.beneficiary")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("judicial_services.placeholders.select_beneficiary")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(beneficiaries || []).map((b: any) => (
                              <SelectItem key={String(b.id)} value={String(b.id)}>
                                {b.idNumber
                                  ? t("judicial_services.beneficiary_option.with_id", {
                                      fullName: String(b.fullName || t("judicial_services.fields.unnamed_beneficiary")),
                                      idNumber: String(b.idNumber),
                                    })
                                  : t("judicial_services.beneficiary_option.without_id", {
                                      fullName: String(b.fullName || t("judicial_services.fields.unnamed_beneficiary")),
                                    })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="serviceTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("judicial_services.fields.service_type")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("judicial_services.placeholders.select_service_type")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(serviceTypes || []).map((st: any) => (
                              <SelectItem key={String(st.id)} value={String(st.id)}>
                                {String(st.nameAr || st.nameEn || t("judicial_services.fields.unnamed_service_type"))}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={createForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("judicial_services.fields.title")}</FormLabel>
                      <FormControl>
                          <Input placeholder={t("judicial_services.placeholders.title")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t("judicial_services.fields.description")}</FormLabel>
                      <FormControl>
                        <Textarea
                            placeholder={t("judicial_services.placeholders.description")}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                          <FormLabel>{t("judicial_services.fields.priority")}</FormLabel>
                        <Select value={String(field.value)} onValueChange={field.onChange as any}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("judicial_services.placeholders.select_priority")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CREATE_PRIORITY_VALUES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {getPriorityLabel(t, p)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="lawyerId"
                    render={({ field }) => (
                      <FormItem>
                            <FormLabel>{t("judicial_services.fields.assign_lawyer")}</FormLabel>
                        <Select
                          value={field.value ? String(field.value) : ""}
                          onValueChange={(v) => field.onChange(v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("judicial_services.placeholders.select_lawyer")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(lawyers || []).map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("judicial_services.fields.attachments")}</Label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setCreateFiles(files);
                    }}
                  />
                  {createFiles.length ? (
                    <div className="text-xs text-muted-foreground">
                      {createFiles.map((f) => f.name).join(t("common.separators.comma_space"))}
                    </div>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={createServiceMutation.isPending}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={createServiceMutation.isPending || !canQuery}>
                    {createServiceMutation.isPending
                      ? (t("common.loading") as any)
                      : t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setActive(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("judicial_services.manage_title")}</DialogTitle>
            </DialogHeader>

            {!active ? null : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t("judicial_services.fields.service_number")}</div>
                    <div className="font-mono text-sm">{String(active.serviceNumber || t("common.placeholder.none"))}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t("judicial_services.fields.beneficiary")}</div>
                    <div className="text-sm">{t("judicial_services.fields.beneficiary_id_label", { id: String((active as any).beneficiaryId || t("common.placeholder.none")) })}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-muted-foreground">{t("judicial_services.fields.title")}</div>
                    <div className="text-sm font-medium">{String(active.title || t("judicial_services.fields.untitled"))}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("judicial_services.fields.assign_lawyer")}</Label>
                    <Select
                      value={active.assignedLawyerId ? String(active.assignedLawyerId) : ""}
                      onValueChange={(lawyerId) => {
                        if (!active?.id) return;
                        assignLawyerMutation.mutate({ serviceId: String(active.id), lawyerId });
                        setActive({ ...active, assignedLawyerId: lawyerId });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("judicial_services.placeholders.select_lawyer")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(lawyers || []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("judicial_services.fields.status")}</Label>
                    {canManageStatus ? (
                      <Select
                        value={String(active.status || "")}
                        onValueChange={(nextRaw) => {
                          if (!active?.id) return;
                          const parsed = judicialServiceStatusSchema.safeParse(nextRaw);
                          if (!parsed.success) {
                            toast({
                              title: t("common.error"),
                              description: t("judicial_services.errors.invalid_status"),
                              variant: "destructive" as any,
                            });
                            return;
                          }
                          const status = parsed.data;
                          updateStatusMutation.mutate({ serviceId: String(active.id), status });
                          setActive({ ...active, status });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("judicial_services.placeholders.select_status")} />
                        </SelectTrigger>
                        <SelectContent>
                          {ADMIN_STATUS_VALUES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {getJudicialServiceStatusLabel(t, s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {getJudicialServiceStatusLabel(t, (active as any).status)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t("judicial_services.fields.attachments")}</div>
                  </div>

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
                                {String(doc.title || doc.fileName || t("common.document"))}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {doc.size
                                  ? t("judicial_services.attachments.file_meta_with_size", {
                                      fileName: String(doc.fileName || t("judicial_services.attachments.unnamed_file")),
                                      size: t("common.bytes", { count: Number(doc.size) }),
                                    })
                                  : t("judicial_services.attachments.file_meta_without_size", {
                                      fileName: String(doc.fileName || t("judicial_services.attachments.unnamed_file")),
                                    })}
                              </div>
                            </div>
                            {doc.fileUrl ? (
                              <a className="shrink-0" href={String(doc.fileUrl)} target="_blank" rel="noreferrer">
                                <Button size="sm">{t("common.download")}</Button>
                              </a>
                            ) : (
                              <Button size="sm" disabled>{t("common.download")}</Button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">{t("judicial_services.attachments.empty")}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
