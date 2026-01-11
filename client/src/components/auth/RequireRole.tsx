import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getRole } from "@/lib/authz";
import Forbidden from "@/pages/Forbidden";

export function RequireRole(props: {
  role: string | string[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const requiredRoles = Array.isArray(props.role) ? props.role : [props.role];

  useEffect(() => {
    if (!loading && !user) {
      if (import.meta.env.DEV) {
        console.debug("[auth] RequireRole: guest -> /portal", {
          from: location,
          required: requiredRoles,
        });
      }
      setLocation("/portal", { replace: true });
    }
  }, [loading, user, setLocation, location, requiredRoles]);

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
    if (import.meta.env.DEV) {
      console.debug("[auth] RequireRole: forbidden", {
        from: location,
        required: requiredRoles,
        actual: role,
      });
    }
    return <Forbidden />;
  }

  return <>{props.children}</>;
}
