import { useAuth } from "@/_core/hooks/useAuth";
import { useLang } from "@/contexts/LangContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  ClipboardList,
  Construction,
  Home,
  Layers,
  Sun,
  Moon,
  CalendarOff,
  LogOut,
  PanelLeft,
  Settings,
  Shield,
  User,
  Users,
  BarChart3,
  Globe,
  History,
  Anchor,
  ListOrdered,
  FileText,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Footer } from "./Footer";
import { LanguageSelector } from "./LanguageSelector";

// menuItems moved inside component to support translations

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Admin Access Required
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sign in with an administrator account to access the admin panel.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { t, lang } = useLang();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "light" ? "dark" : "light");

  const isOperator = user?.role === "operator";

  const programSubItems = [
    { icon: Settings, label: t.admin.settings, path: "/admin/settings", adminOnly: true },
    { icon: Shield, label: lang === "hr" ? "Operateri i administratori" : "Staff Accounts", path: "/admin/staff", adminOnly: true },
    { icon: Construction, label: t.admin.cranes, path: "/admin/cranes", adminOnly: true },
    { icon: Layers, label: t.nav.operationTypes, path: "/admin/service-types", adminOnly: true },
    { icon: Sun, label: t.nav.seasons, path: "/admin/seasons", adminOnly: true },
    { icon: CalendarOff, label: t.nav.holidays, path: "/admin/holidays", adminOnly: true },
    { icon: Tag, label: lang === "hr" ? "Cjenik usluga" : "Pricelist", path: "/admin/pricelists", adminOnly: true },
  ].filter(item => !(isOperator && (item as any).adminOnly));

  const mainMenuItems = [
    { icon: CalendarDays, label: t.nav.calendar, path: "/admin/calendar" },
    { icon: Home, label: t.admin.dashboard, path: "/admin" },
    { icon: ClipboardList, label: t.admin.reservations, path: "/admin/reservations" },
    { icon: FileText, label: lang === "hr" ? "Radni nalozi" : "Work Orders", path: "/admin/work-orders" },
    { icon: Anchor, label: lang === "hr" ? "Mjesta na kopnu" : "Dry Berths", path: "/admin/land-zones" },
    { icon: ListOrdered, label: lang === "hr" ? "Lista čekanja za suhi vez" : "Dry Berth Waitlist", path: "/admin/land-waiting" },
    { icon: History, label: lang === "hr" ? "Rad dizalica" : "Crane Logs", path: "/admin/crane-ops" },
    { icon: Users, label: lang === "hr" ? "Korisnici i plovila" : "Clients & Vessels", path: "/admin/users", adminOnly: true },
    { icon: BarChart3, label: t.admin.analytics, path: "/admin/analytics" },
    ...(isOperator
      ? [{ icon: FileText, label: lang === "hr" ? "Plan rada dizalica" : "Crane Schedule", path: "/admin/reports/schedule" }]
      : [{ icon: FileText, label: lang === "hr" ? "Izvještaji" : "Reports", path: "/admin/reports" }]
    ),
    { icon: History, label: t.nav.auditLog, path: "/admin/audit-log", adminOnly: true },
  ].filter(item => !(isOperator && (item as any).adminOnly));

  const isProgramSettingsActive = programSubItems.some(item => item.path === location);
  const [isProgramSettingsOpen, setIsProgramSettingsOpen] = useState(isProgramSettingsActive);

  useEffect(() => {
    if (isProgramSettingsActive) {
      setIsProgramSettingsOpen(true);
    }
  }, [location]);

  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = [...mainMenuItems, ...programSubItems].find((item) => item.path === location);
  const isMobile = useIsMobile();

  // Unread messages polling (30s)
  const { data: unreadData } = trpc.message.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div 
                  className="flex flex-col min-w-0 shrink justify-center cursor-pointer hover:opacity-85 transition-opacity"
                  onClick={() => setLocation("/")}
                  title={lang === "hr" ? "Početna stranica" : "Home Page"}
                >
                  <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain max-w-[120px]" />
                  <span className="font-semibold text-xs text-muted-foreground tracking-tight truncate mt-1">
                    {t.nav.adminPanel}
                  </span>
                </div>
              ) : null}
              {!isCollapsed && (
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 focus-visible:ring-0"
                    title={theme === "light" ? (lang === "hr" ? "Tamni način" : "Dark Mode") : (lang === "hr" ? "Svijetli način" : "Light Mode")}
                  >
                    {theme === "light" ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <Sun className="h-4 w-4" />
                    )}
                  </Button>
                  <LanguageSelector variant="ghost" showLabel={false} />
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1 space-y-0.5">
              {mainMenuItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-9 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary font-bold" : ""}`}
                      />
                      <span>{item.label}</span>
                      {item.path === "/admin/reservations" && unreadCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Postavke programa Submenu Group */}
              {programSubItems.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isProgramSettingsActive}
                    onClick={() => setIsProgramSettingsOpen(prev => !prev)}
                    tooltip={t.admin.programSettings}
                    className="h-9 transition-all font-normal flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <SlidersHorizontal className={`h-4 w-4 shrink-0 ${isProgramSettingsActive ? "text-primary font-bold" : ""}`} />
                      <span className="truncate">{t.admin.programSettings}</span>
                    </div>
                    {isProgramSettingsOpen ? (
                      <ChevronDown className="h-4 w-4 opacity-60 shrink-0 group-data-[collapsible=icon]:hidden" />
                    ) : (
                      <ChevronRight className="h-4 w-4 opacity-60 shrink-0 group-data-[collapsible=icon]:hidden" />
                    )}
                  </SidebarMenuButton>

                  {isProgramSettingsOpen && (
                    <SidebarMenuSub className="ml-4 border-l border-border/60 pl-2 space-y-0.5 my-1">
                      {programSubItems.map((subItem) => {
                        const isSubActive = location === subItem.path;
                        return (
                          <SidebarMenuSubItem key={subItem.path}>
                            <SidebarMenuSubButton
                              isActive={isSubActive}
                              onClick={() => setLocation(subItem.path)}
                              className="h-8 transition-all font-normal text-xs flex items-center gap-2 cursor-pointer"
                            >
                              <subItem.icon className={`h-3.5 w-3.5 shrink-0 ${isSubActive ? "text-primary font-bold" : "text-muted-foreground"}`} />
                              <span className="truncate">{subItem.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )}

              {/* Home Page Link */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location === "/"}
                  onClick={() => setLocation("/")}
                  tooltip={lang === "hr" ? "Početna stranica" : "Home Page"}
                  className="h-9 transition-all font-normal"
                >
                  <Globe className="h-4 w-4" />
                  <span>{lang === "hr" ? "Početna stranica" : "Home Page"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>{t.nav.profile}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={toggleTheme}
                  className="cursor-pointer"
                >
                  {theme === "light" ? (
                    <>
                      <Moon className="mr-2 h-4 w-4" />
                      <span>{lang === "hr" ? "Tamni način" : "Dark Mode"}</span>
                    </>
                  ) : (
                    <>
                      <Sun className="mr-2 h-4 w-4" />
                      <span>{lang === "hr" ? "Svijetli način" : "Light Mode"}</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t.nav.signOut}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Admin"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 lg:p-6">
          {children}
          <div className="mt-8">
            <Footer />
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
