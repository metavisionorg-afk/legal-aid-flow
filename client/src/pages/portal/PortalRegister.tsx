import { useEffect } from "react";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BeneficiaryRegistrationCard } from "@/components/beneficiaries/BeneficiaryRegistrationCard";
import { useAuth } from "@/contexts/AuthContext";

export default function PortalRegister() {
  const [, setLocation] = useLocation();
  const { refresh, user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.userType === "beneficiary" || (user as any)?.role === "beneficiary") {
      setLocation("/portal", { replace: true });
      return;
    }
    setLocation("/dashboard", { replace: true });
  }, [loading, user, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4 relative">
      <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto">
        <LanguageSwitcher />
      </div>

      <BeneficiaryRegistrationCard
        mode="public"
        onSuccess={async () => {
          await refresh();
          setLocation("/portal", { replace: true });
        }}
      />
    </div>
  );
}
