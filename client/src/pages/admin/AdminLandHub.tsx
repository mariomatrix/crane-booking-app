import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  Anchor,
  GitCompare,
  LayoutGrid,
  ListOrdered,
  Sliders,
  Calendar,
  RefreshCw,
  Layers,
  ArrowRightLeft,
  Building2,
} from "lucide-react";
import { ConflictsPanel } from "@/components/land/ConflictsPanel";
import { FlowMatrixTab } from "@/components/land/FlowMatrixTab";
import { ZoneSpotsGridTab } from "@/components/land/ZoneSpotsGridTab";
import { AffinitiesConfigTab } from "@/components/land/AffinitiesConfigTab";
import AdminLandWaiting from "./AdminLandWaiting";
import AdminLandZones from "./AdminLandZones";

export default function AdminLandHub() {
  const { lang } = useLang();
  const isHr = lang === "hr";
  const [location, setLocation] = useLocation();

  // Parse active tab from query string e.g. /admin/land-hub?tab=zones
  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get("tab") || "matrix";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Selected date for matrix and balance calculations
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Sub-view inside zones tab: "spots" (new visual grid) vs "manage" (classic zone crud)
  const [zoneSubView, setZoneSubView] = useState<"spots" | "manage">("spots");

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

  // Query daily capacity balance and conflicts for top panel
  const { data: balanceData, refetch: refetchBalance } = trpc.landFlow.getDailyBalance.useQuery({
    dateStr: selectedDate,
  });

  const conflicts = balanceData?.conflicts || [];
  const minFreeSpots = balanceData?.minimumProjectedFreeSpots ?? 0;
  const firstDeficitAt = balanceData?.firstDeficitAt;

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
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
                  ? "Dnevna matrica kretanja, alokacija mjesta na kopnu, lista čekanja i usklađivanje rada dizalica"
                  : "Daily movement matrix, spot allocation, waiting list and crane routing optimization"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchBalance()}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isHr ? "Osvježi stanje" : "Refresh"}</span>
          </Button>
        </div>
      </div>

      {/* Global Conflicts Panel (Non-pulsing, static alert cards) */}
      <ConflictsPanel
        conflicts={conflicts}
        minimumProjectedFreeSpots={minFreeSpots}
        firstDeficitAt={firstDeficitAt}
        onResolve={(conflict) => {
          if (conflict.code === "DOUBLE_BOOKING" || conflict.code === "BUFFER_VIOLATION") {
            handleTabChange("matrix");
          } else if (conflict.code === "AFFINITY_MISMATCH") {
            handleTabChange("affinities");
          } else {
            handleTabChange("zones");
          }
        }}
      />

      {/* Master Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-muted/60 p-1 rounded-xl border flex flex-wrap h-auto gap-1">
          <TabsTrigger
            value="matrix"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Matrica kretanja (Turnaround)" : "Flow Matrix"}</span>
          </TabsTrigger>

          <TabsTrigger
            value="zones"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Kopnena mjesta & Zone" : "Spots & Zones"}</span>
          </TabsTrigger>

          <TabsTrigger
            value="waiting"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <ListOrdered className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Lista čekanja za suhi vez" : "Waiting List"}</span>
          </TabsTrigger>

          <TabsTrigger
            value="affinities"
            className="text-xs font-semibold gap-1.5 py-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>{isHr ? "Pravila dizalica & Afiniteti" : "Crane Affinities"}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Flow Matrix */}
        <TabsContent value="matrix" className="m-0 focus-visible:outline-none">
          <FlowMatrixTab
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onNavigateToWaitlist={() => handleTabChange("waiting")}
          />
        </TabsContent>

        {/* Tab 2: Spots & Zones */}
        <TabsContent value="zones" className="m-0 focus-visible:outline-none space-y-4">
          <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={zoneSubView === "spots" ? "default" : "outline"}
                onClick={() => setZoneSubView("spots")}
                className="h-7 text-xs gap-1.5"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Prikaz pojedinačnih mjesta (Grid)</span>
              </Button>
              <Button
                size="sm"
                variant={zoneSubView === "manage" ? "default" : "outline"}
                onClick={() => setZoneSubView("manage")}
                className="h-7 text-xs gap-1.5"
              >
                <Building2 className="w-3 h-3" />
                <span>Upravljanje zonama i boravcima</span>
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              192 numerirana mjesta u 6 kopnenih zona (LB, A1, A2, A3, ZO, SZ)
            </span>
          </div>

          {zoneSubView === "spots" ? (
            <ZoneSpotsGridTab />
          ) : (
            <div className="border rounded-2xl p-2 bg-background">
              <AdminLandZones />
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Waiting list */}
        <TabsContent value="waiting" className="m-0 focus-visible:outline-none">
          <div className="border rounded-2xl p-2 bg-background">
            <AdminLandWaiting />
          </div>
        </TabsContent>

        {/* Tab 4: Crane Affinities */}
        <TabsContent value="affinities" className="m-0 focus-visible:outline-none">
          <AffinitiesConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
