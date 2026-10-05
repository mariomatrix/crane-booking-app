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

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Anchor className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {isHr ? "Kopno & Suhi vez — Dispečerski centar" : "Land & Dry Berth Hub"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isHr
                ? "Dnevni raspored dizalica, Available-to-Promise kapacitet zona, 2 tima i lista čekanja"
                : "Daily crane timeline, Available-to-Promise zone capacity, 2-team dispatch and waiting list"}
            </p>
          </div>
        </div>
      </div>

      {/* Master 4 Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-muted/60 p-1 rounded-xl border flex flex-wrap h-auto gap-1">
          {/* Tab 1: Dispečer */}
          <TabsTrigger
            value="dispatch"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <Cpu className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Tab 1: Dispečer" : "Tab 1: Dispatch"}</span>
          </TabsTrigger>

          {/* Tab 2: Zone i zauzeće */}
          <TabsTrigger
            value="zones"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Tab 2: Zone & Suhi vez" : "Tab 2: Zones & Berth"}</span>
          </TabsTrigger>

          {/* Tab 3: Lista čekanja */}
          <TabsTrigger
            value="waiting"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <ListOrdered className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Tab 3: Lista čekanja" : "Tab 3: Waiting List"}</span>
          </TabsTrigger>

          {/* Tab 4: Postavke */}
          <TabsTrigger
            value="settings"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Postavke ⚙" : "Settings ⚙"}</span>
          </TabsTrigger>
        </TabsList>

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

        {/* Tab 3: Waiting List with Holds */}
        <TabsContent value="waiting" className="m-0 focus-visible:outline-none">
          <WaitingOffersTab
            dateStr={selectedDate}
            zones={zones}
            cranes={cranes}
          />
        </TabsContent>

        {/* Tab 4: Settings (Affinities & Teams) */}
        <TabsContent value="settings" className="m-0 focus-visible:outline-none">
          <AffinitySettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
