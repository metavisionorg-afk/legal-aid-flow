import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { rulesAPI, usersAPI } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import type { Rule, User } from "@shared/schema";

const PERMISSIONS = [
  "view_dashboard",
  "manage_users",
  "manage_beneficiaries",
  "manage_cases",
  "cases.view_workflow",
  "cases.update_stage",
  "cases.override_stage",
  "manage_documents",
  "manage_intake",
  "manage_tasks",
  "manage_finance",
  "beneficiary:self:read",
  "beneficiary:self:update",
  "cases:self:read",
  "cases:self:create",
  "documents:self:create",
  "intake:self:create",
] as const;

function permissionLabel(t: (key: string, options?: any) => string, permission: string): string {
  return t(`permissions.${permission}`, { defaultValue: permission });
}

export default function Rules() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(["view_dashboard"]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");

  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ["rules"],
    queryFn: async () => (await rulesAPI.getAll()) as Rule[],
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await usersAPI.getAll()) as Omit<User, "password">[],
  });

  const rulesById = useMemo(() => {
    const map = new Map<string, Rule>();
    (rules || []).forEach((r) => map.set(r.id, r));
    return map;
  }, [rules]);

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (selectedPermissions.length === 0)
        throw new Error("At least one permission is required");

      return rulesAPI.create({
        name: name.trim(),
        description: description.trim() || null,
        permissions: selectedPermissions,
      });
    },
    onSuccess: async () => {
      toast.success("Rule created");
      setName("");
      setDescription("");
      setSelectedPermissions(["view_dashboard"]);
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => rulesAPI.delete(id),
    onSuccess: async () => {
      toast.success("Rule deleted");
      await queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  const assignRuleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("Select a user");
      if (!selectedRuleId) throw new Error("Select a rule");
      return rulesAPI.assignToUser(selectedUserId, selectedRuleId);
    },
    onSuccess: async () => {
      toast.success("Rule assigned");
      setSelectedRuleId("");
    },
    onError: (err) => toast.error(getErrorMessage(err, t)),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("app.rules")}</h1>
          <p className="text-muted-foreground">{t("settings.roles_permissions")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("app.add_new")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("rules.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rules.name_placeholder")} />
              </div>

              <div className="space-y-2">
                <Label>{t("rules.description")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("rules.description_placeholder")}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>{t("rules.permissions")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {PERMISSIONS.map((perm) => {
                    const checked = selectedPermissions.includes(perm);
                    return (
                      <label
                        key={perm}
                        className="flex items-center gap-2 rounded-md border p-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const isChecked = Boolean(v);
                            setSelectedPermissions((prev) =>
                              isChecked
                                ? Array.from(new Set([...prev, perm]))
                                : prev.filter((p) => p !== perm)
                            );
                          }}
                        />
                        <span className="break-all">{permissionLabel(t, perm)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>
              {createRuleMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.roles_permissions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRules ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("rules.name")}</TableHead>
                    <TableHead>{t("rules.permissions")}</TableHead>
                    <TableHead>{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rules || []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="space-x-2">
                        {(r.permissions || []).slice(0, 4).map((p) => (
                          <Badge key={p} variant="secondary">
                            {permissionLabel(t, p)}
                          </Badge>
                        ))}
                        {(r.permissions || []).length > 4 ? (
                          <Badge variant="outline">+{(r.permissions || []).length - 4}</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteRuleMutation.mutate(r.id)}
                          disabled={deleteRuleMutation.isPending}
                        >
                          {t("common.delete")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("rules.assign_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("rules.user")}</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingUsers ? t("common.loading") : t("rules.select_user")} />
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
                <Label>{t("rules.rule")}</Label>
                <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingRules ? t("common.loading") : t("rules.select_rule")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(rules || []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedRuleId ? (
                <div>
                  {t("rules.selected_permissions")}: {(rulesById.get(selectedRuleId)?.permissions || []).map((p) => permissionLabel(t, p)).join(", ")}
                </div>
              ) : null}
            </div>

            <Button onClick={() => assignRuleMutation.mutate()} disabled={assignRuleMutation.isPending}>
              {assignRuleMutation.isPending ? t("common.loading") : t("rules.assign")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
