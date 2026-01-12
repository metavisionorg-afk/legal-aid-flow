import { useEffect } from "react";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BeneficiaryRegistrationCard } from "@/components/beneficiaries/BeneficiaryRegistrationCard";
import { useAuth } from "@/contexts/AuthContext";

export default function BeneficiaryRegister() {
  const { refresh, user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    // If already logged in, send users to the appropriate home.
    if (user.userType === "beneficiary" || (user as any)?.role === "beneficiary") {
      setLocation("/beneficiary/dashboard", { replace: true });
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
          setLocation("/beneficiary/dashboard", { replace: true });
        }}
      />
    </div>
  );
}
