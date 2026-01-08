import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout/Layout";

export default function CaseTypes() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("nav.case_types")}</h1>
          <p className="text-muted-foreground">{t("case_types.placeholder")}</p>
        </div>
      </div>
    </Layout>
  );
}
