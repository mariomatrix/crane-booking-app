import { useState, useEffect, useMemo } from "react";
import {
    Anchor,
    Search,
    Phone,
    CheckCircle2,
    Clock,
    Play,
    Check,
    MessageSquare,
    Settings,
    LogOut,
    Smartphone,
    MapPin,
    AlertCircle,
    Calendar,
    ChevronRight,
    Send,
    User,
    Ship
} from "lucide-react";
import { toast } from "sonner";

interface OperatorUser {
    id: string;
    email: string;
    name: string | null;
    role: string;
    phone: string | null;
}

interface AssignedCrane {
    id: string;
    name: string;
    type: string;
}

interface TaskItem {
    id: string;
    reservationNumber: string;
    status: "approved" | "in_progress" | "completed" | "cancelled";
    scheduledStart: string;
    scheduledEnd: string;
    durationMin: number;
    vessel: {
        id: string;
        name: string;
        type: string;
        registration: string;
        lengthM: string | null;
        beamM: string | null;
        weightTons: string | null;
    } | null;
    owner: {
        id: string;
        name: string;
        phone: string | null;
    } | null;
    serviceType: {
        id: string;
        name: string;
        category: string;
    } | null;
    crane: {
        id: string;
        name: string;
    } | null;
    dryBerthPlacement: {
        zoneCode: string;
        zoneName: string;
    } | null;
}

interface LandZone {
    id: string;
    name: string;
    code: string;
    totalSpots: number;
    occupiedSpots: number;
    availableSpots: number;
}

export default function MobileOperatorApp() {
    // Auth State
    const [token, setToken] = useState<string | null>(localStorage.getItem("mobile_operator_token"));
    const [operatorUser, setOperatorUser] = useState<OperatorUser | null>(null);
    const [assignedCranes, setAssignedCranes] = useState<AssignedCrane[]>([]);

    // PIN Login pad state
    const [pin, setPin] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Active Navigation Tab: "tasks" | "notifications" | "settings"
    const [activeTab, setActiveTab] = useState<"tasks" | "notifications" | "settings">("tasks");

    // Tasks & Schedule State
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCraneId, setSelectedCraneId] = useState<string>("all");
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);

    // Land Zones state for Dry Berth Assignment dialog
    const [landZones, setLandZones] = useState<LandZone[]>([]);
    const [assigningTask, setAssigningTask] = useState<TaskItem | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string>("");
    const [assignNote, setAssignNote] = useState("");
    const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

    // Chat / Message Dialog State
    const [messagingTask, setMessagingTask] = useState<TaskItem | null>(null);
    const [messageText, setMessageText] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);

    // Load Profile when token exists
    useEffect(() => {
        if (!token) return;
        fetchProfile();
    }, [token]);

    // Load tasks when authenticated and date changes
    useEffect(() => {
        if (!token) return;
        fetchSchedule();
        fetchLandZones();
    }, [token, selectedDate]);

    const fetchProfile = async () => {
        try {
            const res = await fetch("/api/mobile/v1/profile", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                if (res.status === 401) handleLogout();
                return;
            }
            const data = await res.json();
            setOperatorUser(data.user);
            setAssignedCranes(data.assignedCranes || []);
        } catch (e) {
            console.error("Failed to load profile", e);
        }
    };

    const fetchSchedule = async () => {
        setIsLoadingTasks(true);
        try {
            const res = await fetch(`/api/mobile/v1/schedule/today?date=${selectedDate}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
            }
        } catch (e) {
            console.error("Failed to fetch schedule", e);
        } finally {
            setIsLoadingTasks(false);
        }
    };

    const fetchLandZones = async () => {
        try {
            const res = await fetch("/api/mobile/v1/land-zones", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLandZones(data || []);
            }
        } catch (e) {
            console.error("Failed to fetch land zones", e);
        }
    };

    const handlePinSubmit = async (pinValue: string) => {
        if (pinValue.length < 4) return;
        setIsLoggingIn(true);
        try {
            const res = await fetch("/api/mobile/v1/auth/pin-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: pinValue })
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Neispravan PIN");
                setPin("");
                return;
            }
            localStorage.setItem("mobile_operator_token", data.token);
            setToken(data.token);
            setOperatorUser(data.user);
            toast.success(`Dobrodošli, ${data.user.name || data.user.email}`);
        } catch (e: any) {
            toast.error("Greška pri mreži ili poslužitelju");
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("mobile_operator_token");
        setToken(null);
        setOperatorUser(null);
        setPin("");
    };

    const handleUpdateStatus = async (taskId: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/mobile/v1/reservations/${taskId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                toast.success(`Status promijenjen na ${newStatus === "in_progress" ? "U tijeku" : "Završeno"}`);
                fetchSchedule();
            } else {
                toast.error("Greška pri promjeni statusa");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        }
    };

    const handleAssignLandZone = async () => {
        if (!assigningTask?.vessel?.id || !selectedZoneId) {
            toast.error("Odaberite zonu suhog veza");
            return;
        }
        setIsSubmittingAssign(true);
        try {
            const res = await fetch("/api/mobile/v1/land-occupancies", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    vesselId: assigningTask.vessel.id,
                    zoneId: selectedZoneId,
                    notes: assignNote.trim()
                })
            });
            if (res.ok) {
                toast.success("Brod uspješno dodijeljen u zonu suhog veza!");
                setAssigningTask(null);
                setAssignNote("");
                fetchSchedule();
                fetchLandZones();
            } else {
                toast.error("Greška pri dodjeli zone");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        } finally {
            setIsSubmittingAssign(false);
        }
    };

    const handleSendMessage = async () => {
        if (!messagingTask?.id || !messageText.trim()) return;
        setIsSendingMessage(true);
        try {
            const res = await fetch("/api/mobile/v1/messages/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    reservationId: messagingTask.id,
                    content: messageText.trim()
                })
            });
            if (res.ok) {
                toast.success("Poruka poslana korisniku!");
                setMessagingTask(null);
                setMessageText("");
            } else {
                toast.error("Greška pri slanju poruke");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        } finally {
            setIsSendingMessage(false);
        }
    };

    // Filtered tasks
    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            if (selectedCraneId !== "all" && t.crane?.id !== selectedCraneId) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const vName = t.vessel?.name?.toLowerCase() || "";
                const vReg = t.vessel?.registration?.toLowerCase() || "";
                const oName = t.owner?.name?.toLowerCase() || "";
                return vName.includes(q) || vReg.includes(q) || oName.includes(q);
            }
            return true;
        });
    }, [tasks, selectedCraneId, searchQuery]);

    // Metric stats
    const totalCount = filteredTasks.length;
    const approvedCount = filteredTasks.filter(t => t.status === "approved").length;
    const inProgressCount = filteredTasks.filter(t => t.status === "in_progress").length;
    const completedCount = filteredTasks.filter(t => t.status === "completed").length;

    // PIN Pad Login View
    if (!token || !operatorUser) {
        return (
            <div className="min-h-screen bg-indigo-600 flex flex-col justify-between p-6 text-white font-sans">
                <div className="text-center pt-8 space-y-3">
                    <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl mx-auto">
                        <Anchor className="h-10 w-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dizalica Port Manager</h1>
                    <p className="text-indigo-100 text-sm font-medium">Aplikacija za operatere na terenu</p>
                </div>

                <div className="max-w-xs mx-auto w-full space-y-6">
                    <div className="text-center space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Unesite 4-Znamenkasti PIN</p>
                        <div className="flex justify-center gap-3 py-2">
                            {[0, 1, 2, 3].map(idx => (
                                <div
                                    key={idx}
                                    className={`h-4 w-4 rounded-full transition-all duration-200 ${
                                        pin.length > idx ? "bg-white scale-125 shadow" : "bg-white/25"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Keypad */}
                    <div className="grid grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button
                                key={num}
                                onClick={() => {
                                    if (pin.length < 4) {
                                        const newPin = pin + num;
                                        setPin(newPin);
                                        if (newPin.length === 4) handlePinSubmit(newPin);
                                    }
                                }}
                                className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition font-bold text-2xl backdrop-blur-sm border border-white/10"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            onClick={() => setPin("")}
                            className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition font-semibold text-xs text-indigo-200 uppercase backdrop-blur-sm border border-white/10"
                        >
                            Briši
                        </button>
                        <button
                            onClick={() => {
                                if (pin.length < 4) {
                                    const newPin = pin + "0";
                                    setPin(newPin);
                                    if (newPin.length === 4) handlePinSubmit(newPin);
                                }
                            }}
                            className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition font-bold text-2xl backdrop-blur-sm border border-white/10"
                        >
                            0
                        </button>
                        <button
                            disabled={pin.length < 4 || isLoggingIn}
                            onClick={() => handlePinSubmit(pin)}
                            className="h-16 rounded-2xl bg-white text-indigo-600 font-bold text-lg hover:bg-indigo-50 active:scale-95 transition flex items-center justify-center shadow-lg disabled:opacity-50"
                        >
                            {isLoggingIn ? "..." : "OK"}
                        </button>
                    </div>
                </div>

                <div className="text-center text-xs text-indigo-200/80 pb-4">
                    Marina Cranes Mobile v2.0 • Proel Postgres
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sky-50 flex flex-col font-sans pb-24 text-slate-800">
            {/* Rich Indigo Header Bar (bg-indigo-600) */}
            <header className="bg-indigo-600 text-white px-5 pt-6 pb-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shadow-md shrink-0">
                            <Anchor className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-tight">Dizalica Port Manager</h1>
                            <p className="text-xs text-indigo-100 font-medium">
                                Danas: <span className="font-bold text-white">{totalCount} poslova</span>
                            </p>
                        </div>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm tracking-wider border border-white/20">
                        {operatorUser.role}
                    </span>
                </div>

                {/* High Contrast Status Bar */}
                <div className="flex items-center gap-2 bg-indigo-900/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-indigo-400/30 text-xs font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-emerald-300 font-bold tracking-wide">SUSTAV AKTIVAN</span>
                    <span className="text-indigo-200 ml-auto font-normal text-[11px]">{operatorUser.name || operatorUser.email}</span>
                </div>
            </header>

            {/* Main Content View */}
            <main className="p-4 space-y-4 max-w-lg mx-auto w-full">
                {activeTab === "tasks" && (
                    <>
                        {/* 3XL Metric Cards (Vibrant Accent Pills) */}
                        <div className="grid grid-cols-4 gap-2">
                            <div className="bg-indigo-50 border-2 border-indigo-100 p-2.5 rounded-2xl text-center shadow-xs">
                                <span className="text-[10px] font-extrabold uppercase text-indigo-600 tracking-tight block">Ukupno</span>
                                <span className="text-xl font-black text-indigo-700">{totalCount}</span>
                            </div>
                            <div className="bg-emerald-50 border-2 border-emerald-200 p-2.5 rounded-2xl text-center shadow-xs">
                                <span className="text-[10px] font-extrabold uppercase text-emerald-700 tracking-tight block">Odobreno</span>
                                <span className="text-xl font-black text-emerald-700">{approvedCount}</span>
                            </div>
                            <div className="bg-amber-50 border-2 border-amber-200 p-2.5 rounded-2xl text-center shadow-xs">
                                <span className="text-[10px] font-extrabold uppercase text-amber-700 tracking-tight block">U tijeku</span>
                                <span className="text-xl font-black text-amber-700">{inProgressCount}</span>
                            </div>
                            <div className="bg-slate-100 border-2 border-slate-200 p-2.5 rounded-2xl text-center shadow-xs">
                                <span className="text-[10px] font-extrabold uppercase text-slate-600 tracking-tight block">Završeno</span>
                                <span className="text-xl font-black text-slate-700">{completedCount}</span>
                            </div>
                        </div>

                        {/* Controls Bar: Search & Crane Filter */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Pretraži brodicu, registraciju (npr. ST-402) ili vlasnika..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-indigo-100 rounded-2xl text-xs font-medium shadow-xs focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Crane Selection (Only assigned cranes for logged operator) */}
                            {assignedCranes.length > 0 && (
                                <div className="flex items-center gap-2 bg-white px-3 py-2 border-2 border-indigo-100 rounded-2xl text-xs font-semibold text-slate-700 shadow-xs">
                                    <Anchor className="h-4 w-4 text-indigo-600 shrink-0" />
                                    <select
                                        value={selectedCraneId}
                                        onChange={(e) => setSelectedCraneId(e.target.value)}
                                        className="bg-transparent w-full text-xs font-bold text-indigo-900 focus:outline-none cursor-pointer"
                                    >
                                        <option value="all">Sve dodijeljene dizalice ({assignedCranes.length})</option>
                                        {assignedCranes.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Task List (3XL Cards with border-4 border-indigo-100) */}
                        <div className="space-y-3.5 pt-1">
                            {isLoadingTasks ? (
                                <div className="text-center py-10 text-slate-400 font-medium text-xs">
                                    Učitavanje rasporeda...
                                </div>
                            ) : filteredTasks.length === 0 ? (
                                <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-8 text-center space-y-2 shadow-sm">
                                    <Clock className="h-10 w-10 text-indigo-300 mx-auto" />
                                    <p className="font-bold text-slate-700 text-sm">Nema poslova za odabrani dan ili filter</p>
                                    <p className="text-xs text-slate-500">Provjerite datum ili pretragu registracije.</p>
                                </div>
                            ) : (
                                filteredTasks.map(t => {
                                    const timeStr = t.scheduledStart
                                        ? new Date(t.scheduledStart).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
                                        : "--:--";

                                    return (
                                        <div
                                            key={t.id}
                                            className={`bg-white border-4 rounded-[2rem] p-4 shadow-sm space-y-3 transition-all ${
                                                t.status === "in_progress"
                                                    ? "border-amber-400 ring-2 ring-amber-400/20"
                                                    : t.status === "completed"
                                                    ? "border-slate-200 opacity-85"
                                                    : "border-indigo-100"
                                            }`}
                                        >
                                            {/* Time & Vessel Title */}
                                            <div className="flex items-start justify-between gap-2 border-b pb-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                                                            🕒 {timeStr}
                                                        </span>
                                                        <span className="text-xs font-bold text-slate-900">
                                                            {t.vessel?.registration ? `[${t.vessel.registration}]` : ""} {t.vessel?.name || "Nepoznato plovilo"}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-medium text-slate-500 mt-1">
                                                        {t.serviceType?.name || "Operacija dizalice"} ({t.crane?.name || "Dizalica"})
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shrink-0 ${
                                                    t.status === "in_progress" ? "bg-amber-100 text-amber-800" :
                                                    t.status === "completed" ? "bg-slate-100 text-slate-700" :
                                                    "bg-emerald-100 text-emerald-800"
                                                }`}>
                                                    {t.status === "in_progress" ? "U tijeku" : t.status === "completed" ? "Završeno" : "Odobreno"}
                                                </span>
                                            </div>

                                            {/* Vessel Dimensions & Contact */}
                                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Dimenzije plovila</span>
                                                    <span className="font-semibold text-slate-700">
                                                        {t.vessel?.lengthM || "?"}m × {t.vessel?.beamM || "?"}m | {t.vessel?.weightTons || "?"}t
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Vlasnik plovila</span>
                                                    <span className="font-semibold text-slate-700">{t.owner?.name || "Nije naveden"}</span>
                                                </div>
                                            </div>

                                            {/* Dry Berth Placement Info */}
                                            <div className="flex items-center justify-between text-xs bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
                                                    <span className="font-semibold text-indigo-950">
                                                        Suhi vez: {t.dryBerthPlacement ? (
                                                            <strong className="text-indigo-700 font-bold">{t.dryBerthPlacement.zoneCode} ({t.dryBerthPlacement.zoneName})</strong>
                                                        ) : (
                                                            <span className="text-amber-700 font-medium">Nije dodijeljena zona</span>
                                                        )}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setAssigningTask(t);
                                                        setSelectedZoneId("");
                                                        setAssignNote("");
                                                    }}
                                                    className="text-[11px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs hover:bg-indigo-50"
                                                >
                                                    {t.dryBerthPlacement ? "Izmjeni" : "+ Dodijeli"}
                                                </button>
                                            </div>

                                            {/* Action Buttons Row */}
                                            <div className="flex items-center gap-2 pt-1">
                                                {/* Click-to-Call */}
                                                {t.owner?.phone && (
                                                    <a
                                                        href={`tel:${t.owner.phone}`}
                                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <Phone className="h-3.5 w-3.5" />
                                                        <span>Pozovi</span>
                                                    </a>
                                                )}

                                                {/* Status Action Button */}
                                                {t.status === "approved" && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(t.id, "in_progress")}
                                                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <Play className="h-3.5 w-3.5 fill-current" />
                                                        <span>Započni rad</span>
                                                    </button>
                                                )}

                                                {t.status === "in_progress" && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(t.id, "completed")}
                                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        <span>Završi rad</span>
                                                    </button>
                                                )}

                                                {/* Send Chat / Note */}
                                                <button
                                                    onClick={() => {
                                                        setMessagingTask(t);
                                                        setMessageText("");
                                                    }}
                                                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 font-bold p-2 rounded-xl text-xs flex items-center justify-center active:scale-95 transition"
                                                    title="Pošalji poruku korisniku"
                                                >
                                                    <MessageSquare className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}

                {activeTab === "notifications" && (
                    <div className="space-y-4">
                        <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-5 shadow-sm space-y-3">
                            <h2 className="font-bold text-base text-indigo-950 flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-indigo-600" />
                                Obavijesti & Chat s korisnicima
                            </h2>
                            <p className="text-xs text-slate-500">
                                Slanje obavijesti i informacija vlasnicima brodova u realnom vremenu.
                            </p>
                        </div>

                        {/* Preset Notification Shortcuts */}
                        <div className="space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Brzi predlošci obavijesti</span>
                            <div className="space-y-2">
                                <button
                                    onClick={() => toast.info("Odaberite posao u listi za slanje poruke.")}
                                    className="w-full text-left bg-white border-2 border-emerald-200 p-3 rounded-2xl text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-50 flex items-center justify-between"
                                >
                                    <span>🟢 "Operacija dizanja brodice je započeta."</span>
                                    <ChevronRight className="h-4 w-4 text-emerald-600" />
                                </button>
                                <button
                                    onClick={() => toast.info("Odaberite posao u listi za slanje poruke.")}
                                    className="w-full text-left bg-white border-2 border-indigo-200 p-3 rounded-2xl text-xs font-semibold text-indigo-900 shadow-2xs hover:bg-indigo-50 flex items-center justify-between"
                                >
                                    <span>🔵 "Plovilo je uspješno smješteno u zonu suhog veza."</span>
                                    <ChevronRight className="h-4 w-4 text-indigo-600" />
                                </button>
                                <button
                                    onClick={() => toast.info("Odaberite posao u listi za slanje poruke.")}
                                    className="w-full text-left bg-white border-2 border-amber-200 p-3 rounded-2xl text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-50 flex items-center justify-between"
                                >
                                    <span>🟡 "Molimo dođite do dizalice u lučici."</span>
                                    <ChevronRight className="h-4 w-4 text-amber-600" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "settings" && (
                    <div className="space-y-4">
                        <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-5 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 border-b pb-4">
                                <div className="h-12 w-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">
                                    {operatorUser.name ? operatorUser.name[0].toUpperCase() : "O"}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">{operatorUser.name || "Operater dizalice"}</h3>
                                    <p className="text-xs text-slate-500">{operatorUser.email}</p>
                                </div>
                            </div>

                            <div className="space-y-2 text-xs">
                                <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Dodijeljene dizalice</span>
                                {assignedCranes.length === 0 ? (
                                    <p className="text-slate-600 font-medium">Sve dizalice u lučici (Admin pristup)</p>
                                ) : (
                                    <div className="space-y-1">
                                        {assignedCranes.map(c => (
                                            <div key={c.id} className="bg-slate-50 p-2 rounded-xl border border-slate-200 font-semibold text-slate-700 flex items-center gap-2">
                                                <Anchor className="h-3.5 w-3.5 text-indigo-600" />
                                                <span>{c.name} ({c.type})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleLogout}
                                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 border border-rose-200 transition active:scale-95"
                            >
                                <LogOut className="h-4 w-4" />
                                <span>Odjava s uređaja</span>
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Dry Berth Zone Assignment Modal Dialog */}
            {assigningTask && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-5 w-full max-w-md space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-indigo-600" />
                                Dodjela Suhog Veza
                            </h3>
                            <button onClick={() => setAssigningTask(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
                        </div>

                        <div className="text-xs space-y-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                            <span className="font-bold text-indigo-950 block text-sm">
                                [{assigningTask.vessel?.registration || "Plovilo"}] {assigningTask.vessel?.name}
                            </span>
                            <span className="text-slate-600 block">Vlasnik: {assigningTask.owner?.name}</span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 block">Odaberite zonu na kopnu:</label>
                            <select
                                value={selectedZoneId}
                                onChange={(e) => setSelectedZoneId(e.target.value)}
                                className="w-full p-3 bg-slate-50 border-2 border-indigo-100 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                            >
                                <option value="">-- Odaberite zonu --</option>
                                {landZones.map(z => (
                                    <option key={z.id} value={z.id}>
                                        {z.code} ({z.name}) — Slobodno: {z.availableSpots}/{z.totalSpots}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 block">Napomena operatera (opcionalno):</label>
                            <input
                                type="text"
                                value={assignNote}
                                onChange={(e) => setAssignNote(e.target.value)}
                                placeholder="npr. Smješteno na stalažu #12"
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setAssigningTask(null)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
                            >
                                Odustani
                            </button>
                            <button
                                disabled={!selectedZoneId || isSubmittingAssign}
                                onClick={handleAssignLandZone}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md disabled:opacity-50"
                            >
                                {isSubmittingAssign ? "Spremanje..." : "Potvrdi smještaj"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat / Message Modal Dialog */}
            {messagingTask && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-5 w-full max-w-md space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-indigo-600" />
                                Pošalji obavijest korisniku
                            </h3>
                            <button onClick={() => setMessagingTask(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
                        </div>

                        <div className="text-xs space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <span className="font-bold text-slate-900 block">Korisnik: {messagingTask.owner?.name}</span>
                            <span className="text-slate-500 block">Plovilo: {messagingTask.vessel?.name} ({messagingTask.vessel?.registration})</span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 block">Sadržaj poruke / obavijesti:</label>
                            <textarea
                                rows={3}
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                placeholder="Napišite obavijest vlasniku plovila..."
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setMessagingTask(null)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
                            >
                                Odustani
                            </button>
                            <button
                                disabled={!messageText.trim() || isSendingMessage}
                                onClick={handleSendMessage}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                <Send className="h-3.5 w-3.5" />
                                <span>{isSendingMessage ? "Slanje..." : "Pošalji poruku"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar (3 Tabs: Poslovi, Notifikacije, Postavke) */}
            <nav className="fixed bottom-0 left-0 right-0 bg-indigo-950 text-white border-t border-indigo-900 shadow-2xl z-40">
                <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
                    <button
                        onClick={() => setActiveTab("tasks")}
                        className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
                            activeTab === "tasks" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <div className="relative">
                            <Calendar className="h-5 w-5" />
                            {totalCount > 0 && (
                                <span className="absolute -top-1.5 -right-2.5 bg-indigo-600 text-white text-[9px] font-black h-4 w-4 rounded-full flex items-center justify-center border border-indigo-950">
                                    {totalCount}
                                </span>
                            )}
                        </div>
                        <span className="text-[11px]">Poslovi</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("notifications")}
                        className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
                            activeTab === "notifications" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <MessageSquare className="h-5 w-5" />
                        <span className="text-[11px]">Notifikacije</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("settings")}
                        className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
                            activeTab === "settings" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <Settings className="h-5 w-5" />
                        <span className="text-[11px]">Postavke</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
