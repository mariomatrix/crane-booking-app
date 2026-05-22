import { useLocation } from "wouter";
import { Home, ClipboardList, Plus, User } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { t } = useLang();

  const navItems = [
    { icon: Home, label: t.nav.calendar, path: "/" },
    { icon: ClipboardList, label: t.nav.myReservations, path: "/my-reservations" },
    { icon: Plus, label: t.nav.newReservation, path: "/new-reservation", primary: true },
    { icon: User, label: t.nav.profile, path: "/profile" },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around h-16 px-2 pb-safe">
      {navItems.map((item) => {
        const isActive = location === item.path;
        return (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-[64px] transition-colors",
              isActive ? "text-primary" : "text-muted-foreground",
              item.primary && "relative -top-4 bg-primary text-primary-foreground rounded-full h-14 w-14 shadow-lg active:scale-95 transition-transform"
            )}
          >
            <item.icon className={cn(item.primary ? "h-6 w-6" : "h-5 w-5")} />
            {!item.primary && (
              <span className="text-[10px] font-medium leading-none truncate max-w-[80px]">
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
