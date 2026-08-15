/**
 * PŠD Špinut — Digitalni blizanac akvatorija & Operativno upravljanje vezovima
 * 
 * Sadrži:
 * 1. Zračni Digital Twin (Georeferencirani tlocrt prema snimku iz zraka i katastru)
 * 2. Operativnu ploču gatova (Čitljive kartice fiksne veličine 145x46px s 2D scrollom)
 * 3. Suhi vez & Plato (Arla 1, 2, 3, Servisna zona, Plato)
 * 4. Pametnu tražilicu s auto-fokusom i skrolanjem
 * 5. Brze akcije nad vezom (dodjela, premještanje, dugovanje, status, karton člana)
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
    ZoomIn,
    ZoomOut,
    RotateCcw,
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
    Clock,
    X,
    Filter,
    Layers,
    ExternalLink,
    Plus,
    Maximize2,
    Compass,
    MapPin,
    ArrowRight,
    MoveRight,
    SlidersHorizontal,
    Table,
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
        bg: "bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/80",
        border: "border-emerald-500/80 dark:border-emerald-600",
        text: "text-emerald-800 dark:text-emerald-200",
        fill: "#10b981",
        dot: "bg-emerald-500",
        badgeBg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
    },
    occupied: {
        label: "Zauzet (Član)",
        bg: "bg-blue-50/90 dark:bg-blue-950/40 hover:bg-blue-100/90",
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
            toast.success("Plovilo uspješno dodijeljeno na vez");
            setIsAssignModalOpen(false);
            refetch();
            setSelectedBerth(null);
        },
        onError: (err) => toast.error(`Greška: ${err.message}`),
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
    const [viewMode, setViewMode] = useState<"board" | "aerial" | "table">("board");
    const [selectedPierCode, setSelectedPierCode] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [highlightedBerthId, setHighlightedBerthId] = useState<string | null>(null);

    const [selectedBerth, setSelectedBerth] = useState<any | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string>("");
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedVesselId, setSelectedVesselId] = useState<string>("");
    const [contractNumber, setContractNumber] = useState<string>("");

    // Ref za automatsko skrolanje do pronađenog veza
    const berthRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Tražilica i auto-fokus
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

        // Ako smo u "board" prikazu, automatski odskrolaj do tog elementa
        setTimeout(() => {
            const el = berthRefs.current[berth.id];
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            }
        }, 100);
    };

    // Filtrirani podaci po gatu i statusu
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

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground font-medium">Učitavanje digitalnog modela akvatorija PŠD Špinut...</p>
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
        <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3 bg-slate-100/70 dark:bg-slate-950/70 overflow-hidden">
            {/* ─── Gornja kontrolna traka i pametna tražilica ────────────────── */}
            <div className="bg-card border rounded-xl p-3.5 shadow-sm flex flex-col gap-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <Compass className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold tracking-tight text-foreground">
                                    PŠD Špinut — Akvatorij & Vezovi
                                </h1>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold text-xs">
                                    811 Vezova u moru
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Digitalni model 14 gatova, lukobrana i platoa lučice Špinut s brzim pregledom statusa i plovila
                            </p>
                        </div>
                    </div>

                    {/* Pretraga s brzim rezultatima */}
                    <div className="flex items-center gap-2">
                        <div className="relative w-72">
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

                            {/* Dropdown s brzim rezultatima pretrage */}
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

                        {/* Prebacivač načina prikaza */}
                        <div className="flex border rounded-lg overflow-hidden shrink-0 bg-muted/30">
                            <Button
                                size="sm"
                                variant={viewMode === "board" ? "default" : "ghost"}
                                onClick={() => setViewMode("board")}
                                className="h-9 px-3 text-xs rounded-none font-semibold"
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> Operativna ploča
                            </Button>
                            <Button
                                size="sm"
                                variant={viewMode === "aerial" ? "default" : "ghost"}
                                onClick={() => setViewMode("aerial")}
                                className="h-9 px-3 text-xs rounded-none font-semibold"
                            >
                                <Layers className="w-3.5 h-3.5 mr-1.5" /> Zračni tlocrt
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
                    <span className="font-semibold text-muted-foreground mr-1">Pregled stanja:</span>
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
                        <span>Dugovanje / Blokada:</span>
                        <strong>{stats.debtBlock}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span>Servis muringa:</span>
                        <strong>{stats.maintenance}</strong>
                    </div>
                </div>
            </div>

            {/* ─── Prikaz 1: OPERATIVNA PLOČA GATOVA (2D Scrollable Board) ────────── */}
            {viewMode === "board" && (
                <div className="flex-1 bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
                    {/* Horizontalni scroll kontejner za sve gatove */}
                    <div className="flex-1 overflow-x-auto overflow-y-auto p-4 flex gap-6 select-none bg-slate-50/60 dark:bg-slate-950/40">
                        {displayedPiers.map((pier) => {
                            // Grupiraj vezove po parovima za Strana 1 (lijevo) i Strana 2 (desno)
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
                                        {/* Progress bar */}
                                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-300"
                                                style={{ width: `${occupancyPercent}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Oznake strana (Strana 1 | Broj | Strana 2) */}
                                    <div className="grid grid-cols-[145px_36px_145px] bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground text-center py-1.5 px-2">
                                        <span>Strana 1 (Zapad)</span>
                                        <span>Br</span>
                                        <span>Strana 2 (Istok)</span>
                                    </div>

                                    {/* Lista redova i vezova */}
                                    <div className="flex flex-col divide-y p-2 gap-1 overflow-y-auto max-h-[calc(100vh-18rem)]">
                                        {berthRows.map((row) => {
                                            return (
                                                <div
                                                    key={row.rowNumber}
                                                    className="grid grid-cols-[145px_36px_145px] items-center gap-1 py-0.5"
                                                >
                                                    {/* Lijevi vez (Strana 1) */}
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

                                                    {/* Središnji stupić s brojem */}
                                                    <div className="flex items-center justify-center font-mono font-bold text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 rounded h-7">
                                                        {row.rowNumber.toString().padStart(2, "0")}
                                                    </div>

                                                    {/* Desni vez (Strana 2) */}
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
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── Prikaz 2: ZRAČNI DIGITAL TWIN (Georeferencirani tlocrt) ──────── */}
            {viewMode === "aerial" && (
                <div className="flex-1 bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-blue-600" />
                            <h2 className="text-sm font-bold">Panoramski zračni tlocrt (Lucica 7 — Geometrijski model)</h2>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            Klikom na pojedini gat automatski se otvara u operativnoj ploči
                        </span>
                    </div>

                    <div className="flex-1 bg-sky-950/20 dark:bg-sky-950/50 rounded-xl border border-sky-600/30 relative overflow-hidden flex items-center justify-center">
                        <svg viewBox="0 0 1600 900" className="w-full h-full">
                            {/* Vodena površina bazena */}
                            <defs>
                                <linearGradient id="aerialSea" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#0369a1" stopOpacity="0.35" />
                                </linearGradient>
                            </defs>
                            <rect x="20" y="20" width="1560" height="860" rx="12" fill="url(#aerialSea)" stroke="#0284c7" strokeWidth="1.5" />

                            {/* Sjeverni zakrivljeni lukobran (L) */}
                            <g className="breakwater cursor-pointer" onClick={() => { setSelectedPierCode("L"); setViewMode("board"); }}>
                                <path
                                    d="M 120 70 Q 800 50 1520 80 L 1520 115 Q 800 85 120 105 Z"
                                    fill="#475569"
                                    stroke="#334155"
                                    strokeWidth="2"
                                />
                                <text x="820" y="98" fill="#ffffff" fontSize="13" fontWeight="bold" textAnchor="middle" letterSpacing="2">
                                    ⚓ SJEVERNI LUKOBRAN (L) — 46 VEZOVA (KLIKNI ZA OTVARANJE)
                                </text>
                            </g>

                            {/* Zapadna obala (ZO) + Dizalica + Klubovi */}
                            <g className="west-coast cursor-pointer" onClick={() => { setSelectedPierCode("ZO"); setViewMode("board"); }}>
                                <rect x="40" y="80" width="120" height="740" rx="8" fill="#334155" />
                                <text x="100" y="140" fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle">ZAPADNA OBALA (ZO)</text>
                                <text x="100" y="158" fill="#94a3b8" fontSize="10" textAnchor="middle">34 veza</text>

                                {/* Dizalica */}
                                <rect x="50" y="220" width="100" height="50" rx="4" fill="#f59e0b" />
                                <text x="100" y="245" fill="#000000" fontSize="10" fontWeight="bold" textAnchor="middle">DIZALICA 9T</text>
                                <text x="100" y="260" fill="#000000" fontSize="8.5" textAnchor="middle">Travelift</text>

                                {/* Klubovi */}
                                <rect x="50" y="300" width="100" height="28" rx="4" fill="#2563eb" />
                                <text x="100" y="318" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle">JK Špinut</text>

                                <rect x="50" y="336" width="100" height="28" rx="4" fill="#0891b2" />
                                <text x="100" y="354" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle">RK Špinut</text>

                                <rect x="50" y="372" width="100" height="28" rx="4" fill="#059669" />
                                <text x="100" y="390" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle">KŠR Špinut</text>
                            </g>

                            {/* Južna Obala / Šetalište Bene */}
                            <rect x="40" y="820" width="1500" height="50" rx="6" fill="#334155" />
                            <text x="800" y="852" fill="#e2e8f0" fontSize="13" fontWeight="bold" textAnchor="middle" letterSpacing="3">
                                JUŽNA OBALA — ŠETALIŠTE BENE (PRISTUP GATOVIMA 1–12)
                            </text>

                            {/* Gatovi 1 do 12 (Projektirani okomiti pontoni) */}
                            {mapData?.piers
                                .filter((p) => p.code.startsWith("G"))
                                .map((pier, idx) => {
                                    const px = 220 + idx * 108;
                                    const py = 200;
                                    const pw = 24;
                                    const pl = 620;

                                    const occupied = pier.berths.filter((b) => b.status !== "vacant").length;
                                    const percent = Math.round((occupied / pier.totalBerths) * 100);

                                    return (
                                        <g
                                            key={pier.id}
                                            onClick={() => {
                                                setSelectedPierCode(pier.code);
                                                setViewMode("board");
                                            }}
                                            className="cursor-pointer group"
                                        >
                                            {/* Pozadinski hover efekt */}
                                            <rect
                                                x={px - 20}
                                                y={py - 30}
                                                width={pw + 40}
                                                height={pl + 50}
                                                rx="8"
                                                fill="#3b82f6"
                                                fillOpacity="0"
                                                className="group-hover:fill-opacity-10 transition-all"
                                            />

                                            {/* Ponton tijelo */}
                                            <rect x={px} y={py} width={pw} height={pl} rx="4" fill="#64748b" stroke="#334155" strokeWidth="1.5" />

                                            {/* Broj gata na vrhu */}
                                            <circle cx={px + pw / 2} cy={py - 12} r="14" fill="#1e293b" stroke="#3b82f6" strokeWidth="2" />
                                            <text x={px + pw / 2} y={py - 7} fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                                {pier.code.replace("G", "")}
                                            </text>

                                            {/* Oznaka popunjenosti pri dnu gata */}
                                            <rect x={px - 16} y={py + pl - 40} width="56" height="24" rx="4" fill="#1e293b" stroke="#475569" />
                                            <text x={px + pw / 2} y={py + pl - 24} fill="#10b981" fontSize="9.5" fontWeight="bold" textAnchor="middle">
                                                {occupied}/{pier.totalBerths}
                                            </text>
                                        </g>
                                    );
                                })}
                        </svg>
                    </div>
                </div>
            )}

            {/* ─── Prikaz 3: TABLIČNI POPIS VEZOVA ─────────────────────────────── */}
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
                                    Maksimalne dimenzije veza: <strong>{selectedBerth.maxLoaM}m</strong> dužina x <strong>{selectedBerth.maxBeamM}m</strong> širina x <strong>{selectedBerth.maxDraftM}m</strong> gaz
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
                                        <p className="text-xs text-muted-foreground">Možete dodijeliti stalno plovilo ili unijeti tranzitnog gosta</p>
                                    </div>
                                    <Button size="sm" onClick={() => setIsAssignModalOpen(true)} className="text-xs mt-1 bg-blue-600 hover:bg-blue-700">
                                        <Plus className="w-4 h-4 mr-1" /> Dodijeli plovilo na vez
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

            {/* ─── Modal za dodjelu plovila ────────────────────────────────────── */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Dodjela plovila na vez {selectedBerth?.code}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Odaberite registrirano plovilo i člana za postavljanje na vez.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold">Plovilo i vlasnik:</label>
                            <Select value={selectedVesselId} onValueChange={setSelectedVesselId}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue placeholder="Odaberite plovilo..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {assignableVessels?.map((v) => (
                                        <SelectItem key={v.vesselId} value={v.vesselId}>
                                            {v.vesselRegistration} — {v.vesselName} ({v.ownerName || `${v.ownerFirstName} ${v.ownerLastName}`}) [{v.vesselLengthM}m]
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold">Broj ugovora o vezu:</label>
                            <Input
                                placeholder="npr. 469/2001 ili UG-2026-0042"
                                value={contractNumber}
                                onChange={(e) => setContractNumber(e.target.value)}
                                className="text-xs"
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
                            onClick={() => {
                                const vessel = assignableVessels?.find((v) => v.vesselId === selectedVesselId);
                                if (!vessel || !selectedBerth) return;

                                assignVesselMutation.mutate({
                                    berthId: selectedBerth.id,
                                    vesselId: vessel.vesselId,
                                    userId: vessel.ownerId,
                                    contractNumber: contractNumber || undefined,
                                    assignmentType: "permanent_member",
                                });
                            }}
                        >
                            {assignVesselMutation.isPending ? "Dodjeljujem..." : "Potvrdi dodjelu"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
            className={`h-[46px] w-[145px] rounded-lg border p-1.5 cursor-pointer flex flex-col justify-between transition-all duration-200 ${
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
