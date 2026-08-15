/**
 * PŠD Špinut — Interaktivni grafički tlocrt akvatorija i upravljanje vezovima
 * Prikaz svih 14 gatova, 811 morskih vezova i 192 mjesta na kopnu s real-time semaforom statusa.
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
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Status boje i nazivi
const STATUS_CONFIG: Record<
    string,
    { label: string; bg: string; border: string; text: string; fill: string; dot: string }
> = {
    vacant: {
        label: "Slobodan vez",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-500",
        text: "text-emerald-700 dark:text-emerald-300",
        fill: "#10b981",
        dot: "bg-emerald-500",
    },
    occupied: {
        label: "Zauzet (Član)",
        bg: "bg-blue-50 dark:bg-blue-950/40",
        border: "border-blue-500",
        text: "text-blue-700 dark:text-blue-300",
        fill: "#3b82f6",
        dot: "bg-blue-500",
    },
    transit: {
        label: "Tranzitni gost",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        border: "border-amber-500",
        text: "text-amber-700 dark:text-amber-300",
        fill: "#f59e0b",
        dot: "bg-amber-500",
    },
    debt_block: {
        label: "Dugovanje / Blokada",
        bg: "bg-rose-50 dark:bg-rose-950/40",
        border: "border-rose-500",
        text: "text-rose-700 dark:text-rose-300",
        fill: "#ef4444",
        dot: "bg-rose-500",
    },
    maintenance: {
        label: "Servis / Kvar muringa",
        bg: "bg-slate-100 dark:bg-slate-800",
        border: "border-slate-500",
        text: "text-slate-700 dark:text-slate-300",
        fill: "#64748b",
        dot: "bg-slate-500",
    },
    reserved: {
        label: "Rezervirano",
        bg: "bg-purple-50 dark:bg-purple-950/40",
        border: "border-purple-500",
        text: "text-purple-700 dark:text-purple-300",
        fill: "#a855f7",
        dot: "bg-purple-500",
    },
};

export default function AdminAkvatorijMap() {
    const [, setLocation] = useLocation();

    // Query podataka
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
            toast.success("Vez je oslobođen");
            refetch();
            setSelectedBerth(null);
        },
        onError: (err) => toast.error(`Greška: ${err.message}`),
    });

    // Stanja UI-ja
    const [selectedPierCode, setSelectedPierCode] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedBerth, setSelectedBerth] = useState<any | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string>("");
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedVesselId, setSelectedVesselId] = useState<string>("");
    const [contractNumber, setContractNumber] = useState<string>("");
    const [viewTab, setViewTab] = useState<"map" | "grid">("map");

    // Zoom & Pan kontrole za SVG
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const svgContainerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.6));
    const handleResetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setSelectedPierCode("ALL");
        setStatusFilter("ALL");
        setSearchQuery("");
    };

    // Filtrirani gatovi i vezovi
    const filteredPiers = useMemo(() => {
        if (!mapData?.piers) return [];
        return mapData.piers.map((pier) => {
            let berths = pier.berths;
            if (statusFilter !== "ALL") {
                berths = berths.filter((b) => b.status === statusFilter);
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                berths = berths.filter(
                    (b) =>
                        b.code.toLowerCase().includes(q) ||
                        b.vesselName?.toLowerCase().includes(q) ||
                        b.vesselRegistration?.toLowerCase().includes(q) ||
                        b.userName?.toLowerCase().includes(q) ||
                        b.userOib?.includes(q)
                );
            }
            return {
                ...pier,
                filteredBerths: berths,
            };
        });
    }, [mapData, statusFilter, searchQuery]);

    // Provjera podudara li se vez s pretragom za vizualno isticanje (halo efekt)
    const isMatchingSearch = (berth: any) => {
        if (!searchQuery.trim()) return false;
        const q = searchQuery.toLowerCase().trim();
        return (
            berth.code.toLowerCase().includes(q) ||
            berth.vesselName?.toLowerCase().includes(q) ||
            berth.vesselRegistration?.toLowerCase().includes(q) ||
            berth.userName?.toLowerCase().includes(q) ||
            berth.userOib?.includes(q)
        );
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground font-medium">Učitavanje digitalnog tlocrta akvatorija...</p>
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
        <div className="flex flex-col h-[calc(100vh-4rem)] p-4 gap-4 bg-slate-50/50 dark:bg-slate-950/50 overflow-hidden">
            {/* ─── Gornja kontrolna traka i statistika ────────────────────────── */}
            <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Anchor className="w-6 h-6 text-blue-600" />
                            <h1 className="text-xl font-bold tracking-tight">PŠD Špinut — Akvatorij & Vezovi</h1>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold">
                                {stats.totalBerths} Morskih vezova
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Interaktivni digitalni model 14 gatova, lukobrana i akvatorija s praćenjem statusa u stvarnom vremenu
                        </p>
                    </div>

                    {/* Pretraga i filtri */}
                    <div className="flex items-center gap-2">
                        <div className="relative w-64">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Traži vez, brod, reg, člana..."
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
                        </div>

                        <Select value={selectedPierCode} onValueChange={setSelectedPierCode}>
                            <SelectTrigger className="w-40 h-9 text-xs">
                                <SelectValue placeholder="Odaberi gat" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Svi gatovi (Akvatorij)</SelectItem>
                                {mapData?.piers.map((p) => (
                                    <SelectItem key={p.id} value={p.code}>
                                        {p.name} ({p.totalBerths})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-36 h-9 text-xs">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Svi statusi</SelectItem>
                                <SelectItem value="vacant">🟩 Slobodni</SelectItem>
                                <SelectItem value="occupied">🟦 Zauzeti (Član)</SelectItem>
                                <SelectItem value="transit">🟨 Tranzit</SelectItem>
                                <SelectItem value="debt_block">🟥 Dugovanje</SelectItem>
                                <SelectItem value="maintenance">⬛ Servis</SelectItem>
                                <SelectItem value="reserved">🟪 Rezervirano</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex border rounded-lg overflow-hidden shrink-0">
                            <Button
                                size="sm"
                                variant={viewTab === "map" ? "default" : "ghost"}
                                onClick={() => setViewTab("map")}
                                className="h-9 px-3 text-xs rounded-none"
                            >
                                <Layers className="w-3.5 h-3.5 mr-1" /> Karta
                            </Button>
                            <Button
                                size="sm"
                                variant={viewTab === "grid" ? "default" : "ghost"}
                                onClick={() => setViewTab("grid")}
                                className="h-9 px-3 text-xs rounded-none"
                            >
                                Tablica
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Semafor traka statistike */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-xs">
                    <span className="font-semibold text-muted-foreground">Statusi u moru:</span>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Slobodno:</span>
                        <strong className="ml-1">{stats.vacant}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>Zauzeto (Član):</span>
                        <strong className="ml-1">{stats.occupied}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Tranzit:</span>
                        <strong className="ml-1">{stats.transit}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span>Dugovanje / Blokada:</span>
                        <strong className="ml-1">{stats.debtBlock}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span>Kvar muringa:</span>
                        <strong className="ml-1">{stats.maintenance}</strong>
                    </div>
                    {stats.reserved > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-950/50 border border-purple-200 text-purple-700 font-medium">
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            <span>Rezervirano:</span>
                            <strong className="ml-1">{stats.reserved}</strong>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Glavni radni prostor (SVG Karta ili Tablica) ───────────────── */}
            <div className="relative flex-1 bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {/* Alatna traka za Zoom i Pan */}
                {viewTab === "map" && (
                    <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-background/90 backdrop-blur border p-1 rounded-lg shadow-md">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleZoomIn} title="Povećaj (Zoom In)">
                            <ZoomIn className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleZoomOut} title="Smanji (Zoom Out)">
                            <ZoomOut className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleResetView} title="Resetiraj pogled">
                            <RotateCcw className="w-4 h-4" />
                        </Button>
                        <div className="h-px bg-border my-0.5" />
                        <span className="text-[10px] font-mono text-center text-muted-foreground font-semibold">
                            {Math.round(zoom * 100)}%
                        </span>
                    </div>
                )}

                {/* Prikaz 1: Interaktivni SVG Tlocrt Akvatorija */}
                {viewTab === "map" ? (
                    <div
                        ref={svgContainerRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        className={`w-full h-full cursor-${isDragging ? "grabbing" : "grab"} select-none bg-sky-950/10 dark:bg-sky-950/40 relative overflow-hidden flex items-center justify-center`}
                    >
                        <svg
                            viewBox="0 0 1600 950"
                            className="w-full h-full transition-transform duration-75"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: "center center",
                            }}
                        >
                            {/* Pozadina akvatorija / Morski bazen */}
                            <defs>
                                <linearGradient id="seaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="#0369a1" stopOpacity="0.25" />
                                </linearGradient>
                                <pattern id="waterPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                                    <path d="M 0 20 Q 10 15 20 20 T 40 20" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3" />
                                </pattern>
                            </defs>

                            {/* Akvatorij pravokutnik s vodenom teksturom */}
                            <rect x="20" y="20" width="1560" height="910" rx="16" fill="url(#seaGradient)" stroke="#0284c7" strokeWidth="1.5" strokeDasharray="4 4" />
                            <rect x="20" y="20" width="1560" height="910" fill="url(#waterPattern)" />

                            {/* Sjeverni Lukobran (L) — Vrh slike */}
                            <g className="breakwater-group">
                                <rect x="180" y="40" width="1380" height="36" rx="6" fill="#475569" stroke="#334155" strokeWidth="2" />
                                <text x="200" y="63" fill="#ffffff" fontSize="13" fontWeight="bold" letterSpacing="2">
                                    ⚓ LUKOBRAN (L) — 46 VEZOVA
                                </text>

                                {/* Vezovi na lukobranu (46 vezova) */}
                                {mapData?.piers.find((p) => p.code === "L")?.berths.map((b, idx) => {
                                    const bw = 26;
                                    const bx = 450 + idx * 28;
                                    const by = 80;
                                    const statusCfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.vacant;
                                    const isHighlighted = isMatchingSearch(b);

                                    return (
                                        <g
                                            key={b.id}
                                            onClick={() => setSelectedBerth(b)}
                                            className="cursor-pointer group"
                                        >
                                            {isHighlighted && (
                                                <rect x={bx - 2} y={by - 2} width={bw + 4} height={38} rx="4" fill="none" stroke="#f59e0b" strokeWidth="3" className="animate-pulse" />
                                            )}
                                            <rect
                                                x={bx}
                                                y={by}
                                                width={bw}
                                                height="34"
                                                rx="3"
                                                fill={statusCfg.fill}
                                                stroke="#ffffff"
                                                strokeWidth="1"
                                                className="transition-all hover:brightness-125"
                                            />
                                            <text x={bx + bw / 2} y={by + 21} fill="#ffffff" fontSize="8.5" fontWeight="bold" textAnchor="middle">
                                                {b.berthNumber}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>

                            {/* Zapadna obala & Klupska zona (ZO) */}
                            <g className="west-quay-group">
                                <rect x="30" y="40" width="120" height="840" rx="8" fill="#334155" stroke="#1e293b" strokeWidth="2" />
                                <text x="90" y="100" fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle">
                                    ZAPADNA
                                </text>
                                <text x="90" y="118" fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
                                    OBALA (ZO)
                                </text>

                                {/* Klupski bedževi */}
                                <rect x="40" y="160" width="100" height="34" rx="4" fill="#2563eb" />
                                <text x="90" y="181" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">JK Špinut</text>

                                <rect x="40" y="204" width="100" height="34" rx="4" fill="#0891b2" />
                                <text x="90" y="225" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">RK Špinut</text>

                                <rect x="40" y="248" width="100" height="34" rx="4" fill="#059669" />
                                <text x="90" y="269" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">KŠR Špinut</text>

                                {/* Dizalica / Travelift bazen */}
                                <rect x="40" y="320" width="100" height="55" rx="6" fill="#f59e0b" />
                                <text x="90" y="345" fill="#000000" fontSize="10" fontWeight="bold" textAnchor="middle">DIZALICA 9T</text>
                                <text x="90" y="360" fill="#000000" fontSize="8.5" textAnchor="middle">Travelift bazen</text>

                                {/* Vezovi Zapadne obale (34 veza) */}
                                {mapData?.piers.find((p) => p.code === "ZO")?.berths.map((b, idx) => {
                                    const by = 400 + idx * 13;
                                    const bx = 115;
                                    const statusCfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.vacant;
                                    const isHighlighted = isMatchingSearch(b);

                                    return (
                                        <g key={b.id} onClick={() => setSelectedBerth(b)} className="cursor-pointer group">
                                            {isHighlighted && (
                                                <rect x={bx + 35} y={by - 1} width="40" height="11" rx="2" fill="none" stroke="#f59e0b" strokeWidth="2" className="animate-pulse" />
                                            )}
                                            <rect
                                                x={bx + 38}
                                                y={by}
                                                width="36"
                                                height="10"
                                                rx="2"
                                                fill={statusCfg.fill}
                                                stroke="#ffffff"
                                                strokeWidth="0.5"
                                                className="transition-all hover:brightness-125"
                                            />
                                            <text x={bx + 56} y={by + 8} fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">
                                                {b.berthNumber}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>

                            {/* Južna Obala / Šetalište Bene (Poveznica svih pontona) */}
                            <g className="south-promenade-group">
                                <rect x="30" y="880" width="1530" height="40" rx="6" fill="#334155" stroke="#1e293b" strokeWidth="2" />
                                <text x="800" y="905" fill="#e2e8f0" fontSize="13" fontWeight="bold" textAnchor="middle" letterSpacing="3">
                                    JUŽNA OBALA — ŠETALIŠTE BENE / PRISTUP GATOVIMA 1–12
                                </text>
                            </g>

                            {/* ─── GATOVI 1 DO 12 (Okomiti pontoni) ───────────────────────── */}
                            {mapData?.piers
                                .filter((p) => p.code.startsWith("G"))
                                .map((pier, pIdx) => {
                                    // Izračun X pozicije pontona
                                    const pierStartX = 230 + pIdx * 108;
                                    const pontoonWidth = 14;
                                    const pontoonLength = 680;
                                    const pontoonY = 190;
                                    const isSelectedPier = selectedPierCode === pier.code;

                                    return (
                                        <g key={pier.id} className={`pier-group-${pier.code}`}>
                                            {/* Istaknuti okvir ako je odabran gat */}
                                            {isSelectedPier && (
                                                <rect
                                                    x={pierStartX - 42}
                                                    y={pontoonY - 45}
                                                    width="98"
                                                    height={pontoonLength + 90}
                                                    rx="10"
                                                    fill="#3b82f6"
                                                    fillOpacity="0.08"
                                                    stroke="#3b82f6"
                                                    strokeWidth="2"
                                                    strokeDasharray="4 4"
                                                />
                                            )}

                                            {/* Ponton tijelo */}
                                            <rect
                                                x={pierStartX}
                                                y={pontoonY}
                                                width={pontoonWidth}
                                                height={pontoonLength}
                                                rx="4"
                                                fill="#64748b"
                                                stroke="#334155"
                                                strokeWidth="1.5"
                                            />

                                            {/* Oznaka gata na vrhu */}
                                            <circle cx={pierStartX + pontoonWidth / 2} cy={pontoonY - 18} r="15" fill="#1e293b" stroke="#3b82f6" strokeWidth="2" />
                                            <text
                                                x={pierStartX + pontoonWidth / 2}
                                                y={pontoonY - 13}
                                                fill="#ffffff"
                                                fontSize="11"
                                                fontWeight="bold"
                                                textAnchor="middle"
                                            >
                                                {pier.code.replace("G", "")}
                                            </text>

                                            {/* Vezovi s lijeve i desne strane pontona */}
                                            {pier.berths.map((b) => {
                                                const isLeft = b.side === "left";
                                                const rowIdx = Math.floor((b.berthNumber - 1) / 2);
                                                const berthY = pontoonY + 15 + rowIdx * 19;
                                                const berthX = isLeft ? pierStartX - 38 : pierStartX + pontoonWidth + 2;
                                                const berthWidth = 36;
                                                const berthHeight = 16;
                                                const statusCfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.vacant;
                                                const isHighlighted = isMatchingSearch(b);

                                                return (
                                                    <g
                                                        key={b.id}
                                                        onClick={() => setSelectedBerth(b)}
                                                        className="cursor-pointer group"
                                                    >
                                                        {isHighlighted && (
                                                            <rect
                                                                x={berthX - 2}
                                                                y={berthY - 2}
                                                                width={berthWidth + 4}
                                                                height={berthHeight + 4}
                                                                rx="4"
                                                                fill="none"
                                                                stroke="#f59e0b"
                                                                strokeWidth="2.5"
                                                                className="animate-pulse"
                                                            />
                                                        )}
                                                        <rect
                                                            x={berthX}
                                                            y={berthY}
                                                            width={berthWidth}
                                                            height={berthHeight}
                                                            rx="3"
                                                            fill={statusCfg.fill}
                                                            stroke="#ffffff"
                                                            strokeWidth="0.75"
                                                            className="transition-all hover:brightness-125"
                                                        />
                                                        <text
                                                            x={berthX + berthWidth / 2}
                                                            y={berthY + 11.5}
                                                            fill="#ffffff"
                                                            fontSize="8"
                                                            fontWeight="bold"
                                                            textAnchor="middle"
                                                        >
                                                            {b.berthNumber}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    );
                                })}
                        </svg>
                    </div>
                ) : (
                    /* Prikaz 2: Tablični pregled vezova */
                    <div className="flex-1 overflow-auto p-4">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead>
                                <tr className="border-b bg-muted/50 text-muted-foreground font-semibold">
                                    <th className="p-2.5">Oznaka</th>
                                    <th className="p-2.5">Gat</th>
                                    <th className="p-2.5">Broj</th>
                                    <th className="p-2.5">Status</th>
                                    <th className="p-2.5">Plovilo</th>
                                    <th className="p-2.5">Registracija</th>
                                    <th className="p-2.5">Član / Vlasnik</th>
                                    <th className="p-2.5">OIB</th>
                                    <th className="p-2.5">Dimenzije (LOA x B x Gaz)</th>
                                    <th className="p-2.5 text-right">Akcija</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredPiers.flatMap((p) =>
                                    p.filteredBerths.map((b) => {
                                        const statusCfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.vacant;
                                        return (
                                            <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="p-2.5 font-bold font-mono text-blue-600">{b.code}</td>
                                                <td className="p-2.5">{p.name}</td>
                                                <td className="p-2.5 font-mono">{b.berthNumber}</td>
                                                <td className="p-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                                                        {statusCfg.label}
                                                    </span>
                                                </td>
                                                <td className="p-2.5 font-medium">{b.vesselName || "—"}</td>
                                                <td className="p-2.5 font-mono font-semibold">{b.vesselRegistration || "—"}</td>
                                                <td className="p-2.5">{b.userName || "—"}</td>
                                                <td className="p-2.5 font-mono">{b.userOib || "—"}</td>
                                                <td className="p-2.5 text-muted-foreground">
                                                    max {b.maxLoaM}m x {b.maxBeamM}m x {b.maxDraftM}m
                                                </td>
                                                <td className="p-2.5 text-right">
                                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedBerth(b)}>
                                                        Detalji
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
            </div>

            {/* ─── Drawer / Detalji pojedinog veza ────────────────────────────── */}
            <Sheet open={!!selectedBerth} onOpenChange={(open) => !open && setSelectedBerth(null)}>
                <SheetContent className="w-[420px] sm:w-[540px] overflow-y-auto p-6">
                    {selectedBerth && (
                        <div className="flex flex-col gap-6">
                            <SheetHeader className="p-0 border-b pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge className="text-base px-3 py-1 font-mono bg-blue-600">
                                            {selectedBerth.code}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            {selectedBerth.side === "left" ? "Lijeva strana" : selectedBerth.side === "right" ? "Desna strana" : "Obala"}
                                        </Badge>
                                    </div>
                                    <span
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                            STATUS_CONFIG[selectedBerth.status]?.bg
                                        } ${STATUS_CONFIG[selectedBerth.status]?.text} border ${
                                            STATUS_CONFIG[selectedBerth.status]?.border
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[selectedBerth.status]?.dot}`} />
                                        {STATUS_CONFIG[selectedBerth.status]?.label}
                                    </span>
                                </div>
                                <SheetTitle className="text-lg font-bold mt-2">
                                    Upravljanje vezom {selectedBerth.code}
                                </SheetTitle>
                                <SheetDescription className="text-xs">
                                    Maksimalne dopuštene dimenzije: <strong>{selectedBerth.maxLoaM}m</strong> dužina x <strong>{selectedBerth.maxBeamM}m</strong> širina x <strong>{selectedBerth.maxDraftM}m</strong> gaz
                                </SheetDescription>
                            </SheetHeader>

                            {/* Priključci za struju i vodu */}
                            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg text-xs">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    <div>
                                        <p className="font-semibold">Priključak struje</p>
                                        <p className="text-muted-foreground">{selectedBerth.hasElectricity ? "Dostupno (Ormarić)" : "Nema"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Droplets className="w-4 h-4 text-sky-500" />
                                    <div>
                                        <p className="font-semibold">Priključak vode</p>
                                        <p className="text-muted-foreground">{selectedBerth.hasWater ? "Dostupno (Priključak)" : "Nema"}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Podaci o dodijeljenom plovilu i članu */}
                            {selectedBerth.vesselId ? (
                                <div className="flex flex-col gap-4 p-4 border rounded-xl bg-card shadow-sm">
                                    <div className="flex items-center justify-between border-b pb-3">
                                        <div className="flex items-center gap-2">
                                            <Ship className="w-5 h-5 text-blue-600" />
                                            <div>
                                                <h3 className="font-bold text-sm">{selectedBerth.vesselName || "Neimenovano plovilo"}</h3>
                                                <p className="font-mono text-xs text-blue-600 font-semibold">{selectedBerth.vesselRegistration}</p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className="capitalize text-xs">
                                            {selectedBerth.vesselType || "Brod"}
                                        </Badge>
                                    </div>

                                    {/* Dimenzije broda */}
                                    <div className="grid grid-cols-3 gap-2 text-xs text-center p-2 bg-muted/30 rounded-lg">
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
                                            <span className="text-muted-foreground">Korisnik veza (Član):</span>
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
                                                <span className="text-muted-foreground">Ugovor o vezu:</span>
                                                <span className="font-mono text-blue-600">{selectedBerth.contractNumber}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Akcijski gumbi za zauzeti vez */}
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
                                /* Vez je slobodan — Ponudi dodjelu */
                                <div className="p-6 border border-dashed rounded-xl flex flex-col items-center justify-center gap-3 text-center bg-muted/10">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">Vez je slobodan</h4>
                                        <p className="text-xs text-muted-foreground">Možete dodijeliti stalnog člana ili evidentirati tranzitnog gosta</p>
                                    </div>
                                    <Button size="sm" onClick={() => setIsAssignModalOpen(true)} className="text-xs mt-1 bg-blue-600 hover:bg-blue-700">
                                        <Plus className="w-4 h-4 mr-1" /> Dodijeli plovilo na vez
                                    </Button>
                                </div>
                            )}

                            {/* Brza promjena operativnog statusa veza */}
                            <div className="flex flex-col gap-2 pt-4 border-t">
                                <label className="text-xs font-semibold">Operativni status veza:</label>
                                <div className="flex items-center gap-2">
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
                                            <SelectItem value="vacant">🟩 Slobodan vez</SelectItem>
                                            <SelectItem value="occupied">🟦 Zauzet (Član)</SelectItem>
                                            <SelectItem value="transit">🟨 Tranzitni gost</SelectItem>
                                            <SelectItem value="debt_block">🟥 Dugovanje / Blokada</SelectItem>
                                            <SelectItem value="maintenance">⬛ Servis / Kvar muringa</SelectItem>
                                            <SelectItem value="reserved">🟪 Rezervirano</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* ─── Modal za dodjelu plovila na vez ─────────────────────────────── */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Dodjela plovila na vez {selectedBerth?.code}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Odaberite registrirano plovilo i člana za dodjelu ugovora o vezu.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold">Odaberite plovilo & vlasnika:</label>
                            <Select value={selectedVesselId} onValueChange={setSelectedVesselId}>
                                <SelectTrigger className="text-xs">
                                    <SelectValue placeholder="Odaberite brod..." />
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
                            <label className="text-xs font-semibold">Broj ugovora o vezu (opcijski):</label>
                            <Input
                                placeholder="npr. UG-2026-0042"
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
