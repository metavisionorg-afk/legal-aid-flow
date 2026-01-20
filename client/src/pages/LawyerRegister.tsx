import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import LawyerRegistrationForm from "@/components/lawyer/LawyerRegistrationForm";

export default function LawyerRegister() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4 relative">
      <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto">
        <LanguageSwitcher />
      </div>

      <Card className="w-[95vw] max-w-3xl">
        <CardHeader>
          <CardTitle>
            {t("auth.lawyer_register.cta", { defaultValue: "تسجيل كمحامي" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LawyerRegistrationForm mode="self" />
        </CardContent>
      </Card>
    </div>
  );
}
