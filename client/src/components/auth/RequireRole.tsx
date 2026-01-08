import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { getRole } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RequireRole(props: {
  role: string | string[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const requiredRoles = Array.isArray(props.role) ? props.role : [props.role];

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const role = getRole(user);
  const ok = Boolean(role && requiredRoles.includes(role));

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("common.unauthorized_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("common.unauthorized_desc")}</p>
            <div>
              <Button variant="outline" onClick={() => setLocation("/")}>{t("common.back")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{props.children}</>;
}
