import React, { useEffect } from "react";
import { useLocation, Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Toaster as ShadcnToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireRole } from "@/components/auth/RequireRole";
import { RequireBeneficiary } from "@/components/auth/RequireBeneficiary";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LawyerPortalLayout } from "@/components/layout/LawyerPortalLayout";
import LawyerDashboard from "@/pages/lawyer/LawyerDashboard";
import LawyerCases from "@/pages/lawyer/LawyerCases";import LawyerCaseDetail from "@/pages/lawyer/LawyerCaseDetail";import LawyerSessions from "@/pages/lawyer/LawyerSessions";
import LawyerDocuments from "@/pages/lawyer/LawyerDocuments";
import LawyerCalendar from "@/pages/lawyer/LawyerCalendar";
import NotFound from "@/pages/not-found";
import Forbidden from "@/pages/Forbidden";
import Dashboard from "@/pages/Dashboard";
import Intake from "@/pages/Intake";
import Beneficiaries from "@/pages/Beneficiaries";
import Cases from "@/pages/Cases";
import CaseTypes from "@/pages/CaseTypes";
import PowersOfAttorney from "@/pages/PowersOfAttorney";
import Lawyers from "@/pages/Lawyers";
import CalendarPage from "@/pages/Calendar";
import Reports from "@/pages/Reports";
import Tasks from "@/pages/Tasks";
import Finance from "@/pages/Finance";
import Rules from "@/pages/Rules";
import Consultations from "@/pages/Consultations";
import Sessions from "@/pages/Sessions";
import Settings from "@/pages/Settings";
import DocumentsLibrary from "@/pages/DocumentsLibrary";
import JudicialServices from "@/pages/JudicialServices";
import JudicialServicesSettings from "@/pages/JudicialServicesSettings";
import RegisterBeneficiary from "@/pages/RegisterBeneficiary";
import BeneficiaryRegister from "@/pages/BeneficiaryRegister";
import Login from "@/pages/Login";
import LawyerRegister from "@/pages/LawyerRegister";
import PortalLogin from "@/pages/portal/PortalLogin";
import PortalRegister from "@/pages/portal/PortalRegister";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalBookAppointment from "@/pages/portal/PortalBookAppointment";
import PortalMyCases from "@/pages/portal/PortalMyCases";
import PortalMyRequests from "@/pages/portal/PortalMyRequests";
import PortalTasks from "@/pages/portal/PortalTasks";
import PortalCaseDetail from "@/pages/portal/PortalCaseDetail";
import PortalSessions from "@/pages/portal/PortalSessions";
import PortalDocuments from "@/pages/portal/PortalDocuments";
import PortalRequests from "@/pages/portal/PortalRequests";
import PortalNotifications from "@/pages/portal/PortalNotifications";
import PortalCalendar from "@/pages/portal/PortalCalendar";
import PortalProfile from "@/pages/portal/PortalProfile";
import PortalSupport from "@/pages/portal/PortalSupport";
import BeneficiaryPortal from "@/pages/BeneficiaryPortal";
import { queryClient } from "@/lib/queryClient";

// Initialize i18n
import "./i18n";

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
}

function RedirectToLogin() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/login", { replace: true });
  }, [setLocation]);

  return <FullPageSpinner />;
}

// Landing behavior:
// - Not logged in => always go to beneficiary portal entry.
// - Beneficiary => portal.
// - Staff => staff dashboard.
function RootRedirect() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (import.meta.env.DEV) console.debug("[auth] guest -> /portal (root)");
      setLocation("/login", { replace: true });
      return;
    }

    const role = (user as any)?.role;
    if (user.userType === "beneficiary" || role === "beneficiary") {
      setLocation("/portal", { replace: true });
      return;
    }

    if (role === "lawyer") {
      setLocation("/lawyer/dashboard", { replace: true });
      return;
    }

    setLocation("/dashboard", { replace: true });
  }, [loading, user, setLocation]);

  if (loading) return <FullPageSpinner />;
  return null;
}

// Public portal entry.
// - Not logged in => show portal login.
// - Beneficiary => show portal dashboard.
// - Staff => go to staff dashboard.
function PortalIndex() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (import.meta.env.DEV) console.debug("[auth] guest -> /login (portal index)");
      setLocation("/login", { replace: true });
      return;
    }
    if (user.userType !== "beneficiary") {
      if (import.meta.env.DEV) console.debug("[auth] staff tried /portal -> /dashboard");
      setLocation("/dashboard", { replace: true });
    }
  }, [loading, user, setLocation]);

  if (loading) return <FullPageSpinner />;
  if (!user) return null;
  if (user.userType !== "beneficiary") return null;

  return (
    <PortalLayout>
      <PortalDashboard />
    </PortalLayout>
  );
}

function StaffRoute({ component: Component }: any) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    if (import.meta.env.DEV) console.debug("[auth] guest -> /login (staff route)");
    setLocation("/login", { replace: true });
    return null;
  }

  if (user.userType !== "staff") {
    if (import.meta.env.DEV) console.debug("[auth] forbidden: non-staff tried staff route", { path: location });
    return <Forbidden redirectTo="/portal" />;
  }

  // Lawyers should use the dedicated lawyer portal, not the staff UI.
  if ((user as any).role === "lawyer" && !location.startsWith("/lawyer")) {
    setLocation("/lawyer/dashboard", { replace: true });
    return null;
  }

  return <Component />;
}

/**
 * PortalRoute - Wrapper for beneficiary portal routes
 * Uses RequireBeneficiary for authentication and authorization
 */
function PortalRoute({ component: Component }: any) {
  return (
    <RequireBeneficiary>
      <PortalLayout>
        <Component />
      </PortalLayout>
    </RequireBeneficiary>
  );
}


// DocumentsLibrary is already imported above for lazy loading if needed.

function Router() {
  return (
    <Switch>
      <Route path="/register" component={RegisterBeneficiary} />
      <Route path="/beneficiary/register" component={BeneficiaryRegister} />
      <Route path="/lawyer-register" component={LawyerRegister} />

      {/* Staff Routes */}
      <Route path="/login" component={Login} />
      <Route path="/portal/login" component={RedirectToLogin} />
      <Route path="/dashboard">{() => <StaffRoute component={Dashboard} />}</Route>
      <Route path="/">{() => <RootRedirect />}</Route>
      <Route path="/documents-library">
        {() =>
          (
            <StaffRoute
              component={() => (
                <RequireRole role={["admin", "super_admin"]}>
                  <DocumentsLibrary />
                </RequireRole>
              )}
            />
          )
        }
      </Route>
      <Route path="/judicial-services">
        {() => (
          <StaffRoute
            component={() => (
              <RequireRole role={["admin", "super_admin"]}>
                <JudicialServices />
              </RequireRole>
            )}
          />
        )}
      </Route>
      <Route path="/judicial-services/settings">
        {() => (
          <StaffRoute
            component={() => (
              <RequireRole role={["admin", "super_admin"]}>
                <JudicialServicesSettings />
              </RequireRole>
            )}
          />
        )}
      </Route>
      <Route path="/intake">
        {() => <StaffRoute component={Intake} />}
      </Route>
      <Route path="/beneficiaries">
        {() => <StaffRoute component={Beneficiaries} />}
      </Route>
      <Route path="/cases/:id" component={Cases} />
      <Route path="/cases" component={Cases} />
      <Route path="/case-types">
        {() => (
          <StaffRoute
            component={() => (
              <RequireRole role={["admin", "super_admin"]}>
                <CaseTypes />
              </RequireRole>
            )}
          />
        )}
      </Route>
      <Route path="/power-of-attorney">
        {() => (
          <StaffRoute
            component={() => (
              <RequireRole role={["admin", "super_admin"]}>
                <PowersOfAttorney />
              </RequireRole>
            )}
          />
        )}
      </Route>
      <Route path="/lawyers">
        {() => <StaffRoute component={Lawyers} />}
      </Route>

      {/* Lawyer Portal (staff role=lawyer) */}
      <Route path="/lawyer/dashboard">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerDashboard />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/lawyer/cases">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerCases />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/lawyer/cases/:id">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerCaseDetail />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/lawyer/sessions">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerSessions />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/lawyer/documents">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerDocuments />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/lawyer/calendar">
        {() => (
          <RequireRole role="lawyer">
            <LawyerPortalLayout>
              <LawyerCalendar />
            </LawyerPortalLayout>
          </RequireRole>
        )}
      </Route>
      <Route path="/calendar">
        {() => <StaffRoute component={CalendarPage} />}
      </Route>
      <Route path="/reports">
        {() => <StaffRoute component={Reports} />}
      </Route>
      <Route path="/tasks">
        {() => <StaffRoute component={Tasks} />}
      </Route>
      <Route path="/finance">
        {() => <StaffRoute component={Finance} />}
      </Route>
      <Route path="/rules">
        {() => <StaffRoute component={Rules} />}
      </Route>
      <Route path="/consultations">
        {() => <Consultations />}
      </Route>
      <Route path="/sessions">
        {() => <StaffRoute component={Sessions} />}
      </Route>
      <Route path="/settings">
        {() => <StaffRoute component={Settings} />}
      </Route>
      
      {/* Forbidden Route */}
      <Route path="/forbidden">{() => <Forbidden />}</Route>
      
      {/* Portal Routes */}
      <Route path="/portal/register" component={PortalRegister} />
      <Route path="/beneficiary/portal">
        {() => <PortalRoute component={BeneficiaryPortal} />}
      </Route>
      <Route path="/beneficiary/dashboard">
        {() => <PortalRoute component={BeneficiaryPortal} />}
      </Route>
      <Route path="/portal">{() => <PortalIndex />}</Route>
      <Route path="/portal/book-appointment">
        {() => <PortalRoute component={PortalBookAppointment} />}
      </Route>
      <Route path="/portal/my-cases">
        {() => <PortalRoute component={PortalMyCases} />}
      </Route>
      <Route path="/portal/cases/:id">
        {() => <PortalRoute component={PortalCaseDetail} />}
      </Route>
      <Route path="/portal/tasks">
        {() => <PortalRoute component={PortalTasks} />}
      </Route>
      <Route path="/portal/sessions">
        {() => <PortalRoute component={PortalSessions} />}
      </Route>
      <Route path="/portal/documents">
        {() => <PortalRoute component={PortalDocuments} />}
      </Route>
      <Route path="/portal/requests">
        {() => <PortalRoute component={PortalRequests} />}
      </Route>
      <Route path="/portal/my-requests">
        {() => <PortalRoute component={PortalRequests} />}
      </Route>
      <Route path="/portal/notifications">
        {() => <PortalRoute component={PortalNotifications} />}
      </Route>
      <Route path="/portal/calendar">
        {() => <PortalRoute component={PortalCalendar} />}
      </Route>
      <Route path="/portal/profile">
        {() => <PortalRoute component={PortalProfile} />}
      </Route>
      <Route path="/portal/support">
        {() => <PortalRoute component={PortalSupport} />}
      </Route>
      <Route path="/portal/my-appointments">
        {() => <PortalRoute component={PortalCalendar} />}
      </Route>
      <Route path="/portal/profile">
        {() => <PortalRoute component={PortalDashboard} />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SonnerToaster />
          <ShadcnToaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
