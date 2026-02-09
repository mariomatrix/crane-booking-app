import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      setLocation("/");
    }
  }, [loading, user, setLocation]);

  if (loading) return null;
  if (!user || user.role !== "admin") return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
