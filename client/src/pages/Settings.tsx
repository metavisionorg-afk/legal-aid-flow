import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auditAPI, systemSettingsAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Link } from "wouter";

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [vatRate, setVatRate] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditAPI.getLogs(20),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: systemSettingsAPI.get,
  });

  useEffect(() => {
    if (!settings) return;
    setVatRate(settings.vatRate?.toString() || "");
    setLogoUrl(settings.organizationLogo || "");
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: systemSettingsAPI.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success(t('settings.update_success'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('settings.update_error'));
    },
  });

  const handleSave = () => {
    const updates: any = {};
    if (vatRate) updates.vatRate = parseFloat(vatRate);
    if (logoUrl) updates.organizationLogo = logoUrl;
    updateMutation.mutate(updates);
  };

  return (
    <Layout>
      <h1 className="text-3xl font-bold tracking-tight">{t('app.settings')}</h1>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
          <TabsTrigger value="roles">{t('settings.roles')}</TabsTrigger>
          <TabsTrigger value="audit">{t('settings.audit')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.org_profile')}</CardTitle>
              <CardDescription>{t('settings.org_profile_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="logo-url">{t('settings.logo_url')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="logo-url"
                    data-testid="input-logo-url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                  <Button variant="outline" size="icon" data-testid="button-upload-logo">
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                {logoUrl && (
                  <div className="mt-2 p-4 border rounded-md bg-muted/50">
                    <img src={logoUrl} alt={t("settings.logo_preview")} className="h-16 object-contain" />
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="vat-rate">{t('settings.vat_rate')}</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="vat-rate"
                    data-testid="input-vat-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    placeholder="15.00"
                    className="max-w-xs"
                  />
                  <span>%</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || settingsLoading}
                  data-testid="button-save-settings"
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 rtl:ml-2 rtl:mr-0 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{t('settings.roles_permissions')}</CardTitle>
                  <CardDescription>{t('settings.roles_desc')}</CardDescription>
                </div>
                <Link href="/rules">
                  <Button data-testid="button-manage-rules">
                    {t('settings.manage_rules')}
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t('settings.rules_redirect_note')}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.audit_log')}</CardTitle>
              <CardDescription>{t('settings.audit_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="border-b pb-4">
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : auditLogs && auditLogs.length > 0 ? (
                <div className="space-y-4">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.entity}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.details ? `${log.details} • ` : ""}
                          {log.ipAddress} • {format(new Date(log.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <Badge variant="outline">{t('settings.access')}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  {t("settings.no_audit_logs")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
