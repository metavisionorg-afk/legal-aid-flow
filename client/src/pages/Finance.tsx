import { useTranslation } from "react-i18next";

import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Finance() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("app.finance")}</h1>
          <p className="text-muted-foreground">{t("finance.coming_soon")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.vouchers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("finance.coming_soon")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.installments")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("finance.coming_soon")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
