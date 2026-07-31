import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const adminOnlyRoutes = [
    "/admin/settings",
    "/admin/staff",
    "/admin/cranes",
    "/admin/service-types",
    "/admin/seasons",
    "/admin/holidays",
    "/admin/audit-log",
    "/admin/users",
  ];

  const isAdminOnly = adminOnlyRoutes.some(route => location.startsWith(route));

  useEffect(() => {
    if (!loading && user) {
      if (user.role !== "admin" && user.role !== "operator") {
        setLocation("/");
      } else if (user.role === "operator" && isAdminOnly) {
        setLocation("/admin/calendar");
      }
    }
  }, [loading, user, location, isAdminOnly, setLocation]);

  if (loading) return null;
  if (!user || (user.role !== "admin" && user.role !== "operator")) return null;
  if (user.role === "operator" && isAdminOnly) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}

