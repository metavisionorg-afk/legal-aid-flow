import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { isLawyer } from "@/lib/authz";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Scale,
  MessageSquare,
  Calendar,
  Gavel,
  ClipboardList,
  Wallet,
  Shield,
  Settings,
  LogOut,
  FilePlus,
  BarChart3,
  ChevronDown,
  Folder,
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const showLawyerPortal = isLawyer(user);
  const showStaffCasesGroup = Boolean(user && (user as any).userType === "staff");
  const isAdmin = Boolean(user && ((user as any).role === "admin" || (user as any).role === "super_admin"));

  const shouldOpenCasesGroup = useMemo(
    () => Boolean(location.startsWith("/cases") || location.startsWith("/case-types") || location.startsWith("/power-of-attorney")),
    [location],
  );

  const [casesGroupOpen, setCasesGroupOpen] = useState<boolean>(shouldOpenCasesGroup);

  useEffect(() => {
    if (shouldOpenCasesGroup) setCasesGroupOpen(true);
  }, [shouldOpenCasesGroup]);

  const lawyerNavItems = [
    { icon: LayoutDashboard, label: t("lawyer.dashboard"), href: "/lawyer/dashboard" },
    { icon: Briefcase, label: t("lawyer.my_cases"), href: "/lawyer/cases" },
  ];

  const navItems = [
    { icon: LayoutDashboard, label: t('app.dashboard'), href: "/" },
    { icon: Users, label: t('app.beneficiaries'), href: "/beneficiaries" },
    { icon: Scale, label: t('app.lawyers'), href: "/lawyers" },
    { icon: Gavel, label: t('app.sessions'), href: "/sessions" },
    { icon: MessageSquare, label: t('app.consultations'), href: "/consultations" },
    { icon: ClipboardList, label: t('app.tasks'), href: "/tasks" },
    { icon: Shield, label: t('app.rules'), href: "/rules" },
    { icon: Calendar, label: t('app.calendar'), href: "/calendar" },
    { icon: BarChart3, label: t('app.reports'), href: "/reports" },
    { icon: Settings, label: t('app.settings'), href: "/settings" },
  ];

  const casesListActive = Boolean(location === "/cases" || location.startsWith("/cases/"));
  const caseTypesActive = Boolean(location === "/case-types" || location.startsWith("/case-types/"));
  const poaActive = Boolean(location === "/power-of-attorney" || location.startsWith("/power-of-attorney/"));
  const documentsLibraryActive = Boolean(location === "/documents-library" || location.startsWith("/documents-library/"));
  const judicialServicesActive = Boolean(location === "/judicial-services" || location.startsWith("/judicial-services/"));

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
        {showLawyerPortal ? (
          <div className="pb-2">
            <div className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/60">
              {t("app.lawyer_portal")}
            </div>
            <div className="space-y-1">
              {lawyerNavItems.map((item) => (
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
            </div>
            <div className="my-2 h-px bg-sidebar-border" />
          </div>
        ) : null}

        {showStaffCasesGroup ? (
          <Collapsible open={casesGroupOpen} onOpenChange={setCasesGroupOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  shouldOpenCasesGroup
                    ? "bg-sidebar-accent/50 text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                  {t("nav.cases")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    casesGroupOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-1 space-y-1 pl-7 rtl:pr-7 rtl:pl-0">
                <Link href="/cases">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      casesListActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    {t("nav.cases_list")}
                  </div>
                </Link>
                <Link href="/case-types">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      caseTypesActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    {t("nav.case_types")}
                  </div>
                </Link>

                {isAdmin ? (
                  <Link href="/power-of-attorney">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                        poaActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {t("nav.powers_of_attorney")}
                    </div>
                  </Link>
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {user?.userType === "staff" && isAdmin ? (
          <Link href="/documents-library">
            <div
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                documentsLibraryActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Folder className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t("sidebar.documentsLibrary")}
            </div>
          </Link>
        ) : null}

        {user?.userType === "staff" && isAdmin ? (
          <Link href="/judicial-services">
            <div
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                judicialServicesActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Gavel className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t("sidebar.judicialServices")}
            </div>
          </Link>
        ) : null}

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
            const { authAPI } = await import("@/lib/api");
            await authAPI.logout();
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
          {t('app.logout')}
        </div>
      </div>
    </div>
  );
}
