import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Home from "./pages/Home";
import NewReservation from "./pages/NewReservation";
import MyReservations from "./pages/MyReservations";
import MyVessels from "./pages/MyVessels";
import AuthPage from "./pages/AuthPage";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminReservations from "./pages/admin/AdminReservations";
import AdminCranes from "./pages/admin/AdminCranes";
import AdminCalendar from "./pages/admin/AdminCalendar";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminServiceTypes from "./pages/admin/AdminServiceTypes";
import AdminSeasons from "./pages/admin/AdminSeasons";
import AdminHolidays from "./pages/admin/AdminHolidays";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import Profile from "./pages/Profile";
import PrivacyPolicy from "./pages/PrivacyPolicy";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/new-reservation" component={NewReservation} />
      <Route path="/my-reservations" component={MyReservations} />
      <Route path="/my-vessels" component={MyVessels} />
      <Route path="/profile" component={Profile} />
      <Route path="/privacy" component={PrivacyPolicy} />

      {/* Admin routes */}
      <Route path="/admin">
        <AdminLayout><AdminDashboard /></AdminLayout>
      </Route>
      <Route path="/admin/reservations">
        <AdminLayout><AdminReservations /></AdminLayout>
      </Route>
      <Route path="/admin/cranes">
        <AdminLayout><AdminCranes /></AdminLayout>
      </Route>
      <Route path="/admin/calendar">
        <AdminLayout><AdminCalendar /></AdminLayout>
      </Route>
      <Route path="/admin/settings">
        <AdminLayout><AdminSettings /></AdminLayout>
      </Route>
      <Route path="/admin/users">
        <AdminLayout><AdminUsers /></AdminLayout>
      </Route>
      <Route path="/admin/analytics">
        <AdminLayout><AdminAnalytics /></AdminLayout>
      </Route>
      <Route path="/admin/service-types">
        <AdminServiceTypes />
      </Route>
      <Route path="/admin/seasons">
        <AdminLayout><AdminSeasons /></AdminLayout>
      </Route>
      <Route path="/admin/holidays">
        <AdminLayout><AdminHolidays /></AdminLayout>
      </Route>
      <Route path="/admin/audit-log">
        <AdminLayout><AdminAuditLog /></AdminLayout>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <LangProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
