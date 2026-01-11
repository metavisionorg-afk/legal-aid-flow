import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LayoutDashboard, Briefcase, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function LawyerPortalLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { logout } = useAuth();

  const navItems = [
    { icon: LayoutDashboard, label: t("lawyer.dashboard"), href: "/lawyer/dashboard" },
    { icon: Briefcase, label: t("lawyer.my_cases"), href: "/lawyer/cases" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="h-screen w-64 border-r bg-sidebar flex flex-col sticky top-0">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-semibold text-xl text-sidebar-foreground">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
              A
            </div>
            <span>{t("lawyer.portal_title")}</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  location === item.href
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer"
            onClick={async () => {
              await logout();
              setLocation("/portal", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
            {t("app.logout")}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b bg-card sticky top-0 z-10 flex items-center justify-between px-6">
          <div className="font-semibold">{t("lawyer.portal_title")}</div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6">{children}</main>
      </div>
    </div>
  );
}
