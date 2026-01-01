import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { auditAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Settings() {
  const { t } = useTranslation();

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditAPI.getLogs(20),
  });

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
                <Label>{t('settings.org_name')}</Label>
                <Input defaultValue="Adala Legal Aid" />
              </div>
              <div className="grid gap-2">
                <Label>{t('settings.contact_email')}</Label>
                <Input defaultValue="contact@adala.org" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('settings.rtl_default')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.rtl_default_desc')}</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.roles_permissions')}</CardTitle>
              <CardDescription>{t('settings.roles_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settings.role')}</TableHead>
                    <TableHead>{t('settings.users')}</TableHead>
                    <TableHead>{t('settings.permissions')}</TableHead>
                    <TableHead className="text-right rtl:text-left">{t('settings.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Administrator</TableCell>
                    <TableCell>2</TableCell>
                    <TableCell>All Access</TableCell>
                    <TableCell className="text-right rtl:text-left"><Button variant="ghost" size="sm">Edit</Button></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Lawyer</TableCell>
                    <TableCell>15</TableCell>
                    <TableCell>Case Management</TableCell>
                    <TableCell className="text-right rtl:text-left"><Button variant="ghost" size="sm">Edit</Button></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Intake Officer</TableCell>
                    <TableCell>4</TableCell>
                    <TableCell>Intake Only</TableCell>
                    <TableCell className="text-right rtl:text-left"><Button variant="ghost" size="sm">Edit</Button></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
                  No audit logs available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
