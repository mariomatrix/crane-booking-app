import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import Calendar from "./Calendar";
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  Plus,
  Settings,
  Construction,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-14 items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocation("/")}
          >
            <Construction className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg tracking-tight hidden sm:inline">
              Crane Booking
            </span>
          </div>

          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="text-sm"
            >
              <CalendarDays className="h-4 w-4 mr-1.5" />
              Calendar
            </Button>

            {user && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/my-reservations")}
                  className="text-sm"
                >
                  <ClipboardList className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">My Reservations</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLocation("/new-reservation")}
                  className="text-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">New Reservation</span>
                </Button>
              </>
            )}

            {loading ? (
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse ml-2" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="ml-1 p-1">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground">{user.email ?? ""}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/my-reservations")}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    My Reservations
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem onClick={() => setLocation("/admin")}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="ml-2"
              >
                Sign In
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Calendar Content */}
      <Calendar />
    </div>
  );
}
