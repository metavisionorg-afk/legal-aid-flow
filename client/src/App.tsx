import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PortalLayout } from "@/components/layout/PortalLayout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Intake from "@/pages/Intake";
import Beneficiaries from "@/pages/Beneficiaries";
import Cases from "@/pages/Cases";
import CalendarPage from "@/pages/Calendar";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Tasks from "@/pages/Tasks";
import Rules from "@/pages/Rules";
import Consultations from "@/pages/Consultations";
import Sessions from "@/pages/Sessions";
import PortalLogin from "@/pages/portal/PortalLogin";
import PortalRegister from "@/pages/portal/PortalRegister";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import BeneficiaryRegister from "@/pages/BeneficiaryRegister";
import BeneficiaryPortal from "@/pages/BeneficiaryPortal";
import Forbidden from "@/pages/Forbidden";

// Initialize i18n
import "./i18n";

function StaffRoute({ component: Component }: any) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (user.userType !== "staff") {
    return <Forbidden redirectTo={user.userType === "beneficiary" ? "/beneficiary/portal" : "/portal"} />;
  }

  return <Component />;
}

function PortalRoute({ component: Component }: any) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/portal/login");
    return null;
  }

  if (user.userType !== "beneficiary") {
    setLocation("/");
    return null;
  }

  return (
    <PortalLayout>
      <Component />
    </PortalLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/beneficiary/register" component={BeneficiaryRegister} />

      {/* Staff Routes */}
      <Route path="/login" component={Login} />
      <Route path="/">
        {() => <StaffRoute component={Dashboard} />}
      </Route>
      <Route path="/intake">
        {() => <StaffRoute component={Intake} />}
      </Route>
      <Route path="/beneficiaries">
        {() => <StaffRoute component={Beneficiaries} />}
      </Route>
      <Route path="/cases">
        {() => <StaffRoute component={Cases} />}
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
      <Route path="/rules">
        {() => <StaffRoute component={Rules} />}
      </Route>
      <Route path="/consultations">
        {() => <StaffRoute component={Consultations} />}
      </Route>
      <Route path="/sessions">
        {() => <StaffRoute component={Sessions} />}
      </Route>
      <Route path="/settings">
        {() => <StaffRoute component={Settings} />}
      </Route>
      
      {/* Portal Routes */}
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/register" component={PortalRegister} />
      <Route path="/beneficiary/portal">
        {() => <PortalRoute component={BeneficiaryPortal} />}
      </Route>
      <Route path="/portal">
        {() => <PortalRoute component={PortalDashboard} />}
      </Route>
      <Route path="/portal/my-cases">
        {() => <PortalRoute component={PortalDashboard} />}
      </Route>
      <Route path="/portal/my-requests">
        {() => <PortalRoute component={PortalDashboard} />}
      </Route>
      <Route path="/portal/my-appointments">
        {() => <PortalRoute component={PortalDashboard} />}
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
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
