import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Intake from "@/pages/Intake";
import Beneficiaries from "@/pages/Beneficiaries";
import Cases from "@/pages/Cases";
import CalendarPage from "@/pages/Calendar";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";

// Initialize i18n
import "./i18n";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/intake" component={Intake} />
      <Route path="/beneficiaries" component={Beneficiaries} />
      <Route path="/cases" component={Cases} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/reports" component={Reports} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
