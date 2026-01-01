import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  User,
  FilePlus,
  LogOut
} from "lucide-react";
import { authAPI } from "@/lib/api";

export function PortalLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { icon: LayoutDashboard, label: t('app.dashboard'), href: "/portal" },
    { icon: Briefcase, label: t('portal.my_cases'), href: "/portal/my-cases" },
    { icon: FilePlus, label: t('portal.my_requests'), href: "/portal/my-requests" },
    { icon: Calendar, label: t('portal.my_appointments'), href: "/portal/my-appointments" },
    { icon: User, label: t('portal.my_profile'), href: "/portal/profile" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="h-screen w-64 border-r bg-sidebar flex flex-col sticky top-0">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-semibold text-xl text-sidebar-foreground">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
              A
            </div>
            <span>{t('portal.title')}</span>
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
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
              await authAPI.logout();
              window.location.href = "/portal/login";
            }}
          >
            <LogOut className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
            {t('app.logout')}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b bg-card sticky top-0 z-10 flex items-center justify-between px-6">
          <div className="font-semibold">{t('portal.welcome')}</div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
