/**
 * PŠD Špinut — Autentična i napredna operativna shema privezišta & akvatorija
 * 
 * Izgrađeno prema uzoru na Screenshot_30.png s naprednim poboljšanjima:
 * - Visokorazlučiva pontonska rešetka (Tight High-Density Pontoon Grid)
 * - Vertikalni pontoni (G1-G12, ZO, L) sa središnjom betonskom kralježnicom (walkway spine)
 * - Horizontalni suhi dokovi (Suhi dok A, B, C, Arla 1-3, Servisna zona)
 * - Fiksne kompaktne ćelije vezova (135x40px) s registracijom, imenom vlasnika i statusnim bojama
 * - 2D fluidno pomicanje (horizontalno i vertikalno)
 * - Pametna tražilica sa zlatnim spotlight fokusom i automatskim centriranjem
 * - Pretraživi Combobox za dodjelu plovila sa zaštitom od višestrukih vezova i potvrdom premještanja
 */
import React, { useState, useMemo, useRef, useEffect } from "react";
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
    Anchor,
    Search,
    Ship,
    AlertTriangle,
    CheckCircle2,
    X,
    ExternalLink,
    Plus,
    Compass,
    SlidersHorizontal,
    Table,
    ArrowRightLeft,
    ArrowUp,
    ArrowDown,
    ZoomIn,
    ZoomOut,
    Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Statusi vezova prema Screenshot_30 uzorku
const STATUS_STYLES: Record<
    string,
    { label: string; bg: string; text: string; subText: string; border: string; dot: string; isVacant?: boolean }
> = {
    vacant: {
        label: "Slobodan vez",
        bg: "bg-[#10b981] hover:bg-[#059669]",
        text: "text-white font-bold",
        subText: "text-emerald-100",
        border: "border-emerald-600",
        dot: "bg-white",
        isVacant: true,
    },
    occupied: {
        label: "Zauzet (Član)",
        bg: "bg-[#e2e8f0] hover:bg-[#cbd5e1] dark:bg-[#1e293b] dark:hover:bg-[#334155]",
        text: "text-slate-900 dark:text-white font-bold",
        subText: "text-slate-600 dark:text-slate-300",
        border: "border-slate-300 dark:border-slate-700",
        dot: "bg-blue-600",
    },
    transit: {
        label: "Tranzitni gost",
        bg: "bg-[#fef08a] hover:bg-[#fde047] dark:bg-[#713f12] dark:hover:bg-[#854d0e]",
        text: "text-amber-950 dark:text-amber-100 font-bold",
        subText: "text-amber-800 dark:text-amber-200",
        border: "border-amber-400 dark:border-amber-700",
        dot: "bg-amber-600",
    },
    debt_block: {
        label: "Dugovanje / Blokada",
        bg: "bg-[#fee2e2] hover:bg-[#fecaca] dark:bg-[#7f1d1d] dark:hover:bg-[#991b1b]",
        text: "text-rose-950 dark:text-rose-100 font-bold",
        subText: "text-rose-800 dark:text-rose-200",
        border: "border-rose-400 dark:border-rose-700",
        dot: "bg-rose-600",
    },
    maintenance: {
        label: "Servis / Kvar",
        bg: "bg-[#64748b] hover:bg-[#475569]",
        text: "text-white font-bold",
        subText: "text-slate-200",
        border: "border-slate-600",
        dot: "bg-slate-400",
    },
    reserved: {
        label: "Rezervirano",
        bg: "bg-[#e9d5ff] hover:bg-[#d8b4fe] dark:bg-[#581c87]",
        text: "text-purple-950 dark:text-purple-100 font-bold",
        subText: "text-purple-800 dark:text-purple-200",
        border: "border-purple-400 dark:border-purple-700",
        dot: "bg-purple-600",
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
    const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
    const [selectedPierFilter, setSelectedPierFilter] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [highlightedBerthId, setHighlightedBerthId] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<"compact" | "normal" | "large">("normal");

    const [selectedBerth, setSelectedBerth] = useState<any | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string>("");

    // Modal za dodjelu plovila & Combobox
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [vesselSearchQuery, setVesselSearchQuery] = useState("");
    const [selectedVesselId, setSelectedVesselId] = useState<string>("");
    const [contractNumber, setContractNumber] = useState<string>("");
    const [relocationConflict, setRelocationConflict] = useState<{
        vesselName: string;
        vesselRegistration: string;
        message: string;
    } | null>(null);

    // Refovi za skrolanje
    const berthRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Pametna tražilica s auto-fokusom
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
        }, 80);
    };

    // Pretraživač za Combobox u modalu
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

    // Filtrirani podaci po gatovima
    const displayedPiers = useMemo(() => {
        if (!mapData?.piers) return [];
        let piers = mapData.piers;

        if (selectedPierFilter !== "ALL") {
            piers = piers.filter((p) => p.code === selectedPierFilter);
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
    }, [mapData, selectedPierFilter, statusFilter]);

    // Odvajanje pontona: Gatovi 1-12, Lukobran L, Zapadna Obala ZO
    const verticalPiers = useMemo(
        () => displayedPiers.filter((p) => p.code.startsWith("G") || p.code === "ZO" || p.code === "L"),
        [displayedPiers]
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] gap-4 bg-[#0e1726]">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-300 font-medium tracking-wide">Učitavanje akvatorija i pontona PŠD Špinut...</p>
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

    // Dimenzije ćelije ovisno o zoomLevelu
    const cardWidth = zoomLevel === "compact" ? "w-[120px]" : zoomLevel === "large" ? "w-[155px]" : "w-[136px]";
    const cardHeight = zoomLevel === "compact" ? "h-[36px]" : zoomLevel === "large" ? "h-[46px]" : "h-[40px]";
    const fontSizeTitle = zoomLevel === "compact" ? "text-[11px]" : zoomLevel === "large" ? "text-[13px]" : "text-[12px]";
    const fontSizeSub = zoomLevel === "compact" ? "text-[9px]" : zoomLevel === "large" ? "text-[11px]" : "text-[10px]";

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#0b1320] text-slate-100 overflow-hidden font-sans select-none">
            {/* ─── 1. GORNJA KONTROLNA TRAKA (Screenshot_30 stil) ────────────────── */}
            <div className="bg-[#111c2e] border-b border-[#1e2f4a] p-3 flex flex-col gap-2.5 shrink-0 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Naziv i statistika */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow">
                            <Anchor className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-bold tracking-wide text-white uppercase">
                                    PŠD ŠPINUT — PRIKAZ AKVATORIJA I VEZOVA
                                </h1>
                                <span className="px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono text-xs border border-blue-700">
                                    811 vezova
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                Shema gatova 1–12, Lukobrana i Zapadne obale s 2D pomicanjem
                            </p>
                        </div>
                    </div>

                    {/* Pretraga i filtri */}
                    <div className="flex items-center gap-2">
                        {/* Tražilica */}
                        <div className="relative w-72">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Traži reg. (ST-1234), brod, člana, OIB..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-8 text-xs bg-[#0c1524] border-[#1e2f4a] text-white placeholder:text-slate-500 focus:border-blue-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Dropdown s rezultatima pretrage */}
                            {searchResults.length > 0 && searchQuery.trim().length >= 2 && (
                                <div className="absolute top-9 left-0 right-0 z-50 bg-[#162338] border border-[#233857] rounded-lg shadow-2xl max-h-72 overflow-y-auto p-1 text-xs">
                                    <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase border-b border-[#233857]">
                                        Pronađeno ({searchResults.length} vezova)
                                    </div>
                                    {searchResults.slice(0, 8).map((res) => (
                                        <div
                                            key={res.id}
                                            onClick={() => handleSelectSearchResult(res)}
                                            className="p-2 hover:bg-[#1e3250] rounded cursor-pointer flex items-center justify-between transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                                                    {res.code}
                                                </span>
                                                <div>
                                                    <p className="font-bold text-white">
                                                        {res.vesselRegistration || res.vesselName || "Slobodan vez"}
                                                    </p>
                                                    <p className="text-[11px] text-slate-300">
                                                        {res.userName || res.pierName}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[res.status]?.bg} ${STATUS_STYLES[res.status]?.text}`}>
                                                {STATUS_STYLES[res.status]?.label}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Odabir gata */}
                        <Select value={selectedPierFilter} onValueChange={setSelectedPierFilter}>
                            <SelectTrigger className="w-36 h-8 text-xs bg-[#0c1524] border-[#1e2f4a] text-white">
                                <SelectValue placeholder="Gat" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#162338] border-[#233857] text-white">
                                <SelectItem value="ALL">Svi gatovi (1–12, L, ZO)</SelectItem>
                                {mapData?.piers.map((p) => (
                                    <SelectItem key={p.id} value={p.code}>
                                        {p.name} ({p.totalBerths})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Status filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-32 h-8 text-xs bg-[#0c1524] border-[#1e2f4a] text-white">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#162338] border-[#233857] text-white">
                                <SelectItem value="ALL">Svi statusi</SelectItem>
                                <SelectItem value="occupied">Zauzet (Član)</SelectItem>
                                <SelectItem value="vacant">Slobodan</SelectItem>
                                <SelectItem value="transit">Tranzit</SelectItem>
                                <SelectItem value="debt_block">Dugovanje</SelectItem>
                                <SelectItem value="maintenance">Servis</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Zoom kontrole */}
                        <div className="flex border border-[#1e2f4a] rounded overflow-hidden bg-[#0c1524]">
                            <Button
                                size="sm"
                                variant={zoomLevel === "compact" ? "default" : "ghost"}
                                onClick={() => setZoomLevel("compact")}
                                className="h-8 px-2 text-[11px] rounded-none"
                                title="Kompaktan prikaz"
                            >
                                S
                            </Button>
                            <Button
                                size="sm"
                                variant={zoomLevel === "normal" ? "default" : "ghost"}
                                onClick={() => setZoomLevel("normal")}
                                className="h-8 px-2 text-[11px] rounded-none"
                                title="Standardni prikaz"
                            >
                                M
                            </Button>
                            <Button
                                size="sm"
                                variant={zoomLevel === "large" ? "default" : "ghost"}
                                onClick={() => setZoomLevel("large")}
                                className="h-8 px-2 text-[11px] rounded-none"
                                title="Uvećani prikaz"
                            >
                                L
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Semafor traka u boji */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1e2f4a] text-[11px]">
                    <span className="font-semibold text-slate-400 mr-1">Statusi:</span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#e2e8f0] text-slate-900 font-bold border border-slate-300">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <span>Zauzet (Član):</span>
                        <strong>{stats.occupied}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10b981] text-white font-bold border border-emerald-600">
                        <ArrowUp className="w-3 h-3 text-white" />
                        <span>Slobodno:</span>
                        <strong>{stats.vacant}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fef08a] text-amber-950 font-bold border border-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-600" />
                        <span>Tranzit:</span>
                        <strong>{stats.transit}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fee2e2] text-rose-950 font-bold border border-rose-400">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        <span>Dugovanje:</span>
                        <strong>{stats.debtBlock}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#64748b] text-white font-bold border border-slate-600">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span>Servis:</span>
                        <strong>{stats.maintenance}</strong>
                    </div>
                </div>
            </div>

            {/* ─── 2. SREDIŠNJA 2D PONTONSKA REŠETKA (Screenshot_30 STIL) ────────── */}
            <div
                ref={containerRef}
                className="flex-1 overflow-x-auto overflow-y-auto p-4 flex gap-5 bg-[#0b1320]"
                style={{
                    backgroundImage: "radial-gradient(#152438 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                }}
            >
                {verticalPiers.map((pier) => {
                    // Grupiranje u parove: Strana 1 (lijevo) i Strana 2 (desno)
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
                    const freeCount = pier.totalBerths - occupiedCount;
                    const occupancyPercent = Math.round((occupiedCount / pier.totalBerths) * 100) || 0;

                    return (
                        <div
                            key={pier.id}
                            className="flex flex-col shrink-0 bg-[#131f33] border-2 border-[#203350] rounded-xl shadow-xl overflow-hidden h-fit"
                        >
                            {/* Zaglavlje Pontona (Ponton X) */}
                            <div className="bg-[#1b2b44] border-b border-[#284065] p-2.5 flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-mono font-bold text-xs">
                                            {pier.code}
                                        </span>
                                        <h3 className="font-bold text-sm text-white tracking-wide uppercase">
                                            {pier.name}
                                        </h3>
                                    </div>
                                    <span className="text-[11px] font-mono text-slate-300">
                                        {pier.totalBerths} vezova
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-slate-300">
                                    <span>Zauzeto: <strong className="text-white">{occupiedCount}</strong> | Slobodno: <strong className="text-emerald-400">{freeCount}</strong></span>
                                    <span className="font-bold text-blue-400">{occupancyPercent}%</span>
                                </div>
                                {/* Traka popunjenosti */}
                                <div className="w-full h-1 bg-[#0b1320] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300"
                                        style={{ width: `${occupancyPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Oznake strana (Strana 1 | Br. | Strana 2) */}
                            <div className="grid grid-cols-[1fr_32px_1fr] bg-[#0e1726] border-b border-[#203350] text-[10px] font-bold text-slate-400 text-center py-1">
                                <span>Strana 1</span>
                                <span className="text-slate-500 font-mono">#</span>
                                <span>Strana 2</span>
                            </div>

                            {/* Kompaktna rešetka vezova (bez rupa) */}
                            <div className="flex flex-col divide-y divide-[#203350] bg-[#0c1524]">
                                {berthRows.map((row) => (
                                    <div
                                        key={row.rowNumber}
                                        className="grid grid-cols-[auto_32px_auto] items-center"
                                    >
                                        {/* Lijeva ćelija (Strana 1) */}
                                        {row.left ? (
                                            <BerthCell
                                                berth={row.left}
                                                widthClass={cardWidth}
                                                heightClass={cardHeight}
                                                titleSizeClass={fontSizeTitle}
                                                subSizeClass={fontSizeSub}
                                                isHighlighted={highlightedBerthId === row.left.id}
                                                onSelect={() => {
                                                    setSelectedBerth(row.left);
                                                    setHighlightedBerthId(row.left.id);
                                                }}
                                                cellRef={(el) => (berthRefs.current[row.left.id] = el)}
                                            />
                                        ) : (
                                            <div className={`${cardWidth} ${cardHeight} bg-[#0b1320] flex items-center justify-center text-[10px] text-slate-700`}>
                                                —
                                            </div>
                                        )}

                                        {/* Središnja betonska kralježnica s brojem */}
                                        <div className={`${cardHeight} w-[32px] bg-[#1a273e] text-slate-200 border-x border-[#284065] flex items-center justify-center font-mono font-bold text-[11px]`}>
                                            {row.rowNumber.toString().padStart(2, "0")}
                                        </div>

                                        {/* Desna ćelija (Strana 2) */}
                                        {row.right ? (
                                            <BerthCell
                                                berth={row.right}
                                                widthClass={cardWidth}
                                                heightClass={cardHeight}
                                                titleSizeClass={fontSizeTitle}
                                                subSizeClass={fontSizeSub}
                                                isHighlighted={highlightedBerthId === row.right.id}
                                                onSelect={() => {
                                                    setSelectedBerth(row.right);
                                                    setHighlightedBerthId(row.right.id);
                                                }}
                                                cellRef={(el) => (berthRefs.current[row.right.id] = el)}
                                            />
                                        ) : (
                                            <div className={`${cardWidth} ${cardHeight} bg-[#0b1320] flex items-center justify-center text-[10px] text-slate-700`}>
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

            {/* ─── 3. BOČNI DRAWER ZA DETALJE I UPRAVLJANJE VEZOM ─────────────── */}
            <Sheet open={!!selectedBerth} onOpenChange={(open) => !open && setSelectedBerth(null)}>
                <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto p-6 bg-[#111c2e] text-slate-100 border-l border-[#1e2f4a]">
                    {selectedBerth && (
                        <div className="flex flex-col gap-5">
                            <SheetHeader className="p-0 border-b border-[#1e2f4a] pb-3 text-left">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge className="text-base px-3 py-1 font-mono bg-blue-600 text-white font-bold">
                                            {selectedBerth.code}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs text-slate-300 border-[#284065]">
                                            {selectedBerth.side === "left" ? "Strana 1 (Zapad)" : "Strana 2 (Istok)"}
                                        </Badge>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold ${STATUS_STYLES[selectedBerth.status]?.bg} ${STATUS_STYLES[selectedBerth.status]?.text}`}>
                                        {STATUS_STYLES[selectedBerth.status]?.label}
                                    </span>
                                </div>
                                <SheetTitle className="text-base font-bold text-white mt-2">
                                    Vez {selectedBerth.code} ({selectedBerth.pierName || "Gat"})
                                </SheetTitle>
                                <SheetDescription className="text-xs text-slate-400">
                                    Maksimalne dimenzije: <strong>{selectedBerth.maxLoaM}m</strong> LOA x <strong>{selectedBerth.maxBeamM}m</strong> širina x <strong>{selectedBerth.maxDraftM}m</strong> gaz
                                </SheetDescription>
                            </SheetHeader>

                            {/* Podaci o plovilu i članu */}
                            {selectedBerth.vesselId || selectedBerth.vesselRegistration ? (
                                <div className="flex flex-col gap-3.5 p-4 border border-[#233857] rounded-xl bg-[#16243a] shadow">
                                    <div className="flex items-center justify-between border-b border-[#233857] pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-lg bg-blue-950 flex items-center justify-center text-blue-400 border border-blue-800">
                                                <Ship className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white">{selectedBerth.vesselName || "Plovilo na vezu"}</h3>
                                                <p className="font-mono text-xs text-blue-400 font-bold">{selectedBerth.vesselRegistration}</p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className="capitalize text-xs bg-slate-800 text-slate-200">
                                            {selectedBerth.vesselType || "Brod"}
                                        </Badge>
                                    </div>

                                    {/* Dimenzije */}
                                    <div className="grid grid-cols-3 gap-2 text-xs text-center p-2 bg-[#0d1726] rounded-lg border border-[#1e2f4a]">
                                        <div>
                                            <span className="text-slate-400 block text-[10px]">Dužina</span>
                                            <strong className="text-white">{selectedBerth.vesselLengthM ? `${selectedBerth.vesselLengthM} m` : "—"}</strong>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block text-[10px]">Širina</span>
                                            <strong className="text-white">{selectedBerth.vesselBeamM ? `${selectedBerth.vesselBeamM} m` : "—"}</strong>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block text-[10px]">Gaz</span>
                                            <strong className="text-white">{selectedBerth.vesselDraftM ? `${selectedBerth.vesselDraftM} m` : "—"}</strong>
                                        </div>
                                    </div>

                                    {/* Vlasnik */}
                                    <div className="flex flex-col gap-2 pt-2 border-t border-[#233857] text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400">Vlasnik (Član):</span>
                                            <strong className="text-white">{selectedBerth.userName || `${selectedBerth.userFirstName || ""} ${selectedBerth.userLastName || ""}`}</strong>
                                        </div>
                                        {selectedBerth.userOib && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">OIB:</span>
                                                <span className="font-mono font-semibold text-slate-200">{selectedBerth.userOib}</span>
                                            </div>
                                        )}
                                        {selectedBerth.userPhone && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Telefon:</span>
                                                <span className="text-slate-200">{selectedBerth.userPhone}</span>
                                            </div>
                                        )}
                                        {selectedBerth.contractNumber && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Broj ugovora:</span>
                                                <span className="font-mono text-blue-400 font-semibold">{selectedBerth.contractNumber}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Gumbi akcija */}
                                    <div className="flex items-center gap-2 pt-3 border-t border-[#233857]">
                                        {selectedBerth.userId && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-xs border-[#284065] text-slate-200 hover:bg-[#1f3352]"
                                                onClick={() => setLocation(`/admin/users/${selectedBerth.userId}/card`)}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Karton člana
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="text-xs bg-rose-700 hover:bg-rose-800"
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
                                <div className="p-6 border border-dashed border-[#284065] rounded-xl flex flex-col items-center justify-center gap-3 text-center bg-[#0e192a]">
                                    <div className="w-10 h-10 rounded-full bg-emerald-950 flex items-center justify-center text-emerald-400 border border-emerald-800">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm text-white">Vez je slobodan</h4>
                                        <p className="text-xs text-slate-400">Pretražite plovilo i postavite ga na ovaj vez</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            setSelectedVesselId("");
                                            setVesselSearchQuery("");
                                            setIsAssignModalOpen(true);
                                        }}
                                        className="text-xs mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                    >
                                        <Plus className="w-4 h-4 mr-1" /> + Dodajte plovilo na vez
                                    </Button>
                                </div>
                            )}

                            {/* Promjena statusa */}
                            <div className="flex flex-col gap-2 pt-4 border-t border-[#1e2f4a]">
                                <label className="text-xs font-semibold text-slate-300">Operativni status veza:</label>
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
                                    <SelectTrigger className="text-xs h-9 bg-[#0c1524] border-[#203350] text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#162338] border-[#233857] text-white">
                                        <SelectItem value="occupied">Zauzet (Član)</SelectItem>
                                        <SelectItem value="vacant">Slobodan vez</SelectItem>
                                        <SelectItem value="transit">Tranzitni gost</SelectItem>
                                        <SelectItem value="debt_block">Dugovanje / Blokada</SelectItem>
                                        <SelectItem value="maintenance">Servis / Kvar muringa</SelectItem>
                                        <SelectItem value="reserved">Rezervirano</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* ─── 4. MODAL ZA PRETRAŽIVU DODJELU PLOVILA (COMBOBOX) ─────────────── */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="sm:max-w-[540px] bg-[#111c2e] text-slate-100 border-[#1e2f4a]">
                    <DialogHeader>
                        <DialogTitle className="text-white">Dodjela plovila na vez {selectedBerth?.code}</DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Upišite registraciju, ime broda ili člana za brzi pronalazak.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-2">
                        {/* Searchable Combobox */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                                <span>Odabir plovila:</span>
                                <span className="text-[11px] text-slate-400">
                                    Prikazano: {filteredAssignableVessels.length} plovila
                                </span>
                            </label>

                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <Input
                                    placeholder="Upiši reg. (ST-1234), ime broda ili vlasnika..."
                                    value={vesselSearchQuery}
                                    onChange={(e) => setVesselSearchQuery(e.target.value)}
                                    className="pl-9 h-9 text-xs bg-[#0c1524] border-[#203350] text-white placeholder:text-slate-500"
                                    autoFocus
                                />
                                {vesselSearchQuery && (
                                    <button
                                        onClick={() => setVesselSearchQuery("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Lista filtriranih plovila */}
                            <div className="border border-[#203350] rounded-lg max-h-52 overflow-y-auto divide-y divide-[#1e2f4a] bg-[#0c1524] text-xs mt-1">
                                {filteredAssignableVessels.length === 0 ? (
                                    <div className="p-4 text-center text-slate-400 text-xs">
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
                                                        ? "bg-blue-900/80 border-l-4 border-blue-400 text-white font-bold"
                                                        : "hover:bg-[#162338]"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                                                        {v.vesselRegistration || "BEZ REG"}
                                                    </span>
                                                    <div>
                                                        <p className="font-bold text-white">
                                                            {v.vesselName || "—"}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400">
                                                            {v.ownerName || `${v.ownerFirstName || ""} ${v.ownerLastName || ""}`} {v.ownerOib ? `(${v.ownerOib})` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right text-[11px] text-slate-400">
                                                    <span className="block font-medium text-white">{v.vesselLengthM ? `${v.vesselLengthM} m` : ""}</span>
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
                            <label className="text-xs font-semibold text-slate-300">Broj ugovora o vezu:</label>
                            <Input
                                placeholder="npr. 469/2001 ili UG-2026-0042"
                                value={contractNumber}
                                onChange={(e) => setContractNumber(e.target.value)}
                                className="text-xs h-9 bg-[#0c1524] border-[#203350] text-white"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsAssignModalOpen(false)} className="border-[#284065] text-slate-300">
                            Odustani
                        </Button>
                        <Button
                            size="sm"
                            disabled={!selectedVesselId || assignVesselMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
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

            {/* ─── 5. DIJALOG ZA POTVRDU PREMJEŠTANJA S DRUGOG VEZA ────────────── */}
            <AlertDialog open={!!relocationConflict} onOpenChange={(open) => !open && setRelocationConflict(null)}>
                <AlertDialogContent className="bg-[#111c2e] text-slate-100 border-[#1e2f4a]">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 text-amber-400">
                            <AlertTriangle className="w-5 h-5" />
                            <AlertDialogTitle className="text-white">Plovilo je već dodijeljeno na vez</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="text-xs text-slate-300 pt-2">
                            {relocationConflict?.message}
                            <br /><br />
                            <strong>Želite li automatski osloboditi prethodni vez i premjestiti plovilo na vez {selectedBerth?.code}?</strong>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setRelocationConflict(null)} className="border-[#284065] text-slate-300">
                            Odustani
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
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
 * Pojedinačna kompaktna ćelija veza (Screenshot_30 stil)
 */
function BerthCell({
    berth,
    widthClass,
    heightClass,
    titleSizeClass,
    subSizeClass,
    isHighlighted,
    onSelect,
    cellRef,
}: {
    berth: any;
    widthClass: string;
    heightClass: string;
    titleSizeClass: string;
    subSizeClass: string;
    isHighlighted: boolean;
    onSelect: () => void;
    cellRef: (el: HTMLDivElement | null) => void;
}) {
    const isVacant = berth.status === "vacant";
    const style = STATUS_STYLES[berth.status] || STATUS_STYLES.vacant;

    return (
        <div
            ref={cellRef}
            onClick={onSelect}
            className={`${widthClass} ${heightClass} ${style.bg} ${style.border} border p-1 cursor-pointer flex flex-col justify-center transition-all duration-150 relative ${
                isHighlighted
                    ? "ring-4 ring-amber-400 z-30 scale-105 shadow-2xl"
                    : "hover:brightness-110"
            }`}
        >
            {isVacant ? (
                /* Slobodan vez - Zeleni blok sa strelicom */
                <div className="flex items-center justify-center gap-1 text-white font-bold text-[11px]">
                    <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                    <span className="tracking-wide">SLOBODNO</span>
                </div>
            ) : (
                /* Zauzet vez - Registracija + Ime člana */
                <div className="flex flex-col justify-between h-full overflow-hidden leading-none">
                    <div className="flex items-center justify-between">
                        <span className={`font-mono font-bold ${titleSizeClass} ${style.text} truncate tracking-tight`}>
                            {berth.vesselRegistration || berth.vesselName || "ZAUZETO"}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className={`truncate font-medium ${subSizeClass} ${style.subText}`}>
                            {berth.userName || `${berth.userFirstName || ""} ${berth.userLastName || ""}`.trim() || "Član"}
                        </span>
                        {berth.status === "debt_block" && (
                            <span className="text-rose-700 font-extrabold text-[9px] ml-1">DUG!</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
