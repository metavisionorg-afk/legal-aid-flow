import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { usersAPI, casesAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/authz";
import Forbidden from "@/pages/Forbidden";

const createLawyerSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.string().email(),
    username: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

type CreateLawyerValues = z.infer<typeof createLawyerSchema>;

const editLawyerSchema = z.object({
  fullName: z.string().min(1),
  isActive: z.boolean(),
});

type EditLawyerValues = z.infer<typeof editLawyerSchema>;

function normalize(text: unknown): string {
  return String(text ?? "").toLowerCase().trim();
}

export default function Lawyers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Lawyer criteria (shared with backend): staff user with role === "lawyer".
  const isLawyerUser = (u: any) => u?.userType === "staff" && u?.role === "lawyer";

  const canAccess = isAdmin(user);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: usersAPI.getAll,
    enabled: canAccess,
  });

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases"],
    queryFn: casesAPI.getAll,
    enabled: canAccess && reportOpen,
  });

  const lawyers = useMemo(() => {
    const list = (users || []).filter(isLawyerUser);
    const q = normalize(search);
    if (!q) return list;

    return list.filter((u: any) => {
      const hay = [u.fullName, u.email, u.username].map(normalize).join(" ");
      return hay.includes(q);
    });
  }, [users, search]);

  const reportCases = useMemo(() => {
    if (!selected?.id) return [];
    const list = (cases || []).filter((c: any) => c.assignedLawyerId === selected.id);
    return list
      .slice()
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [cases, selected?.id]);

  const reportStats = useMemo(() => {
    const total = reportCases.length;

    const isCompleted = (s: string) => s === "completed";
    const isClosed = (s: string) => ["rejected", "cancelled", "closed", "closed_admin"].includes(s);

    const completed = reportCases.filter((c: any) => isCompleted(String(c.status))).length;
    const closed = reportCases.filter((c: any) => isClosed(String(c.status))).length;
    const active = reportCases.filter((c: any) => !isCompleted(String(c.status)) && !isClosed(String(c.status))).length;

    return { total, active, completed, closed };
  }, [reportCases]);

  const createForm = useForm<CreateLawyerValues>({
    resolver: zodResolver(createLawyerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      isActive: true,
    },
    mode: "onTouched",
  });

  const editForm = useForm<EditLawyerValues>({
    resolver: zodResolver(editLawyerSchema),
    defaultValues: { fullName: "", isActive: true },
    mode: "onTouched",
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateLawyerValues) =>
      usersAPI.create({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        username: values.username.trim(),
        password: values.password,
        isActive: values.isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: t("common.success"), description: t("lawyers.add_success") });
      setCreateOpen(false);
      createForm.reset();
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("lawyers.add_failed"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; updates: Partial<EditLawyerValues> }) =>
      usersAPI.update(input.id, input.updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: t("common.success"), description: t("lawyers.update_success") });
    },
    onError: (err: any) => {
      toast({
        title: t("common.error"),
        description: getErrorMessage(err, t) || t("lawyers.update_failed"),
        variant: "destructive",
      });
    },
  });

  if (!canAccess) {
    return <Forbidden redirectTo="/" />;
  }

  const openEdit = (u: any) => {
    setSelected(u);
    editForm.reset({ fullName: u?.fullName ?? "", isActive: Boolean(u?.isActive) });
    setEditOpen(true);
  };

  const openReport = (u: any) => {
    setSelected(u);
    setReportOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("lawyers.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("lawyers.subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>{t("lawyers.add")}</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("lawyers.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("lawyers.search_placeholder")}
          />

          {loadingUsers ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : !lawyers.length ? (
            <div className="text-sm text-muted-foreground">{t("lawyers.no_lawyers")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("lawyers.name")}</TableHead>
                  <TableHead>{t("lawyers.email")}</TableHead>
                  <TableHead>{t("lawyers.phone")}</TableHead>
                  <TableHead>{t("lawyers.status")}</TableHead>
                  <TableHead>{t("lawyers.role")}</TableHead>
                  <TableHead className="text-right">{t("lawyers.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lawyers.map((u: any) => {
                  const active = Boolean(u?.isActive);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <button
                          className="underline"
                          onClick={() => openReport(u)}
                          type="button"
                        >
                          {u.fullName}
                        </button>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={active}
                            onCheckedChange={(next) =>
                              updateMutation.mutate({ id: u.id, updates: { isActive: Boolean(next) } })
                            }
                          />
                          <Badge variant={active ? "default" : "secondary"}>
                            {active ? t("lawyers.active") : t("lawyers.inactive")}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                          {t("common.edit")}
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

      {/* Create Lawyer */}
      <Dialog open={createOpen} onOpenChange={(v) => setCreateOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("lawyers.add")}</DialogTitle>
          </DialogHeader>

          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lawyers.full_name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lawyers.email")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lawyers.username")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("lawyers.password")}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("lawyers.confirm_password")}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{t("lawyers.status")}</div>
                      <div className="text-sm text-muted-foreground">{t("lawyers.status_help")}</div>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Lawyer */}
      <Dialog open={editOpen} onOpenChange={(v) => setEditOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("lawyers.edit")}</DialogTitle>
          </DialogHeader>

          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((values) => {
                if (!selected?.id) return;
                updateMutation.mutate({ id: selected.id, updates: values });
                setEditOpen(false);
              })}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lawyers.full_name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{t("lawyers.status")}</div>
                      <div className="text-sm text-muted-foreground">{t("lawyers.status_help")}</div>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Lawyer Report */}
      <Dialog
        open={reportOpen}
        onOpenChange={(v) => {
          setReportOpen(v);
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("lawyers.report")}</DialogTitle>
          </DialogHeader>

          {!selected ? null : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{selected.fullName}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">{t("lawyers.email")}</div>
                    <div>{selected.email}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("lawyers.phone")}</div>
                    <div>{selected.phone || "-"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("lawyers.status")}</div>
                    <div>
                      <Badge variant={selected.isActive ? "default" : "secondary"}>
                        {selected.isActive ? t("lawyers.active") : t("lawyers.inactive")}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{t("lawyers.role")}</div>
                    <div>{selected.role}</div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{t("lawyers.stats.total")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportStats.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{t("lawyers.stats.active")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportStats.active}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{t("lawyers.stats.completed")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportStats.completed}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{t("lawyers.stats.closed")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportStats.closed}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t("lawyers.last_cases")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingCases ? (
                    <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
                  ) : !reportCases.length ? (
                    <div className="text-sm text-muted-foreground">{t("cases.no_cases")}</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("cases.case_number")}</TableHead>
                          <TableHead>{t("cases.case_title")}</TableHead>
                          <TableHead>{t("cases.case_status")}</TableHead>
                          <TableHead>{t("cases.last_updated")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportCases.slice(0, 10).map((c: any) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Link className="underline" href={`/cases/${c.id}`}>
                                {c.caseNumber}
                              </Link>
                            </TableCell>
                            <TableCell>{c.title}</TableCell>
                            <TableCell>{String(c.status)}</TableCell>
                            <TableCell>
                              {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
