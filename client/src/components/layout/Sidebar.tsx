import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  Settings,
  LogOut,
  FilePlus,
  BarChart3
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { icon: LayoutDashboard, label: t('app.dashboard'), href: "/" },
    { icon: Users, label: t('app.beneficiaries'), href: "/beneficiaries" },
    { icon: FilePlus, label: t('app.intake'), href: "/intake" },
    { icon: Briefcase, label: t('app.cases'), href: "/cases" },
    { icon: Calendar, label: t('app.calendar'), href: "/calendar" },
    { icon: BarChart3, label: t('app.reports'), href: "/reports" },
    { icon: Settings, label: t('app.settings'), href: "/settings" },
  ];

  return (
    <div className="h-full w-64 border-r bg-sidebar flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-semibold text-xl text-sidebar-foreground">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
            A
          </div>
          <span>{t('app.title')}</span>
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
        <Link href="/login">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
            <LogOut className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
            {t('app.logout')}
          </div>
        </Link>
      </div>
    </div>
  );
}
