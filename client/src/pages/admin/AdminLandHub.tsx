import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  Anchor,
  LayoutGrid,
  ListOrdered,
  Sliders,
  Calendar,
  Layers,
  ArrowRightLeft,
  Building2,
  Cpu,
} from "lucide-react";
import { DispatchCenterTab } from "@/components/landDispatch/DispatchCenterTab";
import { AffinitySettingsTab } from "@/components/landDispatch/AffinitySettingsTab";
import { WaitingOffersTab } from "@/components/landDispatch/WaitingOffersTab";
import { ZoneSpotsGridTab } from "@/components/land/ZoneSpotsGridTab";
import AdminLandZones from "./AdminLandZones";
import AdminLandWaiting from "./AdminLandWaiting";

export default function AdminLandHub() {
  const { lang } = useLang();
  const isHr = lang === "hr";
  const [location, setLocation] = useLocation();

  // Parse active tab from query string e.g. /admin/land-hub?tab=dispatch
  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get("tab") || "dispatch";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Selected date for dispatch center
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Sub-view inside zones tab: "manage" (vessels list & zone crud) vs "spots" (visual grid)
  const [zoneSubView, setZoneSubView] = useState<"manage" | "spots">("manage");

  // Sub-view inside waiting tab: "list" (full waitlist table) vs "offers" (time offers with hold)
  const [waitingSubView, setWaitingSubView] = useState<"list" | "offers">("list");

  // Keep URL query in sync when active tab changes
  const handleTabChange = (val: string) => {
    setActiveTab(val);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", val);
    window.history.replaceState({}, "", url.toString());
  };

  // Sync state if URL search changes externally
  useEffect(() => {
    const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [window.location.search]);

  // Query overview to get zones and cranes for child tabs
  const { data: overview } = trpc.landDispatch.getDailyOverview.useQuery(
    { dateStr: selectedDate },
    { staleTime: 30000 }
  );

  const zones = overview?.zones || [];
  const cranes = overview?.cranes || [];

  // Query waiting list count for Tab 3 badge
  const { data: waitingList = [] } = trpc.landWaiting.listAll.useQuery(undefined, {
    staleTime: 30000,
  });
  const waitingCount = waitingList.length;

  return (
    <div className="space-y-3 pb-8">
      {/* Top Header according to Dispecher_UI_specifikacija.md Section 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Anchor className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>DISPEČERSKI CENTAR</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Riva & Kopno
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isHr
                ? "Središnji dnevni operativni centar dizalica, zone suhog veza (SZ, A1-A3, ZO, LB), operativni raspored i lista čekanja"
                : "Central daily crane dispatch board, dry berth zones (SZ, A1-A3, ZO, LB), operational schedule and waitlist"}
            </p>
          </div>
        </div>
      </div>

      {/* Master 4 Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
        <div className="flex items-center justify-between border-b pb-1">
          <TabsList className="bg-muted/50 p-1 rounded-xl border flex flex-wrap h-auto gap-1">
            {/* Tab 1: Dispečer */}
            <TabsTrigger
              value="dispatch"
              className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>{isHr ? "Dispečer" : "Dispatch"}</span>
            </TabsTrigger>

            {/* Tab 2: Zone i zauzeće */}
            <TabsTrigger
              value="zones"
              className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-primary" />
              <span>{isHr ? "Zone i zauzeće" : "Zones & Berth"}</span>
            </TabsTrigger>

            {/* Tab 3: Lista čekanja */}
            <TabsTrigger
              value="waiting"
              className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <ListOrdered className="w-3.5 h-3.5 text-primary" />
              <span>{isHr ? "Lista čekanja" : "Waiting List"}</span>
              {waitingCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-[10px] h-4 px-1.5 font-bold rounded-full"
                >
                  {waitingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab 4: Postavke (placed on the right) */}
          <TabsList className="bg-muted/50 p-1 rounded-xl border h-auto">
            <TabsTrigger
              value="settings"
              className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Sliders className="w-3.5 h-3.5 text-primary" />
              <span>{isHr ? "⚙ Postavke" : "⚙ Settings"}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Dispatch Center */}
        <TabsContent value="dispatch" className="m-0 focus-visible:outline-none">
          <DispatchCenterTab
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </TabsContent>

        {/* Tab 2: Zones & Dry Berth */}
        <TabsContent value="zones" className="m-0 focus-visible:outline-none space-y-4">
          <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={zoneSubView === "manage" ? "default" : "outline"}
                onClick={() => setZoneSubView("manage")}
                className="h-7 text-xs gap-1.5"
              >
                <Building2 className="w-3 h-3" />
                <span>Plovila na kopnu & Zone</span>
              </Button>
              <Button
                size="sm"
                variant={zoneSubView === "spots" ? "default" : "outline"}
                onClick={() => setZoneSubView("spots")}
                className="h-7 text-xs gap-1.5"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Grafička mreža mjesta (Grid)</span>
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              192 mjesta u 6 kopnenih zona (SZ, A1, A2, A3, ZO, LB)
            </span>
          </div>

          {zoneSubView === "manage" ? (
            <div className="border rounded-2xl p-2 bg-background">
              <AdminLandZones />
            </div>
          ) : (
            <ZoneSpotsGridTab />
          )}
        </TabsContent>

        {/* Tab 3: Waiting List & Scheduling */}
        <TabsContent value="waiting" className="m-0 focus-visible:outline-none space-y-4">
          <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={waitingSubView === "list" ? "default" : "outline"}
                onClick={() => setWaitingSubView("list")}
                className="h-7 text-xs gap-1.5"
              >
                <ListOrdered className="w-3 h-3" />
                <span>Lista čekanja za suhi vez</span>
              </Button>
              <Button
                size="sm"
                variant={waitingSubView === "offers" ? "default" : "outline"}
                onClick={() => setWaitingSubView("offers")}
                className="h-7 text-xs gap-1.5"
              >
                <Layers className="w-3 h-3" />
                <span>Ponude termina & Hold (24h rok)</span>
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Uređivanje dizalice/zone, promjena prioriteta i raspoređivanje na vez
            </span>
          </div>

          {waitingSubView === "list" ? (
            <AdminLandWaiting />
          ) : (
            <WaitingOffersTab
              dateStr={selectedDate}
              zones={zones}
              cranes={cranes}
            />
          )}
        </TabsContent>

        {/* Tab 4: Settings (Affinities & Teams) */}
        <TabsContent value="settings" className="m-0 focus-visible:outline-none">
          <AffinitySettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
