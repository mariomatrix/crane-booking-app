import { useState, useEffect, useMemo, useRef } from "react";
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
    ChevronLeft,
    ChevronRight,
    Send,
    User,
    Ship,
    Loader2,
    RefreshCw
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
    status: "approved" | "pending" | "in_progress" | "completed" | "cancelled";
    scheduledStart: string;
    scheduledEnd: string;
    durationMin: number;
    requestedDate?: string | null;
    requestedTimeSlot?: string | null;
    workOrderId?: string | null;
    workOrderNumber?: string | null;
    workOrderStatus?: string | null;
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
        email?: string | null;
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
        zoneId?: string;
        zoneCode: string;
        zoneName: string;
        spotNumber?: number | null;
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

interface ResourceItem {
    id: string;
    name: string;
    code: string;
    unit: string;
    pricePerUnitEur: string;
    description?: string | null;
}

interface ChatMessage {
    id: string;
    reservationId: string;
    senderId: string;
    senderName: string | null;
    senderRole: string;
    body: string;
    isRead: boolean;
    createdAt: string;
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

    // Available Resources for Operations
    const [availableResources, setAvailableResources] = useState<ResourceItem[]>([]);

    // Finish / Complete Work Order Modal State
    const [finishingTask, setFinishingTask] = useState<TaskItem | null>(null);
    const [finishDurationMin, setFinishDurationMin] = useState<number>(30);
    const [finishNotes, setFinishNotes] = useState<string>("");
    const [selectedResources, setSelectedResources] = useState<Record<string, number>>({});
    const [finishZoneId, setFinishZoneId] = useState<string>("");
    const [finishSpotNumber, setFinishSpotNumber] = useState<string>("");
    const [isSubmittingFinish, setIsSubmittingFinish] = useState(false);

    // Land Zones state for Dry Berth Assignment dialog
    const [landZones, setLandZones] = useState<LandZone[]>([]);
    const [assigningTask, setAssigningTask] = useState<TaskItem | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string>("");
    const [spotNumberInput, setSpotNumberInput] = useState<string>("");
    const [assignNote, setAssignNote] = useState("");
    const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

    // Chat / Message Dialog State
    const [messagingTask, setMessagingTask] = useState<TaskItem | null>(null);
    const [taskMessages, setTaskMessages] = useState<ChatMessage[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [messageText, setMessageText] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const chatScrollRef = useRef<HTMLDivElement>(null);

    // Load Profile when token exists
    useEffect(() => {
        if (!token) return;
        fetchProfile();
    }, [token]);

    // Load tasks and resources when authenticated and date changes
    useEffect(() => {
        if (!token) return;
        fetchSchedule();
        fetchLandZones();
        fetchResources();
    }, [token, selectedDate]);

    // Fetch chat history when messaging task is selected
    useEffect(() => {
        if (!token || !messagingTask) return;
        fetchTaskMessages(messagingTask.id);
    }, [token, messagingTask]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [taskMessages.length]);

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

    const fetchResources = async () => {
        try {
            const res = await fetch("/api/mobile/v1/resources", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableResources(data || []);
            }
        } catch (e) {
            console.error("Failed to fetch resources", e);
        }
    };

    const fetchTaskMessages = async (reservationId: string) => {
        setIsLoadingMessages(true);
        try {
            const res = await fetch(`/api/mobile/v1/messages/${reservationId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTaskMessages(data.messages || []);
            }
        } catch (e) {
            console.error("Failed to load messages", e);
        } finally {
            setIsLoadingMessages(false);
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
            const url = newStatus === "in_progress"
                ? `/api/mobile/v1/reservations/${taskId}/start-work`
                : newStatus === "completed"
                ? `/api/mobile/v1/reservations/${taskId}/complete-work`
                : `/api/mobile/v1/reservations/${taskId}/status`;

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Status posla: ${newStatus === "in_progress" ? "Započeto (U tijeku)" : "Uspješno završeno"}`);
                fetchSchedule();
            } else {
                toast.error(data.error || "Greška pri promjeni statusa");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        }
    };

    const handleOpenFinishModal = (task: TaskItem) => {
        setFinishingTask(task);
        setFinishDurationMin(task.durationMin || 30);
        setFinishNotes("");
        setSelectedResources({});
        setFinishZoneId(task.dryBerthPlacement?.zoneId || "");
        setFinishSpotNumber(task.dryBerthPlacement?.spotNumber ? String(task.dryBerthPlacement.spotNumber) : "");
    };

    const handleCompleteWorkOrder = async () => {
        if (!finishingTask) return;
        setIsSubmittingFinish(true);
        try {
            const resourcesPayload = Object.entries(selectedResources)
                .filter(([_, qty]) => qty > 0)
                .map(([resId, qty]) => ({ resourceId: resId, quantity: qty }));

            const res = await fetch(`/api/mobile/v1/reservations/${finishingTask.id}/complete-work`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    durationMin: finishDurationMin,
                    operatorNotes: finishNotes.trim(),
                    zoneId: finishZoneId || undefined,
                    spotNumber: finishSpotNumber ? Number(finishSpotNumber) : undefined,
                    resources: resourcesPayload,
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Operacija uspješno završena! Kalendar je ažuriran (plavo).");
                setFinishingTask(null);
                fetchSchedule();
                fetchLandZones();
            } else {
                toast.error(data.error || "Greška pri završetku operacije");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        } finally {
            setIsSubmittingFinish(false);
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
                    reservationId: assigningTask.id,
                    zoneId: selectedZoneId,
                    spotNumber: spotNumberInput ? Number(spotNumberInput) : undefined,
                    notes: assignNote.trim()
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Mjesto na kopnu uspješno dodijeljeno!");
                setAssigningTask(null);
                setAssignNote("");
                setSpotNumberInput("");
                fetchSchedule();
                fetchLandZones();
            } else {
                toast.error(data.error || "Greška pri dodjeli zone");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        } finally {
            setIsSubmittingAssign(false);
        }
    };

    const handleSendMessage = async (textToSend?: string) => {
        const bodyText = textToSend || messageText;
        if (!messagingTask?.id || !bodyText.trim()) return;
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
                    content: bodyText.trim()
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Poruka i obavijest poslane vlasniku!");
                setMessageText("");
                fetchTaskMessages(messagingTask.id);
            } else {
                toast.error(data.error || "Greška pri slanju poruke");
            }
        } catch (e) {
            toast.error("Mrežna greška");
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handlePrevDay = () => {
        const parts = selectedDate.split("-").map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        setSelectedDate(`${y}-${m}-${day}`);
    };

    const handleNextDay = () => {
        const parts = selectedDate.split("-").map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        setSelectedDate(`${y}-${m}-${day}`);
    };

    const handleToday = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        setSelectedDate(`${y}-${m}-${day}`);
    };

    const todayStr = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }, []);

    const isToday = selectedDate === todayStr;

    const formattedDateLabel = useMemo(() => {
        const parts = selectedDate.split("-").map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        const dayName = d.toLocaleDateString("hr-HR", { weekday: "short" }).toUpperCase();
        const dateFormatted = d.toLocaleDateString("hr-HR", { day: "numeric", month: "numeric", year: "numeric" });
        if (isToday) return `DANAS (${dateFormatted})`;
        return `${dayName} • ${dateFormatted}`;
    }, [selectedDate, isToday]);

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
    const inProgressCount = filteredTasks.filter(t => t.status === "in_progress").length;
    const completedCount = filteredTasks.filter(t => t.status === "completed").length;

    // PIN Pad Login View
    if (!token || !operatorUser) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 max-w-md mx-auto">
                <div className="text-center pt-8 space-y-2">
                    <div className="inline-flex items-center justify-center p-4 bg-indigo-600/20 text-indigo-400 rounded-3xl mb-2 border border-indigo-500/30">
                        <Anchor className="h-10 w-10" />
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white">Operater Dizalica</h1>
                    <p className="text-xs text-slate-400">Lučica Spinut • Mobilni pristup</p>
                </div>

                <div className="space-y-6">
                    <div className="flex justify-center gap-4 my-2">
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                className={`w-4 h-4 rounded-full border-2 transition-all ${
                                    pin.length > i
                                        ? "bg-indigo-500 border-indigo-500 scale-110 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                                        : "border-slate-700 bg-slate-900"
                                }`}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button
                                key={num}
                                disabled={isLoggingIn}
                                onClick={() => {
                                    if (pin.length < 4) {
                                        const newPin = pin + num;
                                        setPin(newPin);
                                        if (newPin.length === 4) handlePinSubmit(newPin);
                                    }
                                }}
                                className="h-16 rounded-2xl bg-slate-900 hover:bg-indigo-600/20 active:bg-indigo-600 active:text-white border border-slate-800 text-2xl font-bold transition flex items-center justify-center shadow-md active:scale-95"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            disabled={isLoggingIn}
                            onClick={() => setPin("")}
                            className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-xs font-bold text-slate-400 transition flex items-center justify-center border border-slate-800/50 active:scale-95"
                        >
                            PONIŠTI
                        </button>
                        <button
                            disabled={isLoggingIn}
                            onClick={() => {
                                if (pin.length < 4) {
                                    const newPin = pin + "0";
                                    setPin(newPin);
                                    if (newPin.length === 4) handlePinSubmit(newPin);
                                }
                            }}
                            className="h-16 rounded-2xl bg-slate-900 hover:bg-indigo-600/20 active:bg-indigo-600 active:text-white border border-slate-800 text-2xl font-bold transition flex items-center justify-center shadow-md active:scale-95"
                        >
                            0
                        </button>
                        <button
                            disabled={isLoggingIn}
                            onClick={() => setPin(pin.slice(0, -1))}
                            className="h-16 rounded-2xl bg-slate-900/50 hover:bg-slate-800 text-xs font-bold text-slate-400 transition flex items-center justify-center border border-slate-800/50 active:scale-95"
                        >
                            ←
                        </button>
                    </div>
                </div>

                <div className="text-center pb-4 text-[11px] text-slate-500">
                    Prijavite se 4-znamenkastim operaterskim PIN-om
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 pb-24 max-w-lg mx-auto select-none font-sans">
            {/* Top Fixed Header */}
            <header className="bg-indigo-950 text-white p-4 sticky top-0 z-30 shadow-xl border-b border-indigo-900">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-500/40">
                            <Anchor className="h-5 w-5 text-indigo-300" />
                        </div>
                        <div>
                            <h1 className="text-base font-black tracking-tight leading-none text-white">
                                {operatorUser.name || "Operater dizalice"}
                            </h1>
                            <p className="text-[11px] text-indigo-300 font-medium mt-0.5">
                                {assignedCranes.length > 0
                                    ? assignedCranes.map(c => c.name).join(", ")
                                    : "Sve dizalice"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchSchedule}
                            className="p-2 bg-indigo-900/70 hover:bg-indigo-800 rounded-xl border border-indigo-700/50 transition active:scale-95"
                            title="Osvježi podatke"
                        >
                            <RefreshCw className={`h-4 w-4 text-indigo-200 ${isLoadingTasks ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="p-2 bg-indigo-900/70 hover:bg-indigo-800 rounded-xl border border-indigo-700/50 transition active:scale-95"
                            title="Odjava"
                        >
                            <LogOut className="h-4 w-4 text-indigo-200" />
                        </button>
                    </div>
                </div>

                {/* Day Selection Bar & Filter Bar */}
                {activeTab === "tasks" && (
                    <div className="mt-3 pt-3 border-t border-indigo-900/60 space-y-2.5">
                        {/* Day Navigation Row: - Dan | [Date Picker / Label] | Danas | + Dan */}
                        <div className="flex items-center justify-between gap-1.5 bg-indigo-900/40 p-1.5 rounded-2xl border border-indigo-800/60">
                            <button
                                onClick={handlePrevDay}
                                className="px-2.5 py-1.5 bg-indigo-900/90 hover:bg-indigo-800 text-indigo-100 font-bold rounded-xl border border-indigo-700/60 active:scale-95 transition flex items-center gap-1 text-[11px] shadow-xs shrink-0"
                                title="Prethodni dan"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                <span>- Dan</span>
                            </button>

                            <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="bg-indigo-950/90 text-white font-black px-2 py-1 rounded-xl border border-indigo-700 text-xs focus:outline-none cursor-pointer max-w-[125px] text-center"
                                />
                                <button
                                    onClick={handleToday}
                                    className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition shadow-xs shrink-0 ${
                                        isToday
                                            ? "bg-indigo-600 text-white border-indigo-400"
                                            : "bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400 font-black"
                                    }`}
                                    title="Povratak na današnji dan"
                                >
                                    Danas
                                </button>
                            </div>

                            <button
                                onClick={handleNextDay}
                                className="px-2.5 py-1.5 bg-indigo-900/90 hover:bg-indigo-800 text-indigo-100 font-bold rounded-xl border border-indigo-700/60 active:scale-95 transition flex items-center gap-1 text-[11px] shadow-xs shrink-0"
                                title="Sljedeći dan"
                            >
                                <span>+ Dan</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* Date label & Counters */}
                        <div className="flex items-center justify-between px-1 text-xs">
                            <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wide">
                                📅 {formattedDateLabel}
                            </span>
                            <div className="flex gap-1.5 text-[11px] font-extrabold">
                                <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-lg border border-amber-500/30">
                                    ▶ {inProgressCount}
                                </span>
                                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                                    ✓ {completedCount}
                                </span>
                            </div>
                        </div>

                        {/* Search & Crane Filter */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-indigo-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Pretraži plovilo, registraciju ili člana..."
                                    className="w-full bg-indigo-900/60 text-white placeholder-indigo-400/60 text-xs pl-8 pr-3 py-1.5 rounded-xl border border-indigo-700/40 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="p-4 space-y-4">
                {activeTab === "tasks" && (
                    <>
                        {/* Task List */}
                        <div className="space-y-3">
                            {isLoadingTasks ? (
                                <div className="flex flex-col items-center justify-center p-12 space-y-2 text-slate-400">
                                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                                    <span className="text-xs font-semibold">Učitavanje rasporeda...</span>
                                </div>
                            ) : filteredTasks.length === 0 ? (
                                <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center space-y-2">
                                    <Calendar className="h-8 w-8 text-slate-400 mx-auto" />
                                    <h3 className="font-bold text-sm text-slate-700">Nema zakazanih operacija</h3>
                                    <p className="text-xs text-slate-400">Za odabrani datum nema unesenih rezervacija dizalica.</p>
                                </div>
                            ) : (
                                filteredTasks.map(t => {
                                    let timeStr = "—";
                                    if (t.scheduledStart) {
                                        try {
                                            timeStr = new Date(t.scheduledStart).toLocaleTimeString("hr-HR", {
                                                timeZone: "Europe/Zagreb",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            });
                                        } catch {
                                            timeStr = new Date(t.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        }
                                    } else if (t.requestedTimeSlot) {
                                        timeStr = t.requestedTimeSlot;
                                    } else {
                                        timeStr = "Termin na čekanju";
                                    }

                                    return (
                                        <div
                                            key={t.id}
                                            className={`bg-white rounded-3xl p-4 shadow-sm border-2 transition-all space-y-3 ${
                                                t.status === "in_progress"
                                                    ? "border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/10"
                                                    : t.status === "completed"
                                                    ? "border-slate-200 opacity-80"
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
                                                    t.status === "in_progress" ? "bg-amber-100 text-amber-800 animate-pulse border border-amber-300" :
                                                    t.status === "completed" ? "bg-slate-100 text-slate-700" :
                                                    t.status === "pending" ? "bg-sky-100 text-sky-800 border border-sky-300" :
                                                    "bg-emerald-100 text-emerald-800"
                                                }`}>
                                                    {t.status === "in_progress" ? "▶ U tijeku" : t.status === "completed" ? "✓ Završeno" : t.status === "pending" ? "⏳ Na čekanju" : "Odobreno"}
                                                </span>
                                            </div>

                                            {/* Vessel Dimensions & Contact */}
                                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Dimenzije plovila</span>
                                                    <span className="font-semibold text-slate-700">
                                                        {t.vessel?.lengthM ? `${Number(t.vessel.lengthM).toFixed(1)}m` : "?"} × {t.vessel?.beamM ? `${Number(t.vessel.beamM).toFixed(1)}m` : "?"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Vlasnik plovila</span>
                                                    <span className="font-semibold text-slate-700">{t.owner?.name || "Nije naveden"}</span>
                                                </div>
                                            </div>

                                            {/* Dry Berth / Land Placement Box */}
                                            <div className="flex items-center justify-between text-xs bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
                                                    <span className="font-semibold text-indigo-950">
                                                        Mjesto na kopnu:{" "}
                                                        {t.dryBerthPlacement ? (
                                                            <strong className="text-indigo-700 font-bold">
                                                                {t.dryBerthPlacement.zoneCode} ({t.dryBerthPlacement.zoneName})
                                                                {t.dryBerthPlacement.spotNumber ? ` • Mjesto ${t.dryBerthPlacement.spotNumber}` : ""}
                                                            </strong>
                                                        ) : (
                                                            <span className="text-amber-700 font-medium italic">Nije dodijeljena zona</span>
                                                        )}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setAssigningTask(t);
                                                        setSelectedZoneId(t.dryBerthPlacement?.zoneId || "");
                                                        setSpotNumberInput(t.dryBerthPlacement?.spotNumber ? String(t.dryBerthPlacement.spotNumber) : "");
                                                        setAssignNote("");
                                                    }}
                                                    className="text-[11px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs hover:bg-indigo-50"
                                                >
                                                    {t.dryBerthPlacement ? "Izmjeni" : "+ Dodijeli"}
                                                </button>
                                            </div>

                                            {/* Action Buttons Row */}
                                            <div className="flex items-center gap-2 pt-1">
                                                {t.owner?.phone && (
                                                    <a
                                                        href={`tel:${t.owner.phone}`}
                                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <Phone className="h-3.5 w-3.5" />
                                                        <span>Pozovi</span>
                                                    </a>
                                                )}
                                                {t.status === "pending" && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(t.id, "in_progress")}
                                                        className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <Play className="h-3.5 w-3.5 fill-current" />
                                                        <span>Započni</span>
                                                    </button>
                                                )}
                                                {t.status === "approved" && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(t.id, "in_progress")}
                                                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <Play className="h-3.5 w-3.5 fill-current" />
                                                        <span>Započni</span>
                                                    </button>
                                                )}
                                                {t.status === "in_progress" && (
                                                    <button
                                                        onClick={() => handleOpenFinishModal(t)}
                                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        <span>Završi</span>
                                                    </button>
                                                )}
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
                                Poruke i Obavijesti korisnicima
                            </h2>
                            <p className="text-xs text-slate-500">
                                Slanje izravnih obavijesti i dopisivanje s vlasnicima plovila u realnom vremenu (putem aplikacije, emaila i SMS-a).
                            </p>
                        </div>

                        {/* Active Conversations from Schedule */}
                        <div className="space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Odaberite korisnika za razgovor</span>
                            {tasks.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Nema aktivnih rezervacija na rasporedu.</p>
                            ) : (
                                tasks.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setMessagingTask(t)}
                                        className="w-full text-left bg-white border-2 border-indigo-100 hover:border-indigo-300 p-3 rounded-2xl text-xs font-semibold text-slate-900 shadow-2xs flex items-center justify-between transition"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                                                {t.owner?.name ? t.owner.name[0].toUpperCase() : "U"}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900">{t.owner?.name || "Član"}</div>
                                                <div className="text-[10px] text-slate-500 font-normal">
                                                    [{t.vessel?.registration || "Plovilo"}] • {t.serviceType?.name || "Operacija"}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-indigo-400" />
                                    </button>
                                ))
                            )}
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

            {/* Complete Work Order & Resources Modal Dialog */}
            {finishingTask && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-3">
                    <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-4 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b pb-2">
                            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                                Završi Operaciju & Zaključi Nalog
                            </h3>
                            <button onClick={() => setFinishingTask(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
                        </div>

                        {/* Vessel & Owner Info */}
                        <div className="text-xs space-y-0.5 bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
                            <span className="font-bold text-indigo-950 block text-sm">
                                [{finishingTask.vessel?.registration || "Plovilo"}] {finishingTask.vessel?.name}
                            </span>
                            <span className="text-indigo-700 block">Vlasnik: {finishingTask.owner?.name || "—"}</span>
                            <span className="text-slate-500 block">Usluga: {finishingTask.serviceType?.name || "Dizalica"}</span>
                        </div>

                        {/* Duration in Minutes */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 block">Stvarno trajanje operacije (minuta):</label>
                            <div className="flex gap-2">
                                {[15, 30, 45, 60].map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setFinishDurationMin(m)}
                                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${
                                            finishDurationMin === m
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                        }`}
                                    >
                                        {m} min
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Dry berth zone if lift operation */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                                Zona suhog veza (za vađenje plovila):
                            </label>
                            <select
                                value={finishZoneId}
                                onChange={(e) => setFinishZoneId(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                            >
                                <option value="">— Nije na suhom vezu (direktni povrat/ostalo) —</option>
                                {landZones.map(z => (
                                    <option key={z.id} value={z.id}>
                                        {z.name} ({z.code}) — {z.availableSpots} slobodno
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Additional Resources (Dodatni resursi) */}
                        <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <span className="text-xs font-bold text-slate-800 block flex items-center justify-between">
                                <span>Dodatni resursi lučice (opcionalno):</span>
                                <span className="text-[10px] text-slate-500 font-normal">Default: bez resursa</span>
                            </span>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                {availableResources.length === 0 ? (
                                    <div className="text-[11px] text-slate-400 italic">Nema definiranih resursa</div>
                                ) : (
                                    availableResources.map(res => {
                                        const qty = selectedResources[res.id] || 0;
                                        return (
                                            <div
                                                key={res.id}
                                                className={`flex items-center justify-between p-2 rounded-lg border text-xs transition ${
                                                    qty > 0 ? "bg-indigo-50 border-indigo-300 font-semibold" : "bg-white border-slate-200"
                                                }`}
                                            >
                                                <div>
                                                    <div className="text-slate-900 font-bold">{res.name}</div>
                                                    <div className="text-[10px] text-slate-500">
                                                        {Number(res.pricePerUnitEur).toFixed(2)} € / {res.unit}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedResources(prev => ({
                                                                ...prev,
                                                                [res.id]: Math.max(0, (prev[res.id] || 0) - 1)
                                                            }));
                                                        }}
                                                        className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-300 active:scale-95"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-5 text-center font-bold text-xs">{qty}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedResources(prev => ({
                                                                ...prev,
                                                                [res.id]: (prev[res.id] || 0) + 1
                                                            }));
                                                        }}
                                                        className="w-6 h-6 rounded-md bg-indigo-600 text-white font-bold flex items-center justify-center hover:bg-indigo-700 active:scale-95"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 block">Napomena operatera:</label>
                            <input
                                type="text"
                                value={finishNotes}
                                onChange={(e) => setFinishNotes(e.target.value)}
                                placeholder="Npr. trup očišćen, postolje stabilno..."
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setFinishingTask(null)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
                            >
                                Odustani
                            </button>
                            <button
                                disabled={isSubmittingFinish}
                                onClick={handleCompleteWorkOrder}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {isSubmittingFinish ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                <span>Potvrdi i Završi</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dry Berth Zone Assignment Modal Dialog */}
            {assigningTask && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-5 w-full max-w-md space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-indigo-600" />
                                Dodjela Mjesta na Kopnu
                            </h3>
                            <button onClick={() => setAssigningTask(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
                        </div>

                        <div className="text-xs space-y-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                            <span className="font-bold text-indigo-950 block text-sm">
                                [{assigningTask.vessel?.registration || "Plovilo"}] {assigningTask.vessel?.name}
                            </span>
                            <span className="text-indigo-700 block">Vlasnik: {assigningTask.owner?.name || "—"}</span>
                        </div>

                        {/* Zone selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700 block">Odaberite zonu kopna:</label>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                                {landZones.map(z => (
                                    <button
                                        key={z.id}
                                        type="button"
                                        onClick={() => setSelectedZoneId(z.id)}
                                        className={`p-2.5 rounded-xl border text-left text-xs transition ${
                                            selectedZoneId === z.id
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-950 font-bold ring-2 ring-indigo-500/20"
                                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                        }`}
                                    >
                                        <div className="font-bold">{z.name} ({z.code})</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                            {z.occupiedSpots}/{z.totalSpots} zauzeto ({z.availableSpots} slobodno)
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Spot number input */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 block">Broj mjesta u zoni (opcionalno):</label>
                            <input
                                type="number"
                                value={spotNumberInput}
                                onChange={(e) => setSpotNumberInput(e.target.value)}
                                placeholder="Npr. 12"
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 block">Napomena (opcionalno):</label>
                            <input
                                type="text"
                                value={assignNote}
                                onChange={(e) => setAssignNote(e.target.value)}
                                placeholder="Npr. uz ogradu, potpornji osigurani..."
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
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

            {/* Chat / Message Modal Dialog with Full Conversation History */}
            {messagingTask && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-3">
                    <div className="bg-white border-4 border-indigo-100 rounded-[2rem] p-4 w-full max-w-md flex flex-col max-h-[85vh] shadow-2xl animate-in slide-in-from-bottom duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <MessageSquare className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-900 leading-tight">
                                        {messagingTask.owner?.name || "Korisnik"}
                                    </h3>
                                    <p className="text-[10px] text-slate-500">
                                        [{messagingTask.vessel?.registration || "Plovilo"}] • Rezervacija {messagingTask.reservationNumber}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setMessagingTask(null)} className="text-slate-400 hover:text-slate-600 font-bold text-base px-2">✕</button>
                        </div>

                        {/* Chat Messages History */}
                        <div
                            ref={chatScrollRef}
                            className="flex-1 overflow-y-auto p-2 space-y-2.5 my-2 min-h-[160px] max-h-[280px] bg-slate-50/70 rounded-2xl border border-slate-100"
                        >
                            {isLoadingMessages ? (
                                <div className="flex justify-center p-6">
                                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                                </div>
                            ) : taskMessages.length === 0 ? (
                                <div className="text-center py-6 text-xs text-slate-400 italic">
                                    Nema prethodnih poruka. Pošaljite obavijest vlasniku.
                                </div>
                            ) : (
                                taskMessages.map(msg => {
                                    const isOperator = msg.senderRole === "operator" || msg.senderRole === "admin";
                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex flex-col ${isOperator ? "items-end" : "items-start"}`}
                                        >
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                                                    isOperator
                                                        ? "bg-indigo-600 text-white rounded-br-xs"
                                                        : "bg-white border border-slate-200 text-slate-900 rounded-bl-xs shadow-2xs"
                                                }`}
                                            >
                                                {!isOperator && (
                                                    <span className="text-[10px] font-bold text-indigo-600 block mb-0.5">
                                                        {msg.senderName || "Korisnik"}
                                                    </span>
                                                )}
                                                <p className="whitespace-pre-wrap">{msg.body}</p>
                                            </div>
                                            <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Quick Presets */}
                        <div className="flex gap-1 overflow-x-auto pb-1 mb-1 text-[10px]">
                            <button
                                type="button"
                                onClick={() => setMessageText("Operacija dizanja brodice je započeta.")}
                                className="whitespace-nowrap bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-lg font-semibold hover:bg-emerald-100"
                            >
                                🟢 Započeto
                            </button>
                            <button
                                type="button"
                                onClick={() => setMessageText("Plovilo je uspješno smješteno u zonu suhog veza.")}
                                className="whitespace-nowrap bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-1 rounded-lg font-semibold hover:bg-indigo-100"
                            >
                                🔵 Smješteno
                            </button>
                            <button
                                type="button"
                                onClick={() => setMessageText("Molimo dođite do dizalice u lučici.")}
                                className="whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg font-semibold hover:bg-amber-100"
                            >
                                🟡 Dođite do dizalice
                            </button>
                        </div>

                        {/* Message Input & Send */}
                        <div className="flex items-center gap-2 pt-1">
                            <input
                                type="text"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Napišite poruku vlasniku..."
                                className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-400"
                            />
                            <button
                                disabled={!messageText.trim() || isSendingMessage}
                                onClick={() => handleSendMessage()}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2.5 rounded-xl text-xs shadow-md disabled:opacity-40 flex items-center justify-center active:scale-95 transition"
                            >
                                {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-indigo-950 text-white border-t border-indigo-900 shadow-2xl z-40">
                <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-2">
                    <button
                        onClick={() => setActiveTab("tasks")}
                        className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
                            activeTab === "tasks" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <Calendar className="h-5 w-5" />
                        <span className="text-[11px]">Poslovi</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("notifications")}
                        className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
                            activeTab === "notifications" ? "text-indigo-400 font-bold" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <MessageSquare className="h-5 w-5" />
                        <span className="text-[11px]">Poruke</span>
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
