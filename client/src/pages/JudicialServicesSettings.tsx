import { useTranslation } from "react-i18next";
import JudicialServiceTypesSettings from "@/components/settings/JudicialServiceTypesSettings";
import { Layout } from "@/components/layout/Layout";

export default function JudicialServicesSettings() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{t("sidebar.judicialServicesSettings")}</h1>
      </div>
      <JudicialServiceTypesSettings />
    </Layout>
  );
}
