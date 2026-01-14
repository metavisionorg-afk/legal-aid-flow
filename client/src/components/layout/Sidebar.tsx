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
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const showLawyerPortal = isLawyer(user);
  const showStaffCasesGroup = Boolean(user && (user as any).userType === "staff");
  const isAdmin = Boolean(user && ((user as any).role === "admin" || (user as any).role === "super_admin"));

  // Collapsible state for hierarchical navigation groups
  const shouldOpenCasesGroup = useMemo(
    () => Boolean(
      location.startsWith("/cases") || 
      location.startsWith("/case-types") || 
      location.startsWith("/beneficiaries") || 
      location.startsWith("/lawyers") || 
      location.startsWith("/power-of-attorney")
    ),
    [location],
  );

  const shouldOpenSessionsGroup = useMemo(
    () => Boolean(location.startsWith("/sessions")),
    [location],
  );

  const shouldOpenJudicialServicesGroup = useMemo(
    () => Boolean(location.startsWith("/judicial-services")),
    [location],
  );

  const shouldOpenDocumentsGroup = useMemo(
    () => Boolean(location.startsWith("/documents-library")),
    [location],
  );

  const shouldOpenOrganizationGroup = useMemo(
    () => Boolean(location.startsWith("/tasks") || location.startsWith("/calendar")),
    [location],
  );

  const shouldOpenSettingsGroup = useMemo(
    () => Boolean(location.startsWith("/settings") || location.startsWith("/rules")),
    [location],
  );

  const [casesGroupOpen, setCasesGroupOpen] = useState<boolean>(shouldOpenCasesGroup);
  const [sessionsGroupOpen, setSessionsGroupOpen] = useState<boolean>(shouldOpenSessionsGroup);
  const [judicialServicesGroupOpen, setJudicialServicesGroupOpen] = useState<boolean>(shouldOpenJudicialServicesGroup);
  const [documentsGroupOpen, setDocumentsGroupOpen] = useState<boolean>(shouldOpenDocumentsGroup);
  const [organizationGroupOpen, setOrganizationGroupOpen] = useState<boolean>(shouldOpenOrganizationGroup);
  const [settingsGroupOpen, setSettingsGroupOpen] = useState<boolean>(shouldOpenSettingsGroup);

  useEffect(() => {
    if (shouldOpenCasesGroup) setCasesGroupOpen(true);
  }, [shouldOpenCasesGroup]);

  useEffect(() => {
    if (shouldOpenSessionsGroup) setSessionsGroupOpen(true);
  }, [shouldOpenSessionsGroup]);

  useEffect(() => {
    if (shouldOpenJudicialServicesGroup) setJudicialServicesGroupOpen(true);
  }, [shouldOpenJudicialServicesGroup]);

  useEffect(() => {
    if (shouldOpenDocumentsGroup) setDocumentsGroupOpen(true);
  }, [shouldOpenDocumentsGroup]);

  useEffect(() => {
    if (shouldOpenOrganizationGroup) setOrganizationGroupOpen(true);
  }, [shouldOpenOrganizationGroup]);

  useEffect(() => {
    if (shouldOpenSettingsGroup) setSettingsGroupOpen(true);
  }, [shouldOpenSettingsGroup]);

  const lawyerNavItems = [
    { icon: LayoutDashboard, label: t("lawyer.dashboard"), href: "/lawyer/dashboard" },
    { icon: Briefcase, label: t("lawyer.my_cases"), href: "/lawyer/cases" },
  ];


  // Active states for all menu items
  const dashboardActive = Boolean(location === "/" || location === "/dashboard");
  const casesListActive = Boolean(location === "/cases" || location.startsWith("/cases/"));
  const caseTypesActive = Boolean(location === "/case-types" || location.startsWith("/case-types/"));
  const beneficiariesActive = Boolean(location === "/beneficiaries" || location.startsWith("/beneficiaries/"));
  const lawyersActive = Boolean(location === "/lawyers" || location.startsWith("/lawyers/"));
  const poaActive = Boolean(location === "/power-of-attorney" || location.startsWith("/power-of-attorney/"));
  const sessionsActive = Boolean(location === "/sessions" || location.startsWith("/sessions/"));
  const judicialServicesListActive = Boolean(location === "/judicial-services" && !location.includes("/settings"));
  const judicialServicesSettingsActive = Boolean(location === "/judicial-services/settings" || location.startsWith("/judicial-services/settings"));
  const documentsLibraryActive = Boolean(location === "/documents-library" || location.startsWith("/documents-library/"));
  const tasksActive = Boolean(location === "/tasks" || location.startsWith("/tasks/"));
  const calendarActive = Boolean(location === "/calendar" || location.startsWith("/calendar/"));
  const reportsActive = Boolean(location === "/reports" || location.startsWith("/reports/"));
  const settingsActive = Boolean(location === "/settings" && !location.includes("/rules"));
  const rulesActive = Boolean(location === "/rules" || location.startsWith("/rules/"));

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

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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

        {/* لوحة التحكم - Dashboard Section */}
        <div className="space-y-1">
          <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
            {t("nav.dashboard_section")}
          </div>
          <Link href="/">
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                dashboardActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <LayoutDashboard className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
              {t("nav.dashboard")}
            </div>
          </Link>
        </div>

        {/* القضايا - Cases Section */}
        {showStaffCasesGroup && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.cases_section")}
            </div>
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
                  {isAdmin && (
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
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* الأطراف - Parties Section */}
        {user?.userType === "staff" && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.parties_section")}
            </div>
            <Link href="/beneficiaries">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  beneficiariesActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Users className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.beneficiaries")}
              </div>
            </Link>
            <Link href="/lawyers">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  lawyersActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Scale className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.lawyers")}
              </div>
            </Link>
            {isAdmin && (
              <Link href="/power-of-attorney">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    poaActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <FilePlus className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                  {t("nav.powers_of_attorney")}
                </div>
              </Link>
            )}
          </div>
        )}

        {/* الجلسات والمتابعة - Sessions & Follow-up Section */}
        {user?.userType === "staff" && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.sessions_section")}
            </div>
            <Link href="/sessions">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  sessionsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Gavel className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.sessions")}
              </div>
            </Link>
          </div>
        )}

        {/* الخدمات القضائية - Judicial Services Section */}
        {user?.userType === "staff" && isAdmin && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.judicial_services_section")}
            </div>
            <Collapsible open={judicialServicesGroupOpen} onOpenChange={setJudicialServicesGroupOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    shouldOpenJudicialServicesGroup
                      ? "bg-sidebar-accent/50 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Scale className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                    {t("nav.judicial_services")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      judicialServicesGroupOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 space-y-1 pl-7 rtl:pr-7 rtl:pl-0">
                  <Link href="/judicial-services">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                        judicialServicesListActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {t("nav.judicial_services_list")}
                    </div>
                  </Link>
                  <Link href="/judicial-services/settings">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                        judicialServicesSettingsActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {t("nav.judicial_services_settings")}
                    </div>
                  </Link>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* المستندات - Documents Section */}
        {user?.userType === "staff" && isAdmin && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.documents_section")}
            </div>
            <Link href="/documents-library">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  documentsLibraryActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Folder className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.documents_library")}
              </div>
            </Link>
          </div>
        )}

        {/* التنظيم والإدارة - Organization & Management Section */}
        {user?.userType === "staff" && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.organization_section")}
            </div>
            <Link href="/tasks">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  tasksActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <ClipboardList className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.tasks")}
              </div>
            </Link>
            <Link href="/calendar">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  calendarActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Calendar className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.calendar")}
              </div>
            </Link>
          </div>
        )}

        {/* التقارير - Reports Section */}
        {user?.userType === "staff" && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.reports_section")}
            </div>
            <Link href="/reports">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  reportsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <BarChart3 className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("nav.reports")}
              </div>
            </Link>
          </div>
        )}

        {/* الإعدادات - Settings Section */}
        {user?.userType === "staff" && (
          <div className="space-y-1 pt-2">
            <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
              {t("nav.settings_section")}
            </div>
            <Collapsible open={settingsGroupOpen} onOpenChange={setSettingsGroupOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    shouldOpenSettingsGroup
                      ? "bg-sidebar-accent/50 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Settings className="h-4 w-4 rtl:ml-2 rtl:mr-0" />
                    {t("nav.settings")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      settingsGroupOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 space-y-1 pl-7 rtl:pr-7 rtl:pl-0">
                  <Link href="/settings">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                        settingsActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {t("nav.settings_main")}
                    </div>
                  </Link>
                  <Link href="/rules">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                        rulesActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {t("nav.rules")}
                    </div>
                  </Link>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
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
          {t('app.logout')}
        </div>
      </div>
    </div>
  );
}
