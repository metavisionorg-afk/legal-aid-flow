import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  redirectTo?: string;
};

export default function Forbidden({ redirectTo = "/portal" }: Props) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const handleGoToPortal = () => {
    const primary = redirectTo || "/portal";
    try {
      setLocation(primary);
    } catch {
      setLocation("/login");
    }

    // Extra hard fallback for environments where SPA navigation may not kick in.
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (window.location.pathname === "/unauthorized") {
          window.location.assign("/login");
        }
      }, 50);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("common.forbidden_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("common.forbidden_description")}</p>
          <Button onClick={handleGoToPortal}>{t("common.go_to_portal")}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
