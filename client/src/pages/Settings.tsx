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

export default function Settings() {
  const { t } = useTranslation();

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
               <div className="space-y-4">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">User "Sarah Ahmed" accessed Case #2023-001</p>
                      <p className="text-xs text-muted-foreground">IP: 192.168.1.1 • 2 mins ago</p>
                    </div>
                    <Badge variant="outline">{t('settings.access')}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
