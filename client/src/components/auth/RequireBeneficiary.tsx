import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { isBeneficiary } from "@/lib/authz";
import Forbidden from "@/pages/Forbidden";

type Props = {
  children: ReactNode;
  redirectTo?: string;
};

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}

/**
 * RequireBeneficiary - Protects routes that should only be accessible to beneficiary users
 * 
 * Authorization Flow:
 * 1. If loading -> show spinner
 * 2. If no user -> redirect to /login
 * 3. If user is not beneficiary -> show Forbidden page with redirect
 * 4. Otherwise -> render children
 */
export function RequireBeneficiary({ children, redirectTo = "/login" }: Props) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      if (import.meta.env.DEV) {
        console.debug("[auth] RequireBeneficiary: no user -> redirect to login");
      }
      setLocation(redirectTo, { replace: true });
    }
  }, [loading, user, redirectTo, setLocation]);

  // Loading state
  if (loading) {
    return <FullPageSpinner />;
  }

  // Not logged in
  if (!user) {
    return null;
  }

  // User is not a beneficiary
  if (!isBeneficiary(user)) {
    if (import.meta.env.DEV) {
      console.debug("[auth] RequireBeneficiary: staff/admin user blocked", {
        userId: user.id,
        userType: (user as any)?.userType,
        role: (user as any)?.role,
      });
    }
    return <Forbidden redirectTo="/dashboard" />;
  }

  // User is authorized - render children
  return <>{children}</>;
}
