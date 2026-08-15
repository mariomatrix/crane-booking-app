/**
 * PŠD Špinut — Interaktivni shematski akvatorij & Upravljanje vezovima
 * 
 * 1. Organski CSS/DOM shematski prikaz lučice (Sjeverni lukobran gore, Zapadna obala lijevo, Gatovi 1-12 u sredini, Suhi vez)
 * 2. Pametna tražilica s auto-fokusom i skrolanjem
 * 3. Pretraživi Combobox za dodjelu plovila s provjerom premještanja (sprječavanje višestrukih vezova)
 * 4. Puna podrška za operativni rad u realnom vremenu (14 gatova, 811 morskih vezova, suhi dokovi)
 */
import React, { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Search,
    Anchor,
    Ship,
    User,
    Phone,
    Mail,
    Zap,
    Droplets,
    AlertTriangle,
    CheckCircle2,
    Wrench,
    X,
    ExternalLink,
    Plus,
    Compass,
    SlidersHorizontal,
    Table,
    ArrowRightLeft,
    Layers,
    LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Konfiguracija statusa vezova
const STATUS_CONFIG: Record<
    string,
    { label: string; bg: string; border: string; text: string; fill: string; dot: string; badgeBg: string }
> = {
    vacant: {
        label: "Slobodan vez",
        bg: "bg-emerald-50/90 dark:bg-emerald-950/40 hover:bg-emerald-100",
        border: "border-emerald-500/80 dark:border-emerald-600",
        text: "text-emerald-800 dark:text-emerald-200",
        fill: "#10b981",
        dot: "bg-emerald-500",
        badgeBg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
    },
    occupied: {
        label: "Zauzet (Član)",
        bg: "bg-blue-50/95 dark:bg-blue-950/40 hover:bg-blue-100",
        border: "border-blue-500/80 dark:border-blue-600",
        text: "text-blue-900 dark:text-blue-100",
        fill: "#3b82f6",
        dot: "bg-blue-500",
        badgeBg: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
    },
    transit: {
        label: "Tranzitni gost",
        bg: "bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100",
        border: "border-amber-500 dark:border-amber-600",
        text: "text-amber-900 dark:text-amber-100",
        fill: "#f59e0b",
        dot: "bg-amber-500",
        badgeBg: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
    },
    debt_block: {
        label: "Dugovanje / Blokada",
        bg: "bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100",
        border: "border-rose-500 dark:border-rose-600",
        text: "text-rose-900 dark:text-rose-100",
        fill: "#ef4444",
        dot: "bg-rose-500",
        badgeBg: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
    },
    maintenance: {
        label: "Servis / Kvar muringa",
        bg: "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200",
        border: "border-slate-400 dark:border-slate-600",
        text: "text-slate-800 dark:text-slate-200",
        fill: "#64748b",
        dot: "bg-slate-500",
        badgeBg: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
    },
    reserved: {
        label: "Rezervirano",
        bg: "bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100",
        border: "border-purple-500 dark:border-purple-600",
        text: "text-purple-900 dark:text-purple-100",
        fill: "#a855f7",
        dot: "bg-purple-500",
        badgeBg: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200",
    },
};

export default function AdminAkvatorijMap() {
    const [, setLocation] = useLocation();

    // tRPC Queryji
    const { data: mapData, isLoading, refetch } = trpc.berths.getAkvatorijMapData.useQuery();
    const { data: assignableVessels } = trpc.berths.listAssignableVessels.useQuery();

    // Mutacije
    const updateStatusMutation = trpc.berths.updateStatus.useMutation({
        onSuccess: () => {
            toast.success("Status veza uspješno ažuriran");
            refetch();
            if (selectedBerth) {
                setSelectedBerth((prev: any) => ({ ...prev, status: pendingStatus }));
            }
        },
        onError: (err) => toast.error(`Greška: ${err.message}`),
    });

    const assignVesselMutation = trpc.berths.assignVessel.useMutation({
        onSuccess: () => {
            toast.success("Plovilo uspješno postavljeno na vez");
            setIsAssignModalOpen(false);
            setRelocationConflict(null);
            refetch();
            setSelectedBerth(null);
        },
        onError: (err) => {
            if (err.message.includes("se već nalazi na vezu")) {
                // Konflikt - otvori dijalog za potvrdu premještanja
                const targetVessel = assignableVessels?.find((v) => v.vesselId === selectedVesselId);
                setRelocationConflict({
                    vesselName: targetVessel?.vesselName || targetVessel?.vesselRegistration || "Odabrano plovilo",
                    vesselRegistration: targetVessel?.vesselRegistration || "",
                    message: err.message,
                });
            } else {
                toast.error(`Greška: ${err.message}`);
            }
        },
    });

    const unassignVesselMutation = trpc.berths.unassignVessel.useMutation({
        onSuccess: () => {
            toast.success("Vez je uspješno oslobođen");
            refetch();
            setSelectedBerth(null);
        },
        onError: (err) => toast.error(`Greška: ${err.message}`),
    });

    // Stanja UI-ja
    const [viewMode, setViewMode] = useState<"schematic" | "table">("schematic");
    const [selectedPierCode, setSelectedPierCode] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [highlightedBerthId, setHighlightedBerthId] = useState<string | null>(null);

    const [selectedBerth, setSelectedBerth] = useState<any | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string>("");

    // Modal za dodjelu plovila & pretraživi Combobox
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [vesselSearchQuery, setVesselSearchQuery] = useState("");
    const [selectedVesselId, setSelectedVesselId] = useState<string>("");
    const [contractNumber, setContractNumber] = useState<string>("");
    const [relocationConflict, setRelocationConflict] = useState<{
        vesselName: string;
        vesselRegistration: string;
        message: string;
    } | null>(null);

    // Refovi za auto-skrolanje
    const berthRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Pametna tražilica po akvatoriju
    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || !mapData?.piers) return [];
        const q = searchQuery.toLowerCase().trim();
        const matches: any[] = [];

        for (const pier of mapData.piers) {
            for (const b of pier.berths) {
                if (
                    b.code.toLowerCase().includes(q) ||
                    b.vesselName?.toLowerCase().includes(q) ||
                    b.vesselRegistration?.toLowerCase().includes(q) ||
                    b.userName?.toLowerCase().includes(q) ||
                    b.userOib?.includes(q)
                ) {
                    matches.push({ ...b, pierName: pier.name, pierCode: pier.code });
                }
            }
        }
        return matches;
    }, [searchQuery, mapData]);

    const handleSelectSearchResult = (berth: any) => {
        setHighlightedBerthId(berth.id);
        setSelectedBerth(berth);

        setTimeout(() => {
            const el = berthRefs.current[berth.id];
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            }
        }, 100);
    };

    // Filtriranje plovila u Comboboxu modala za dodjelu
    const filteredAssignableVessels = useMemo(() => {
        if (!assignableVessels) return [];
        if (!vesselSearchQuery.trim()) return assignableVessels;
        const q = vesselSearchQuery.toLowerCase().trim();

        return assignableVessels.filter((v) => {
            const reg = v.vesselRegistration?.toLowerCase() || "";
            const name = v.vesselName?.toLowerCase() || "";
            const owner = (v.ownerName || `${v.ownerFirstName} ${v.ownerLastName}`).toLowerCase();
            const oib = v.ownerOib || "";
            return reg.includes(q) || name.includes(q) || owner.includes(q) || oib.includes(q);
        });
    }, [assignableVessels, vesselSearchQuery]);

    // Podaci za prikaz gatova
    const displayedPiers = useMemo(() => {
        if (!mapData?.piers) return [];
        let piers = mapData.piers;

        if (selectedPierCode !== "ALL") {
            piers = piers.filter((p) => p.code === selectedPierCode);
        }

        return piers.map((pier) => {
            let berths = pier.berths;
            if (statusFilter !== "ALL") {
                berths = berths.filter((b) => b.status === statusFilter);
            }
            return {
                ...pier,
                filteredBerths: berths,
            };
        });
    }, [mapData, selectedPierCode, statusFilter]);

    // Izdvojeni Lukobran (L) i Zapadna obala (ZO)
    const lukobranPier = useMemo(() => mapData?.piers.find((p) => p.code === "L"), [mapData]);
    const zapadnaObalaPier = useMemo(() => mapData?.piers.find((p) => p.code === "ZO"), [mapData]);
    const verticalPiers = useMemo(
        () => displayedPiers.filter((p) => p.code.startsWith("G")),
        [displayedPiers]
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground font-medium">Učitavanje shematskog akvatorija PŠD Špinut...</p>
            </div>
        );
    }

    const stats = mapData?.stats || {
        totalBerths: 811,
        vacant: 0,
        occupied: 0,
        transit: 0,
        debtBlock: 0,
        maintenance: 0,
        reserved: 0,
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3 bg-slate-100/80 dark:bg-slate-950/80 overflow-hidden">
            {/* ─── Kontrolna traka i pametna tražilica ───────────────────────── */}
            <div className="bg-card border rounded-xl p-3.5 shadow-sm flex flex-col gap-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <Compass className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold tracking-tight text-foreground">
                                    PŠD Špinut — Upravljanje Akvatorijem & Vezovima
                                </h1>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold text-xs">
                                    811 Morskih vezova
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Interaktivni shematski prikaz svih 14 cjelina (Lukobran, Zapadna obala, Gatovi 1–12)
                            </p>
                        </div>
                    </div>

                    {/* Pretraga s auto-fokusom */}
                    <div className="flex items-center gap-2">
                        <div className="relative w-80">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Traži reg. (ST-1234), brod, člana, OIB..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Dropdown rezultati pretrage */}
                            {searchResults.length > 0 && searchQuery.trim().length >= 2 && (
                                <div className="absolute top-10 left-0 right-0 z-50 bg-popover border rounded-lg shadow-xl max-h-72 overflow-y-auto p-1 text-xs">
                                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase border-b">
                                        Pronađeno ({searchResults.length} vezova)
                                    </div>
                                    {searchResults.slice(0, 8).map((res) => (
                                        <div
                                            key={res.id}
                                            onClick={() => handleSelectSearchResult(res)}
                                            className="p-2 hover:bg-accent rounded-md cursor-pointer flex items-center justify-between transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                                                    {res.code}
                                                </span>
                                                <div>
                                                    <p className="font-semibold text-foreground">
                                                        {res.vesselRegistration || res.vesselName || "Slobodan vez"}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {res.userName || res.pierName}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className={`text-[10px] ${STATUS_CONFIG[res.status]?.badgeBg}`}>
                                                {STATUS_CONFIG[res.status]?.label}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Odabir gata */}
                        <Select value={selectedPierCode} onValueChange={setSelectedPierCode}>
                            <SelectTrigger className="w-40 h-9 text-xs">
                                <SelectValue placeholder="Gat" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Svi gatovi (1–12, L, ZO)</SelectItem>
                                {mapData?.piers.map((p) => (
                                    <SelectItem key={p.id} value={p.code}>
                                        {p.name} ({p.totalBerths} vezova)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Status filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-36 h-9 text-xs">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Svi statusi</SelectItem>
                                <SelectItem value="occupied">🟦 Zauzet (Član)</SelectItem>
                                <SelectItem value="vacant">🟩 Slobodan</SelectItem>
                                <SelectItem value="transit">🟨 Tranzit</SelectItem>
                                <SelectItem value="debt_block">🟥 Dugovanje</SelectItem>
                                <SelectItem value="maintenance">⬛ Servis</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Prebacivač prikaza */}
                        <div className="flex border rounded-lg overflow-hidden shrink-0 bg-muted/30">
                            <Button
                                size="sm"
                                variant={viewMode === "schematic" ? "default" : "ghost"}
                                onClick={() => setViewMode("schematic")}
                                className="h-9 px-3 text-xs rounded-none font-semibold"
                            >
                                <LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Shema privezišta
                            </Button>
                            <Button
                                size="sm"
                                variant={viewMode === "table" ? "default" : "ghost"}
                                onClick={() => setViewMode("table")}
                                className="h-9 px-3 text-xs rounded-none font-semibold"
                            >
                                <Table className="w-3.5 h-3.5 mr-1.5" /> Tablica
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Traka sa statistikom u boji */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t text-xs">
                    <span className="font-semibold text-muted-foreground mr-1">Stanje u moru:</span>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>Zauzeto (Član):</span>
                        <strong>{stats.occupied}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Slobodno:</span>
                        <strong>{stats.vacant}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Tranzit:</span>
                        <strong>{stats.transit}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span>Dugovanje:</span>
                        <strong>{stats.debtBlock}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span>Servis:</span>
                        <strong>{stats.maintenance}</strong>
                    </div>
                </div>
            </div>

            {/* ─── Prikaz 1: ORGANSKA SHEMA PRIVEZIŠTA (Pure CSS/DOM Harbor Board) ── */}
            {viewMode === "schematic" && (
                <div className="flex-1 bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-x-auto overflow-y-auto p-4 flex flex-col gap-4 select-none bg-slate-50/60 dark:bg-slate-950/40">
                        
                        {/* 1. SJEVERNI LUKOBRAN (L - 46 vezova) - Horizontalni ponton na vrhu */}
                        {lukobranPier && (selectedPierCode === "ALL" || selectedPierCode === "L") && (
                            <div className="bg-background border-2 border-slate-300 dark:border-slate-800 rounded-xl shadow-sm p-3 flex flex-col gap-2">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs">
                                            L
                                        </span>
                                        <h3 className="font-bold text-sm tracking-wide text-foreground">
                                            ⚓ SJEVERNI LUKOBRAN (L) — 46 vezova
                                        </h3>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        Popunjenost: {lukobranPier.berths.filter((b) => b.status !== "vacant").length} / {lukobranPier.totalBerths}
                                    </Badge>
                                </div>

                                {/* Horizontalni raspored kartica vezova na lukobranu */}
                                <div className="flex gap-1.5 overflow-x-auto pb-1.5">
                                    {lukobranPier.berths.map((b) => (
                                        <BerthCard
                                            key={b.id}
                                            berth={b}
                                            isHighlighted={highlightedBerthId === b.id}
                                            onSelect={() => {
                                                setSelectedBerth(b);
                                                setHighlightedBerthId(b.id);
                                            }}
                                            cardRef={(el) => (berthRefs.current[b.id] = el)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 2. SREDIŠNJI AKVATORIJ: ZAPADNA OBALA (Lijevo) + GATOVI 1 DO 12 (Sredina/Desno) */}
                        <div className="flex gap-4 items-start">
                            
                            {/* ZAPADNA OBALA (ZO - 34 veza + Dizalica + 3 Kluba) */}
                            {zapadnaObalaPier && (selectedPierCode === "ALL" || selectedPierCode === "ZO") && (
                                <div className="flex flex-col shrink-0 bg-background border-2 border-slate-300 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden w-[340px]">
                                    <div className="bg-slate-800 text-white p-3 flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center font-bold text-xs">
                                                    ZO
                                                </span>
                                                <h3 className="font-bold text-sm tracking-wide">Zapadna obala</h3>
                                            </div>
                                            <Badge variant="outline" className="text-white border-slate-600 text-[11px]">
                                                {zapadnaObalaPier.totalBerths} vezova
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Operativna zona: Dizalica 9T & Klubovi */}
                                    <div className="p-2 bg-muted/40 border-b flex flex-col gap-1.5 text-xs">
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200 font-semibold">
                                            <span>🏗️ DIZALICA 9T (Travelift)</span>
                                            <Badge variant="outline" className="text-[10px] bg-amber-200/60">Operativno</Badge>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1 text-[10px] text-center font-medium">
                                            <div className="p-1 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200">JK Špinut</div>
                                            <div className="p-1 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200">RK Špinut</div>
                                            <div className="p-1 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">KŠR Špinut</div>
                                        </div>
                                    </div>

                                    {/* Vezovi zapadne obale */}
                                    <div className="flex flex-col divide-y p-2 gap-1 overflow-y-auto max-h-[600px]">
                                        {zapadnaObalaPier.berths.map((b) => (
                                            <BerthCard
                                                key={b.id}
                                                berth={b}
                                                isHighlighted={highlightedBerthId === b.id}
                                                onSelect={() => {
                                                    setSelectedBerth(b);
                                                    setHighlightedBerthId(b.id);
                                                }}
                                                cardRef={(el) => (berthRefs.current[b.id] = el)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* GATOVI 1 DO 12 (Vertikalni pontoni s 2D scrollom) */}
                            <div className="flex gap-4 overflow-x-auto pb-2 flex-1">
                                {verticalPiers.map((pier) => {
                                    const totalRows = Math.ceil(pier.totalBerths / 2);
                                    const berthRows: { rowNumber: number; left?: any; right?: any }[] = [];

                                    for (let r = 1; r <= totalRows; r++) {
                                        const leftNum = (r - 1) * 2 + 1;
                                        const rightNum = (r - 1) * 2 + 2;

                                        const leftBerth = pier.filteredBerths.find((b) => b.berthNumber === leftNum);
                                        const rightBerth = pier.filteredBerths.find((b) => b.berthNumber === rightNum);

                                        berthRows.push({
                                            rowNumber: r,
                                            left: leftBerth,
                                            right: rightBerth,
                                        });
                                    }

                                    const occupiedCount = pier.filteredBerths.filter((b) => b.status !== "vacant").length;
                                    const occupancyPercent = Math.round((occupiedCount / pier.totalBerths) * 100) || 0;

                                    return (
                                        <div
                                            key={pier.id}
                                            className="flex flex-col shrink-0 bg-background border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden min-w-[340px]"
                                        >
                                            {/* Zaglavlje Gata */}
                                            <div className="bg-slate-800 text-white p-3 flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center font-bold text-xs">
                                                            {pier.code}
                                                        </span>
                                                        <h3 className="font-bold text-sm tracking-wide">{pier.name}</h3>
                                                    </div>
                                                    <Badge variant="outline" className="text-white border-slate-600 text-[11px]">
                                                        {pier.totalBerths} vezova
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center justify-between text-[11px] text-slate-300">
                                                    <span>Popunjenost: {occupiedCount} / {pier.totalBerths}</span>
                                                    <span className="font-semibold">{occupancyPercent}%</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all duration-300"
                                                        style={{ width: `${occupancyPercent}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Oznake strana */}
                                            <div className="grid grid-cols-[145px_36px_145px] bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground text-center py-1.5 px-2">
                                                <span>Strana 1 (Zapad)</span>
                                                <span>Br</span>
                                                <span>Strana 2 (Istok)</span>
                                            </div>

                                            {/* Redovi s vezovima */}
                                            <div className="flex flex-col divide-y p-2 gap-1 overflow-y-auto max-h-[550px]">
                                                {berthRows.map((row) => (
                                                    <div
                                                        key={row.rowNumber}
                                                        className="grid grid-cols-[145px_36px_145px] items-center gap-1 py-0.5"
                                                    >
                                                        {row.left ? (
                                                            <BerthCard
                                                                berth={row.left}
                                                                isHighlighted={highlightedBerthId === row.left.id}
                                                                onSelect={() => {
                                                                    setSelectedBerth(row.left);
                                                                    setHighlightedBerthId(row.left.id);
                                                                }}
                                                                cardRef={(el) => (berthRefs.current[row.left.id] = el)}
                                                            />
                                                        ) : (
                                                            <div className="h-[46px] rounded-lg border border-dashed border-muted flex items-center justify-center text-[10px] text-muted-foreground">
                                                                —
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-center font-mono font-bold text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 rounded h-7">
                                                            {row.rowNumber.toString().padStart(2, "0")}
                                                        </div>

                                                        {row.right ? (
                                                            <BerthCard
                                                                berth={row.right}
                                                                isHighlighted={highlightedBerthId === row.right.id}
                                                                onSelect={() => {
                                                                    setSelectedBerth(row.right);
                                                                    setHighlightedBerthId(row.right.id);
                                                                }}
                                                                cardRef={(el) => (berthRefs.current[row.right.id] = el)}
                                                            />
                                                        ) : (
                                                            <div className="h-[46px] rounded-lg border border-dashed border-muted flex items-center justify-center text-[10px] text-muted-foreground">
                                                                —
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. JUŽNA OBALA & ŠETALIŠTE BENE (Poveznica svih gatova) */}
                        <div className="bg-slate-800 text-slate-300 rounded-xl p-3 text-center text-xs font-semibold tracking-wider flex items-center justify-between">
                            <span>🚶‍♂️ ŠETALIŠTE BENE — JUŽNA OBALA</span>
                            <span className="text-slate-400 font-normal">Pristup gatovima 1 do 12 s kopna</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Prikaz 2: TABLIČNI POPIS ────────────────────────────────────── */}
            {viewMode === "table" && (
                <div className="flex-1 bg-card border rounded-xl shadow-sm overflow-auto p-4">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/60 text-muted-foreground font-semibold">
                                <th className="p-3">Šifra veza</th>
                                <th className="p-3">Gat</th>
                                <th className="p-3">Broj</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Registracija</th>
                                <th className="p-3">Naziv broda</th>
                                <th className="p-3">Član / Korisnik</th>
                                <th className="p-3">OIB</th>
                                <th className="p-3">Ugovor</th>
                                <th className="p-3 text-right">Akcija</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {displayedPiers.flatMap((p) =>
                                p.filteredBerths.map((b) => {
                                    const statusCfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.vacant;
                                    return (
                                        <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="p-3 font-mono font-bold text-blue-600">{b.code}</td>
                                            <td className="p-3 font-semibold">{p.name}</td>
                                            <td className="p-3 font-mono">{b.berthNumber}</td>
                                            <td className="p-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusCfg.badgeBg}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                                                    {statusCfg.label}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono font-bold text-foreground">{b.vesselRegistration || "—"}</td>
                                            <td className="p-3 font-medium">{b.vesselName || "—"}</td>
                                            <td className="p-3">{b.userName || "—"}</td>
                                            <td className="p-3 font-mono">{b.userOib || "—"}</td>
                                            <td className="p-3 font-mono text-muted-foreground">{b.contractNumber || "—"}</td>
                                            <td className="p-3 text-right">
                                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedBerth(b)}>
                                                    Upravljaj
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── Bočni Drawer za upravljanje pojedinim vezom ─────────────────── */}
            <Sheet open={!!selectedBerth} onOpenChange={(open) => !open && setSelectedBerth(null)}>
                <SheetContent className="w-[420px] sm:w-[500px] overflow-y-auto p-6">
                    {selectedBerth && (
                        <div className="flex flex-col gap-6">
                            <SheetHeader className="p-0 border-b pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge className="text-base px-3 py-1 font-mono bg-blue-600">
                                            {selectedBerth.code}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            {selectedBerth.side === "left" ? "Strana 1 (Zapad)" : "Strana 2 (Istok)"}
                                        </Badge>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedBerth.status]?.badgeBg}`}>
                                        <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[selectedBerth.status]?.dot}`} />
                                        {STATUS_CONFIG[selectedBerth.status]?.label}
                                    </span>
                                </div>
                                <SheetTitle className="text-lg font-bold mt-2">
                                    Vez {selectedBerth.code}
                                </SheetTitle>
                                <SheetDescription className="text-xs">
                                    Maksimalne dimenzije: <strong>{selectedBerth.maxLoaM}m</strong> LOA x <strong>{selectedBerth.maxBeamM}m</strong> širina x <strong>{selectedBerth.maxDraftM}m</strong> gaz
                                </SheetDescription>
                            </SheetHeader>

                            {/* Plovilo i član na vezu */}
                            {selectedBerth.vesselId || selectedBerth.vesselRegistration ? (
                                <div className="flex flex-col gap-4 p-4 border rounded-xl bg-card shadow-sm">
                                    <div className="flex items-center justify-between border-b pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                                                <Ship className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm">{selectedBerth.vesselName || "Plovilo na vezu"}</h3>
                                                <p className="font-mono text-xs text-blue-600 font-bold">{selectedBerth.vesselRegistration}</p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className="capitalize text-xs">
                                            {selectedBerth.vesselType || "Brod"}
                                        </Badge>
                                    </div>

                                    {/* Dimenzije broda */}
                                    <div className="grid grid-cols-3 gap-2 text-xs text-center p-2.5 bg-muted/40 rounded-lg">
                                        <div>
                                            <span className="text-muted-foreground block text-[10px]">Dužina (LOA)</span>
                                            <strong>{selectedBerth.vesselLengthM ? `${selectedBerth.vesselLengthM} m` : "—"}</strong>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[10px]">Širina</span>
                                            <strong>{selectedBerth.vesselBeamM ? `${selectedBerth.vesselBeamM} m` : "—"}</strong>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[10px]">Gaz</span>
                                            <strong>{selectedBerth.vesselDraftM ? `${selectedBerth.vesselDraftM} m` : "—"}</strong>
                                        </div>
                                    </div>

                                    {/* Vlasnik / Član */}
                                    <div className="flex flex-col gap-2 pt-2 border-t text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Korisnik (Član):</span>
                                            <strong className="text-foreground">{selectedBerth.userName || `${selectedBerth.userFirstName || ""} ${selectedBerth.userLastName || ""}`}</strong>
                                        </div>
                                        {selectedBerth.userOib && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">OIB:</span>
                                                <span className="font-mono font-semibold">{selectedBerth.userOib}</span>
                                            </div>
                                        )}
                                        {selectedBerth.userPhone && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Telefon:</span>
                                                <span>{selectedBerth.userPhone}</span>
                                            </div>
                                        )}
                                        {selectedBerth.contractNumber && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Broj ugovora:</span>
                                                <span className="font-mono text-blue-600 font-semibold">{selectedBerth.contractNumber}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Akcijski gumbi */}
                                    <div className="flex items-center gap-2 pt-3 border-t">
                                        {selectedBerth.userId && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-xs"
                                                onClick={() => setLocation(`/admin/users/${selectedBerth.userId}/card`)}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Karton člana
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="text-xs"
                                            onClick={() => {
                                                if (confirm(`Sigurno želite osloboditi vez ${selectedBerth.code}?`)) {
                                                    unassignVesselMutation.mutate({ berthId: selectedBerth.id });
                                                }
                                            }}
                                        >
                                            Oslobodi vez
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                /* Vez je slobodan */
                                <div className="p-6 border border-dashed rounded-xl flex flex-col items-center justify-center gap-3 text-center bg-muted/10">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">Vez je slobodan</h4>
                                        <p className="text-xs text-muted-foreground">Pretražite plovilo i dodijelite ga na ovaj vez</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            setSelectedVesselId("");
                                            setVesselSearchQuery("");
                                            setIsAssignModalOpen(true);
                                        }}
                                        className="text-xs mt-1 bg-blue-600 hover:bg-blue-700"
                                    >
                                        <Plus className="w-4 h-4 mr-1" /> Dodaj plovilo na vez
                                    </Button>
                                </div>
                            )}

                            {/* Promjena operativnog statusa */}
                            <div className="flex flex-col gap-2 pt-4 border-t">
                                <label className="text-xs font-semibold">Operativni status veza:</label>
                                <Select
                                    value={pendingStatus || selectedBerth.status}
                                    onValueChange={(val) => {
                                        setPendingStatus(val);
                                        updateStatusMutation.mutate({
                                            berthId: selectedBerth.id,
                                            status: val as any,
                                        });
                                    }}
                                >
                                    <SelectTrigger className="text-xs h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="occupied">🟦 Zauzet (Član)</SelectItem>
                                        <SelectItem value="vacant">🟩 Slobodan vez</SelectItem>
                                        <SelectItem value="transit">🟨 Tranzitni gost</SelectItem>
                                        <SelectItem value="debt_block">🟥 Dugovanje / Blokada</SelectItem>
                                        <SelectItem value="maintenance">⬛ Servis / Kvar muringa</SelectItem>
                                        <SelectItem value="reserved">🟪 Rezervirano</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* ─── Modal za dodjelu plovila (S PRETRAŽIVIM COMBOBOXOM) ──────────── */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="sm:max-w-[540px]">
                    <DialogHeader>
                        <DialogTitle>Dodjela plovila na vez {selectedBerth?.code}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Upišite registraciju, naziv broda ili ime člana za brzi pronalazak.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-2">
                        {/* Pretraživač plovila (Searchable Combobox) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center justify-between">
                                <span>Odabir plovila:</span>
                                <span className="text-[11px] text-muted-foreground">
                                    Prikazano: {filteredAssignableVessels.length} plovila
                                </span>
                            </label>
                            
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Upiši reg. (ST-1234), ime broda ili vlasnika..."
                                    value={vesselSearchQuery}
                                    onChange={(e) => setVesselSearchQuery(e.target.value)}
                                    className="pl-9 h-9 text-xs"
                                    autoFocus
                                />
                                {vesselSearchQuery && (
                                    <button
                                        onClick={() => setVesselSearchQuery("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Lista filtriranih plovila */}
                            <div className="border rounded-lg max-h-52 overflow-y-auto divide-y bg-muted/20 text-xs mt-1">
                                {filteredAssignableVessels.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-xs">
                                        Nema plovila koja odgovaraju upitu "{vesselSearchQuery}"
                                    </div>
                                ) : (
                                    filteredAssignableVessels.map((v) => {
                                        const isSelected = selectedVesselId === v.vesselId;
                                        return (
                                            <div
                                                key={v.vesselId}
                                                onClick={() => setSelectedVesselId(v.vesselId)}
                                                className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                                                    isSelected
                                                        ? "bg-blue-100 dark:bg-blue-950/80 border-l-4 border-blue-600 font-semibold"
                                                        : "hover:bg-accent"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                                        {v.vesselRegistration || "BEZ REG"}
                                                    </span>
                                                    <div>
                                                        <p className="font-bold text-foreground">
                                                            {v.vesselName || "—"}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {v.ownerName || `${v.ownerFirstName || ""} ${v.ownerLastName || ""}`} {v.ownerOib ? `(OIB: ${v.ownerOib})` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right text-[11px] text-muted-foreground">
                                                    <span className="block font-medium">{v.vesselLengthM ? `${v.vesselLengthM} m` : ""}</span>
                                                    <span className="capitalize">{v.vesselType || "Brod"}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Broj ugovora */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold">Broj ugovora o vezu:</label>
                            <Input
                                placeholder="npr. 469/2001 ili UG-2026-0042"
                                value={contractNumber}
                                onChange={(e) => setContractNumber(e.target.value)}
                                className="text-xs h-9"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsAssignModalOpen(false)}>
                            Odustani
                        </Button>
                        <Button
                            size="sm"
                            disabled={!selectedVesselId || assignVesselMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                                const vessel = assignableVessels?.find((v) => v.vesselId === selectedVesselId);
                                if (!vessel || !selectedBerth) return;

                                assignVesselMutation.mutate({
                                    berthId: selectedBerth.id,
                                    vesselId: vessel.vesselId,
                                    userId: vessel.ownerId,
                                    contractNumber: contractNumber || undefined,
                                    assignmentType: "permanent_member",
                                    forceRelocate: false,
                                });
                            }}
                        >
                            {assignVesselMutation.isPending ? "Postavljam..." : "Postavi plovilo na vez"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Dijalog za potvrdu premještanja s drugog veza ───────────────── */}
            <AlertDialog open={!!relocationConflict} onOpenChange={(open) => !open && setRelocationConflict(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-5 h-5" />
                            <AlertDialogTitle>Plovilo je već dodijeljeno na vez</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="text-xs pt-2">
                            {relocationConflict?.message}
                            <br /><br />
                            <strong>Želite li automatski osloboditi prethodni vez i premjestiti plovilo na vez {selectedBerth?.code}?</strong>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setRelocationConflict(null)}>
                            Odustani
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => {
                                const vessel = assignableVessels?.find((v) => v.vesselId === selectedVesselId);
                                if (!vessel || !selectedBerth) return;

                                assignVesselMutation.mutate({
                                    berthId: selectedBerth.id,
                                    vesselId: vessel.vesselId,
                                    userId: vessel.ownerId,
                                    contractNumber: contractNumber || undefined,
                                    assignmentType: "permanent_member",
                                    forceRelocate: true,
                                });
                            }}
                        >
                            <ArrowRightLeft className="w-4 h-4 mr-1.5" /> Da, premjesti plovilo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/**
 * Pojedinačna kartica veza (Fiksna, lako čitljiva veličina 145x46px)
 */
function BerthCard({
    berth,
    isHighlighted,
    onSelect,
    cardRef,
}: {
    berth: any;
    isHighlighted: boolean;
    onSelect: () => void;
    cardRef: (el: HTMLDivElement | null) => void;
}) {
    const isOccupied = berth.status !== "vacant";
    const statusCfg = STATUS_CONFIG[berth.status] || STATUS_CONFIG.vacant;

    return (
        <div
            ref={cardRef}
            onClick={onSelect}
            className={`h-[46px] w-[145px] rounded-lg border p-1.5 cursor-pointer flex flex-col justify-between transition-all duration-200 shrink-0 ${
                statusCfg.bg
            } ${statusCfg.border} ${
                isHighlighted
                    ? "ring-4 ring-amber-400 dark:ring-amber-500 scale-105 shadow-lg z-20"
                    : "hover:scale-[1.02] hover:shadow-md"
            }`}
        >
            {/* Gornji red: Registracija plovila ili SLOBODNO */}
            <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[12px] truncate tracking-tight text-foreground">
                    {isOccupied ? (
                        berth.vesselRegistration || berth.vesselName || "Zauzeto"
                    ) : (
                        <span className="text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            SLOBODNO
                        </span>
                    )}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`} />
            </div>

            {/* Donji red: Ime vlasnika ili max dužina */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground truncate">
                <span className="truncate font-medium">
                    {isOccupied ? (
                        berth.userName || `${berth.userFirstName || ""} ${berth.userLastName || ""}`.trim() || "Član"
                    ) : (
                        `max ${berth.maxLoaM || "10"}m`
                    )}
                </span>
                {berth.status === "debt_block" && (
                    <span className="text-rose-600 font-bold ml-1">DUG ⚠️</span>
                )}
            </div>
        </div>
    );
}
