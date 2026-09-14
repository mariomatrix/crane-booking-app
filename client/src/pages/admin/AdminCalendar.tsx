import { useState, useMemo, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import type { EventDropArg, DatesSetArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CalendarSchedulePdf } from "@/components/ReportPdfTemplates";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Hammer, Loader2, Filter, Users, Anchor, ChevronLeft, ChevronRight, ListTodo, CheckCircle2, XCircle, Clock, Plus, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdminReservationForm } from "@/components/AdminReservationForm";
import { WorkOrderExecutionDialog } from "@/components/WorkOrderExecutionDialog";
import { addDays, addMonths, addWeeks, startOfDay, endOfDay, startOfWeek, endOfWeek, format, parseISO, setHours, setMinutes } from "date-fns";
import { hr, enUS } from "date-fns/locale";
import { formatAppDate, formatToSqlDate, toZagreb, fromZagreb } from "@/lib/date-utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { useSearch } from "wouter";
import { CalendarIcon } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

const STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",     // Amber (Žuta - Na čekanju)
    approved: "#059669",    // Emerald 600 (Zelena - Odobreno)
    in_progress: "#8b5cf6", // Violet 500 (Ljubičasta - U tijeku)
    completed: "#2563eb",   // Blue 600 (Plava - Izvršeno / Završeno)
    rejected: "#dc2626",    // Red 600 (Crvena - Odbijeno)
    cancelled: "#64748b",   // Slate 500 (Siva - Otkazano)
};

const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

const STATUS_LABELS: Record<string, string> = {
    pending: "Na čekanju",
    approved: "Odobreno",
    in_progress: "U tijeku",
    completed: "Završeno",
    rejected: "Odbijeno",
    cancelled: "Otkazano",
};

export default function AdminCalendar() {
    const { lang } = useLang();
    const searchString = useSearch();
    // State
    const [viewMode, setViewMode] = useState<'master' | 'timeGridWeek' | 'dayGridMonth'>('master');
    const [viewDate, setViewDate] = useState<Date>(startOfDay(new Date()));
    const [statusFilters, setStatusFilters] = useState<string[]>([]); // Default: prazno znači SVI statusi
    const [selectedUser, setSelectedUser] = useState<string>(() => {
        const params = new URLSearchParams(searchString);
        return params.get("userId") || "all";
    });
    const [selectedCrane, setSelectedCrane] = useState<string>("all");
    const [isMaintOpen, setIsMaintOpen] = useState(false);
    const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);

    // Refs
    const draggableRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<FullCalendar>(null);

    // Filters and Data with optimized caching
    const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false }, { staleTime: 300000 });
    const usersQuery = trpc.user.list.useQuery({ pageSize: 50 }, { staleTime: 300000 });
    const usersList = usersQuery.data?.data || [];
    const { data: holidays = [] } = trpc.holiday.list.useQuery(undefined, { staleTime: 300000 });
    const { data: seasonsList = [] } = trpc.season.list.useQuery(undefined, { staleTime: 300000 });
    const { data: sysSettings } = trpc.settings.get.useQuery(undefined, { staleTime: 300000 });
    const { data: landZones = [] } = trpc.landZone.list.useQuery(undefined, { staleTime: 300000 });

    const viewDateDayKey = useMemo(() => startOfDay(viewDate).getTime(), [viewDate]);
    const visibleRangeKey = useMemo(() => `${visibleRange?.start?.getTime() || 0}-${visibleRange?.end?.getTime() || 0}`, [visibleRange]);

    const fetchRange = useMemo(() => {
        if (viewMode === 'master') {
            const start = new Date(viewDateDayKey);
            return {
                start: startOfDay(start),
                end: endOfDay(addDays(start, Math.max(1, cranesList.length)))
            };
        }
        if (visibleRange) {
            return visibleRange;
        }
        const start = new Date(viewDateDayKey);
        return {
            start: startOfWeek(start, { weekStartsOn: 1 }),
            end: endOfWeek(addWeeks(start, 5), { weekStartsOn: 1 })
        };
    }, [viewMode, viewDateDayKey, visibleRangeKey, cranesList.length]);

    const reservationsQuery = trpc.reservation.listAll.useQuery({
        status: statusFilters.length > 0 ? statusFilters : undefined,
        userId: selectedUser !== "all" ? selectedUser : undefined,
        scheduledStart: fetchRange?.start,
        scheduledEnd: fetchRange?.end,
        pageSize: 500,
    }, {
        enabled: !!fetchRange,
        staleTime: 60000, // 60 seconds cache
        refetchOnWindowFocus: false,
    });
    const allReservations = reservationsQuery.data?.data || [];
    const isResLoading = reservationsQuery.isLoading;
    const landWaitingQuery = trpc.landWaiting.listAll.useQuery(undefined, { staleTime: 60000, refetchOnWindowFocus: false });
    const landWaitingList = (landWaitingQuery.data || []).filter((w: any) => w.status === "waiting" || w.status === "offered");
    const utils = trpc.useUtils();

    // ─── Real-Time Calendar Event Synchronizer (SSE with Debounce) ───────────
    useEffect(() => {
        let debounceTimer: any = null;
        const eventSource = new EventSource("/api/events/calendar-stream");

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "CALENDAR_UPDATED") {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        utils.reservation.listAll.invalidate();
                        utils.waitingList.listAll.invalidate();
                        utils.landWaiting.listAll.invalidate();
                    }, 500);

                    toast.info(`${data.actorName} ${data.actionText}`, {
                        description: "Kalendar je automatski osvježen.",
                        duration: 3000,
                    });
                }
            } catch (err) {
                console.error("[SSE] Error parsing calendar event:", err);
            }
        };

        eventSource.onerror = (err) => {
            console.warn("[SSE] EventSource connection issue:", err);
        };

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            eventSource.close();
        };
    }, [utils]);

    const gridWorkingHours = useMemo(() => {
        if (!viewDate) return { from: "07:00", to: "16:00" };
        const dateStr = formatToSqlDate(viewDate);
        const activeSeason = (seasonsList as any[]).find((s: any) =>
            s.isActive && s.startDate <= dateStr && s.endDate >= dateStr
        );
        if (!activeSeason?.workingHours || typeof activeSeason.workingHours !== "object") {
            return {
                from: sysSettings?.workdayStart ?? "07:00",
                to: sysSettings?.workdayEnd ?? "16:00",
            };
        }

        if (viewMode === 'timeGridWeek') {
            let minStart = 24 * 60;
            let maxEnd = 0;
            Object.values(activeSeason.workingHours as Record<string, { from?: string; to?: string }>).forEach(h => {
                if (h.from && h.to && h.from.trim() && h.to.trim()) {
                    const [fh, fm] = h.from.split(":").map(Number);
                    const [th, tm] = h.to.split(":").map(Number);
                    minStart = Math.min(minStart, fh * 60 + fm);
                    maxEnd = Math.max(maxEnd, th * 60 + tm);
                }
            });
            if (minStart < maxEnd) {
                const sH = Math.floor(minStart / 60);
                const sM = minStart % 60;
                const eH = Math.floor(maxEnd / 60);
                const eM = maxEnd % 60;
                return {
                    from: `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`,
                    to: `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`,
                };
            }
        }

        const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const dayKey = dayKeys[viewDate.getDay()];
        const dayHours = (activeSeason.workingHours as any)[dayKey];
        if (dayHours?.from && dayHours?.to) {
            return { from: dayHours.from, to: dayHours.to, seasonName: activeSeason.name };
        }
        return {
            from: sysSettings?.workdayStart ?? "07:00",
            to: sysSettings?.workdayEnd ?? "16:00",
        };
    }, [seasonsList, viewDate, viewMode, sysSettings]);

    const workStart = gridWorkingHours.from;
    const workEnd = gridWorkingHours.to;

    // Edit Reservation Form State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRes, setEditingRes] = useState<any>(null);
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editStart, setEditStart] = useState("");
    const [editEnd, setEditEnd] = useState("");
    const [editCraneId, setEditCraneId] = useState("");
    const [editLandZoneId, setEditLandZoneId] = useState("none");
    const [workOrderRes, setWorkOrderRes] = useState<any>(null);

    // Edit Reservation Season Working Hours
    const editSeasonWorkingHours = useMemo(() => {
        if (!editDate) return null;
        const dateStr = formatToSqlDate(editDate);
        const activeSeason = (seasonsList as any[]).find((s: any) =>
            s.isActive && s.startDate <= dateStr && s.endDate >= dateStr
        );
        if (activeSeason?.workingHours && typeof activeSeason.workingHours === "object") {
            const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
            const dayKey = dayKeys[editDate.getDay()];
            const dayHours = (activeSeason.workingHours as any)[dayKey];
            if (dayHours?.from && dayHours?.to) {
                return { from: dayHours.from, to: dayHours.to, seasonName: activeSeason.name };
            }
        }
        return null;
    }, [seasonsList, editDate]);

    const editAvailableSlots = useMemo(() => {
        const fromStr = editSeasonWorkingHours?.from || "07:00";
        const toStr = editSeasonWorkingHours?.to || "16:00";
        const [fH, fM] = fromStr.split(":").map(Number);
        const [tH, tM] = toStr.split(":").map(Number);
        const fromM = fH * 60 + fM;
        const toM = tH * 60 + tM;

        const startSlots: string[] = [];
        const endSlots: string[] = [];

        for (let m = fromM; m < toM; m += 30) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            startSlots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
        }
        for (let m = fromM + 30; m <= toM; m += 30) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            endSlots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
        }

        return { startSlots, endSlots };
    }, [editSeasonWorkingHours]);

    // Create Reservation Dialog State
    const [isCreateResOpen, setIsCreateResOpen] = useState(false);

    // Maintenance Form State
    const [maintCraneId, setMaintCraneId] = useState("");
    const [maintDateObj, setMaintDateObj] = useState<Date | undefined>(new Date());
    const [maintDate, setMaintDate] = useState(new Date().toISOString().split("T")[0]);
    const [maintStart, setMaintStart] = useState("08:00");
    const [maintEnd, setMaintEnd] = useState("09:00");
    const [maintDesc, setMaintDesc] = useState("");

    const updateLandZoneMutation = trpc.reservation.updateLandZone.useMutation();

    // Edit Waiting List Form State
    const [isWaitingEditOpen, setIsWaitingEditOpen] = useState(false);
    const [editingWaiting, setEditingWaiting] = useState<any>(null);
    const [waitEditPreferredZoneId, setWaitEditPreferredZoneId] = useState("none");
    const [waitEditNote, setWaitEditNote] = useState("");

    // Mutations
    const rescheduleMutation = trpc.reservation.reschedule.useMutation({
        onSuccess: () => {
            toast.success("Termin je premješten.");
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate();
        },
    });

    const maintenanceMutation = trpc.maintenance.create.useMutation({
        onSuccess: () => {
            toast.success("Održavanje je zabilježeno.");
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
            setIsMaintOpen(false);
            setMaintDesc("");
            setMaintDateObj(new Date());
            setMaintDate(new Date().toISOString().split("T")[0]);
        },
        onError: (err: any) => toast.error(err.message),
    });

    const updateStatusMutation = trpc.reservation.approve.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija je odobrena.");
            utils.reservation.listAll.invalidate();
            utils.landWaiting.listAll.invalidate();
            utils.calendar.events.invalidate();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const updateLandWaitingMutation = trpc.landWaiting.update.useMutation({
        onSuccess: () => {
            toast.success("Zahtjev na listi čekanja za suhi vez je ažuriran.");
            utils.landWaiting.listAll.invalidate();
            setIsWaitingEditOpen(false);
        },
        onError: (err: any) => toast.error(err.message),
    });

    const directAssignMutation = trpc.landWaiting.directAssign.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija je uspješno zakazana s liste čekanja.");
            utils.reservation.listAll.invalidate();
            utils.landWaiting.listAll.invalidate();
            utils.calendar.events.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate();
            utils.landWaiting.listAll.invalidate();
        },
    });

    const removeLandWaitingMutation = trpc.landWaiting.remove.useMutation({
        onSuccess: () => {
            toast.success("Zahtjev s liste čekanja za suhi vez je odbijen i uklonjen.");
            utils.landWaiting.listAll.invalidate();
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
            setIsWaitingEditOpen(false);
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleEditWaiting = (w: any) => {
        setEditingWaiting(w);
        setWaitEditPreferredZoneId(w.preferredZoneId || "none");
        setWaitEditNote(w.note || "");
        setIsWaitingEditOpen(true);
    };

    const handleUpdateWaiting = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingWaiting) return;
        updateLandWaitingMutation.mutate({
            id: editingWaiting.id,
            preferredZoneId: waitEditPreferredZoneId === "none" ? null : waitEditPreferredZoneId,
            note: waitEditNote,
        });
    };

    // Initialize Draggable
    useEffect(() => {
        if (!draggableRef.current) return;
        let draggable = new Draggable(draggableRef.current, {
            itemSelector: ".waiting-list-item",
            eventData: function (eventEl) {
                const data = JSON.parse(eventEl.getAttribute("data-event") || "{}");
                return {
                    title: data.title,
                    duration: { minutes: 30 },
                    extendedProps: {
                        isFromWaitingList: true,
                        waitingId: data.id,
                    }
                };
            }
        });
        return () => draggable.destroy();
    }, [landWaitingList]);

    const rejectMutation = trpc.reservation.reject.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija je odbijena.");
            utils.reservation.listAll.invalidate();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleCreateMaintenance = (e: React.FormEvent) => {
        e.preventDefault();
        const start = fromZagreb(maintDate, maintStart);
        const end = fromZagreb(maintDate, maintEnd);
        maintenanceMutation.mutate({
            craneId: maintCraneId,
            scheduledStart: start,
            scheduledEnd: end,
            description: maintDesc,
        });
    };

    const handleEventClick = (info: any) => {
        const p = info.event.extendedProps;
        if (p.isMaintenance || p.isHoliday) return;

        const res = allReservations.find((r: any) => r.id === p.reservationId);
        if (res) {
            setEditingRes(res);
            const rawStartDate = res.scheduledStart ? new Date(res.scheduledStart) : (res.requestedDate ? fromZagreb(res.requestedDate, "08:00") : new Date());
            const zgStart = toZagreb(rawStartDate);
            const zgEnd = res.scheduledEnd ? toZagreb(res.scheduledEnd) : null;
            setEditDate(rawStartDate);
            setEditStart(zgStart.timeStr);
            setEditEnd(zgEnd ? zgEnd.timeStr : toZagreb(new Date(rawStartDate.getTime() + (res.durationMin || 30) * 60000)).timeStr);
            setEditCraneId(String(res.craneId));
            setEditLandZoneId(res.landZoneId || "none");
            setIsEditOpen(true);
        }
    };

    const handleUpdateRes = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRes || !editDate) return;

        const dateStr = formatToSqlDate(editDate);
        const startDate = fromZagreb(dateStr, editStart);
        const endDate = fromZagreb(dateStr, editEnd);

        rescheduleMutation.mutate({
            id: editingRes.id,
            scheduledStart: startDate,
            scheduledEnd: endDate,
            craneId: editCraneId
        }, {
            onSuccess: () => {
                const finalZoneId = editLandZoneId === "none" ? null : editLandZoneId;
                if (finalZoneId !== (editingRes.landZoneId || null)) {
                    updateLandZoneMutation.mutate({
                        id: editingRes.id,
                        landZoneId: finalZoneId,
                    }, {
                        onSuccess: () => {
                            utils.reservation.listAll.invalidate();
                            setIsEditOpen(false);
                        }
                    });
                } else {
                    setIsEditOpen(false);
                }
            }
        });
    };

    // --- Master View Logic: Resource-as-Day Hack ---
    // We map each crane to a "day" index.
    const activeCranes = useMemo(() =>
        cranesList.filter(c => selectedCrane === "all" || String(c.id) === selectedCrane),
        [cranesList, selectedCrane]
    );

    const calendarEvents = useMemo(() => {
        const resEvents = allReservations.map((r: any) => {
            const rawDate = r.scheduledStart ? new Date(r.scheduledStart) : (r.requestedDate ? fromZagreb(r.requestedDate, "08:00") : null);
            if (!rawDate || isNaN(rawDate.getTime())) return null;

            const craneIdx = activeCranes.findIndex(c => String(c.id).toLowerCase() === String(r.craneId || "").toLowerCase());
            const zgStart = toZagreb(rawDate);

            if (viewMode === 'master') {
                const eventDateStr = zgStart.dateStr;
                const viewDateStr = formatToSqlDate(viewDate);
                if (eventDateStr !== viewDateStr) {
                    return null;
                }

                const actualCraneIdx = craneIdx >= 0 ? craneIdx : 0;
                const rawEnd = r.scheduledEnd ? new Date(r.scheduledEnd) : new Date(rawDate.getTime() + (r.durationMin || 30) * 60000);
                const zgEnd = toZagreb(rawEnd);

                const start = addDays(viewDate, actualCraneIdx);
                start.setHours(zgStart.hours, zgStart.minutes, 0, 0);

                const end = addDays(viewDate, actualCraneIdx);
                end.setHours(zgEnd.hours, zgEnd.minutes, 0, 0);

                const isLocked = r.isMaintenance || r.status === 'completed' || r.status === 'cancelled' || r.status === 'rejected';

                return {
                    id: String(r.id),
                    title: r.isMaintenance
                        ? (lang === 'hr' ? "ODRŽAVANJE" : "MAINTENANCE")
                        : `${craneIdx === -1 ? "⚠️ " : ""}${r.vesselRegistration || r.vessel?.registration || "Plovilo"}${r.landZone ? ` (${r.landZone.code || r.landZone.name})` : ""}${r.vesselWeightTons ? ` - ${r.vesselWeightTons} t` : ""}`,
                    start,
                    end,
                    backgroundColor: r.isMaintenance ? "#f97316" : (STATUS_COLORS[r.status] ?? "#6b7280"),
                    borderColor: "transparent",
                    editable: !isLocked,
                    startEditable: !isLocked,
                    durationEditable: !isLocked,
                    extendedProps: {
                        reservationId: r.id,
                        status: r.status,
                        isMaintenance: r.isMaintenance,
                        user: r.user?.name || r.user?.email || "Nepoznat",
                        craneId: r.craneId,
                        originalStart: r.scheduledStart,
                        cancelReason: r.cancelReason,
                        vesselRegistration: r.vesselRegistration || r.vessel?.registration || "",
                        landZoneCode: r.landZone?.code || r.landZone?.name || "",
                        durationMin: r.durationMin || 30,
                        operationCategory: r.serviceType?.operationCategory || "",
                        serviceTypeName: r.serviceType?.name || "",
                        adminNote: r.adminNote || "",
                    },
                };
            } else {
                if (selectedCrane !== "all" && String(r.craneId).toLowerCase() !== String(selectedCrane).toLowerCase()) {
                    return null;
                }

                const start = rawDate;
                const end = r.scheduledEnd ? new Date(r.scheduledEnd) : new Date(rawDate.getTime() + (r.durationMin || 30) * 60000);

                const isLocked = r.isMaintenance || r.status === 'completed' || r.status === 'cancelled' || r.status === 'rejected';

                return {
                    id: String(r.id),
                    title: r.isMaintenance
                        ? (lang === 'hr' ? "ODRŽAVANJE" : "MAINTENANCE")
                        : `${r.vesselRegistration || r.vessel?.registration || "Plovilo"}${r.landZone ? ` (${r.landZone.code || r.landZone.name})` : ""}`,
                    start,
                    end,
                    backgroundColor: r.isMaintenance ? "#f97316" : (STATUS_COLORS[r.status] ?? "#6b7280"),
                    borderColor: "transparent",
                    editable: !isLocked,
                    startEditable: !isLocked,
                    durationEditable: !isLocked,
                    extendedProps: {
                        reservationId: r.id,
                        status: r.status,
                        isMaintenance: r.isMaintenance,
                        user: r.user?.name || r.user?.email || "Nepoznat",
                        craneId: r.craneId,
                        originalStart: r.scheduledStart,
                        cancelReason: r.cancelReason,
                        vesselRegistration: r.vesselRegistration || r.vessel?.registration || "",
                        landZoneCode: r.landZone?.code || r.landZone?.name || "",
                        durationMin: r.durationMin || 30,
                        operationCategory: r.serviceType?.operationCategory || "",
                        serviceTypeName: r.serviceType?.name || "",
                        adminNote: r.adminNote || "",
                    },
                };
            }
        }).filter(Boolean);

        const holidayEvents = holidays.map((h: any) => {
            if (viewMode === 'master') {
                const holidayDate = startOfDay(new Date(h.date));
                const currentViewStart = startOfDay(viewDate);
                if (holidayDate.getTime() !== currentViewStart.getTime()) {
                    return [];
                }

                // In master view, holidays apply to all columns (cranes)
                return activeCranes.map((_, idx) => ({
                    id: `holiday-${h.id}-${idx}`,
                    title: h.name,
                    start: addDays(viewDate, idx),
                    allDay: true,
                    display: 'background',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                }));
            }
            return [{
                id: `holiday-${h.id}`,
                title: h.name,
                start: h.date,
                allDay: true,
                display: 'background',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
            }];
        }).flat();

        return [...resEvents, ...holidayEvents];
    }, [allReservations, activeCranes, viewDate, lang, viewMode, holidays]);

    const pdfCranes = useMemo(() => {
        if (selectedCrane === "all") return cranesList;
        return cranesList.filter((c: any) => String(c.id) === String(selectedCrane));
    }, [cranesList, selectedCrane]);

    const pdfReservations = useMemo(() => {
        let res = allReservations;
        if (selectedCrane !== "all") {
            res = res.filter((r: any) => String(r.craneId) === String(selectedCrane));
        }
        return res;
    }, [allReservations, selectedCrane]);

    const handleEventDrop = (info: EventDropArg) => {
        if (info.event.extendedProps.isMaintenance) {
            info.revert();
            return;
        }

        const status = info.event.extendedProps.status;
        if (status === 'completed') {
            info.revert();
            toast.warning(lang === 'hr' ? 'Završena rezervacija je zaključena i ne može se premještati.' : 'Completed reservation is locked and cannot be moved.');
            return;
        }
        if (status === 'cancelled' || status === 'rejected') {
            info.revert();
            toast.warning(lang === 'hr' ? 'Otkazana ili odbijena rezervacija se ne može premještati.' : 'Cancelled or rejected reservation cannot be moved.');
            return;
        }

        const id = String(info.event.extendedProps.reservationId || info.event.id);

        if (viewMode !== 'master') {
            const origStart = info.oldEvent.start!;
            const origEnd = info.oldEvent.end || new Date(origStart.getTime() + (info.event.extendedProps?.durationMin || 30) * 60000);
            const durationMs = origEnd.getTime() - origStart.getTime();

            let newStart = info.event.start!;
            if (viewMode === 'dayGridMonth') {
                const dateStr = formatToSqlDate(info.event.start!);
                const zgOrig = toZagreb(origStart);
                newStart = fromZagreb(dateStr, zgOrig.timeStr);
            }
            const newEnd = new Date(newStart.getTime() + durationMs);

            rescheduleMutation.mutate({
                id,
                scheduledStart: newStart,
                scheduledEnd: newEnd,
                craneId: info.event.extendedProps.craneId
            }, {
                onError: (err: any) => {
                    info.revert();
                    toast.error(err.message);
                }
            });
            return;
        }

        const newOffsetDate = info.event.start!;
        const diffDays = Math.floor((newOffsetDate.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));

        if (diffDays < 0 || diffDays >= activeCranes.length) {
            info.revert();
            return;
        }

        const newTargetCrane = activeCranes[diffDays];
        const dateStr = formatToSqlDate(viewDate);
        const timeStr = `${String(newOffsetDate.getHours()).padStart(2, "0")}:${String(newOffsetDate.getMinutes()).padStart(2, "0")}`;
        const newStart = fromZagreb(dateStr, timeStr);

        const origStart = info.oldEvent.start!;
        const origEnd = info.oldEvent.end || new Date(origStart.getTime() + (info.event.extendedProps?.durationMin || 30) * 60000);
        const durationMs = origEnd.getTime() - origStart.getTime();
        const newEnd = new Date(newStart.getTime() + durationMs);

        rescheduleMutation.mutate({
            id,
            scheduledStart: newStart,
            scheduledEnd: newEnd,
            craneId: newTargetCrane.id
        }, {
            onError: (err: any) => {
                info.revert();
                toast.error(err.message);
            }
        });
    };

    const handleEventResize = (info: any) => {
        if (info.event.extendedProps.isMaintenance) {
            info.revert();
            return;
        }

        const status = info.event.extendedProps.status;
        if (status === 'completed') {
            info.revert();
            toast.warning(lang === 'hr' ? 'Završena rezervacija je zaključena i ne može se mijenjati.' : 'Completed reservation is locked and cannot be changed.');
            return;
        }
        if (status === 'cancelled' || status === 'rejected') {
            info.revert();
            toast.warning(lang === 'hr' ? 'Otkazana ili odbijena rezervacija se ne može mijenjati.' : 'Cancelled or rejected reservation cannot be changed.');
            return;
        }
        const id = String(info.event.extendedProps.reservationId || info.event.id);
        let newStart = info.event.start!;
        let newEnd = info.event.end!;
        let craneId = info.event.extendedProps.craneId;

        if (viewMode === 'master') {
            const diffDays = Math.floor((newStart.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
            if (diffDays < 0 || diffDays >= activeCranes.length) {
                info.revert();
                return;
            }
            craneId = activeCranes[diffDays].id;
            const dateStr = formatToSqlDate(viewDate);
            const timeStr = `${String(newStart.getHours()).padStart(2, "0")}:${String(newStart.getMinutes()).padStart(2, "0")}`;
            const realStart = fromZagreb(dateStr, timeStr);

            const durationMs = newEnd.getTime() - newStart.getTime();
            newStart = realStart;
            newEnd = new Date(realStart.getTime() + durationMs);
        }

        rescheduleMutation.mutate({
            id,
            scheduledStart: newStart,
            scheduledEnd: newEnd,
            craneId
        }, {
            onError: (err: any) => {
                info.revert();
                toast.error(err.message);
            }
        });
    };

    const toggleStatus = (status: string) => {
        setStatusFilters(prev =>
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };

    const handleDatesSet = (arg: DatesSetArg) => {
        if (viewMode !== 'master') {
            setVisibleRange({
                start: arg.start,
                end: arg.end
            });
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4 pb-8">
            {/* Header & Main Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Administratorski Kalendar</h1>
                    <p className="text-muted-foreground">Upravljanje svim dizalicama i terminima.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-muted p-1 rounded-md mr-2">
                        <Button
                            variant={viewMode === 'master' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('master')}
                            className="h-8 text-xs"
                        >
                            Dnevi (Master)
                        </Button>
                        <Button
                            variant={viewMode === 'timeGridWeek' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('timeGridWeek')}
                            className="h-8 text-xs"
                        >
                            Tjedni
                        </Button>
                        <Button
                            variant={viewMode === 'dayGridMonth' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('dayGridMonth')}
                            className="h-8 text-xs"
                        >
                            Mjesečni
                        </Button>
                    </div>
                    <Button onClick={() => setIsCreateResOpen(true)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                        <Plus className="h-4 w-4" />
                        <span>Nova rezervacija</span>
                    </Button>
                    <Dialog open={isCreateResOpen} onOpenChange={setIsCreateResOpen}>
                        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden p-6 sm:p-8">
                            <DialogHeader>
                                <DialogTitle>Nova rezervacija</DialogTitle>
                                <DialogDescription>
                                    Kreirajte novu rezervaciju za postojećeg ili novog korisnika.
                                </DialogDescription>
                            </DialogHeader>
                            <AdminReservationForm
                                onSuccess={() => {
                                    setIsCreateResOpen(false);
                                    utils.reservation.listAll.invalidate();
                                    utils.calendar.events.invalidate();
                                }}
                                onCancel={() => setIsCreateResOpen(false)}
                            />
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isMaintOpen} onOpenChange={setIsMaintOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <Hammer className="h-4 w-4" />
                                <span className="hidden sm:inline">Zabilježi održavanje</span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <form onSubmit={handleCreateMaintenance}>
                                <DialogHeader>
                                    <DialogTitle>Zabilježi održavanje / Blokada</DialogTitle>
                                    <DialogDescription>Odredite vrijeme kada dizalica neće biti dostupna korisnicima.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Dizalica</Label>
                                        <Select value={maintCraneId} onValueChange={setMaintCraneId} required>
                                            <SelectTrigger><SelectValue placeholder="Odaberi dizalicu" /></SelectTrigger>
                                            <SelectContent>
                                                {cranesList.map((c: any) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Datum</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !maintDateObj && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {maintDateObj ? formatAppDate(maintDateObj, lang as any) : <span>Odaberi datum</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={maintDateObj}
                                                    onSelect={(d) => {
                                                        if (d) {
                                                            setMaintDateObj(d);
                                                            setMaintDate(formatToSqlDate(d));
                                                        }
                                                    }}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Početak</Label>
                                            <Select value={maintStart} onValueChange={setMaintStart} required>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {Array.from({ length: 24 }).map((_, i) => {
                                                        const val = `${String(i).padStart(2, '0')}:00`;
                                                        return <SelectItem key={val} value={val}>{val}</SelectItem>;
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Kraj</Label>
                                            <Select value={maintEnd} onValueChange={setMaintEnd} required>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {Array.from({ length: 24 }).map((_, i) => {
                                                        const val = `${String(i).padStart(2, '0')}:00`;
                                                        return <SelectItem key={val} value={val}>{val}</SelectItem>;
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Opis (opcionalno)</Label>
                                        <Input value={maintDesc} onChange={(e) => setMaintDesc(e.target.value)} placeholder="Zabilješka o radovima..." />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={maintenanceMutation.isPending}>
                                        {maintenanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Spremi blokadu
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                        <DialogContent className="max-w-md overflow-hidden p-0">
                            <form onSubmit={handleUpdateRes}>
                                <div
                                    className="px-6 py-4 text-white"
                                    style={{ backgroundColor: editingRes ? (STATUS_COLORS[editingRes.status] ?? '#6b7280') : '#6b7280' }}
                                >
                                    <DialogHeader className="text-white">
                                        <DialogTitle className="text-white flex items-center gap-2">
                                            Uredi rezervaciju
                                            <span className="inline-block text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-white/25 leading-none">
                                                {editingRes ? (STATUS_LABELS[editingRes.status] || editingRes.status) : ''}
                                            </span>
                                        </DialogTitle>
                                        <DialogDescription className="text-white/80">
                                            {editingRes?.reservationNumber || `#${editingRes?.id?.slice(0, 8)}`} — {editingRes?.vesselRegistration} ({editingRes?.user?.name})
                                        </DialogDescription>
                                    </DialogHeader>
                                </div>
                                <div className="px-6 pb-6">
                                    <div className="grid gap-5 py-6">
                                        <div className="grid gap-2">
                                            <Label>Datum</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full justify-start text-left font-normal",
                                                            !editDate && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {editDate ? formatAppDate(editDate, lang as any) : <span>Odaberi datum</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={editDate}
                                                        onSelect={setEditDate}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>Vrijeme početka</Label>
                                                <Select value={editStart} onValueChange={setEditStart}>
                                                    <SelectTrigger><SelectValue placeholder="Odaberi" /></SelectTrigger>
                                                    <SelectContent className="max-h-52">
                                                        {editAvailableSlots.startSlots.map((val) => (
                                                            <SelectItem key={val} value={val}>{val}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Vrijeme završetka</Label>
                                                <Select value={editEnd} onValueChange={setEditEnd}>
                                                    <SelectTrigger><SelectValue placeholder="Odaberi" /></SelectTrigger>
                                                    <SelectContent className="max-h-52">
                                                        {editAvailableSlots.endSlots.map((val) => (
                                                            <SelectItem key={val} value={val}>{val}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        {editSeasonWorkingHours && (
                                            <p className="text-[11px] text-primary/80 font-medium flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded border border-primary/10">
                                                🕒 Radno vrijeme sezone ({editSeasonWorkingHours.seasonName}): {editSeasonWorkingHours.from} — {editSeasonWorkingHours.to}h
                                            </p>
                                        )}
                                        <div className="grid gap-2">
                                            <Label>Dizalica</Label>
                                            <Select value={editCraneId} onValueChange={setEditCraneId} required>
                                                <SelectTrigger><SelectValue placeholder="Odaberi dizalicu" /></SelectTrigger>
                                                <SelectContent>
                                                    {cranesList.map((c: any) => (
                                                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Kopnena zona (Mjesto na kopnu)</Label>
                                            <Select value={editLandZoneId} onValueChange={setEditLandZoneId}>
                                                <SelectTrigger><SelectValue placeholder="Odaberi zonu (opcionalno)" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Nije odabrano</SelectItem>
                                                    {landZones.map((lz: any) => (
                                                        <SelectItem key={lz.id} value={String(lz.id)}>{lz.name} ({lz.code})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <DialogFooter className="px-6 pb-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div>
                                            {editingRes && (editingRes.status === "approved" || editingRes.status === "in_progress") && (
                                                <Button
                                                    type="button"
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 w-full sm:w-auto"
                                                    onClick={() => {
                                                        const target = editingRes;
                                                        setIsEditOpen(false);
                                                        setWorkOrderRes(target);
                                                    }}
                                                >
                                                    <ClipboardList className="h-4 w-4" />
                                                    Radni nalog
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex gap-2 justify-end w-full sm:w-auto">
                                            <Button variant="outline" type="button" onClick={() => setIsEditOpen(false)}>Odustani</Button>
                                            <Button type="submit" disabled={rescheduleMutation.isPending}>
                                                {rescheduleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Spremi promjene
                                            </Button>
                                        </div>
                                    </DialogFooter>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isWaitingEditOpen} onOpenChange={setIsWaitingEditOpen}>
                        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden p-6 sm:p-8">
                            <DialogHeader>
                                <DialogTitle>Definiranje suhog veza i termina dizalice za zahtjev</DialogTitle>
                                <DialogDescription>
                                    Korisnik: {editingWaiting?.user?.name || "Nepoznat"} — Plovilo: {editingWaiting?.vessel?.registration || editingWaiting?.vessel?.name || "Plovilo"}
                                </DialogDescription>
                            </DialogHeader>
                            {editingWaiting && (
                                <AdminReservationForm
                                    initialData={{
                                        landWaitingId: editingWaiting.id,
                                        userId: editingWaiting.userId,
                                        userObj: editingWaiting.user,
                                        contactPhone: editingWaiting.user?.phone || "",
                                        vesselId: editingWaiting.vesselId,
                                        landZoneId: editingWaiting.preferredZoneId || "none",
                                        requestedDate: viewDate || new Date(),
                                        scheduledTime: "08:00",
                                        durationMin: "30",
                                        adminNote: editingWaiting.note || "",
                                    }}
                                    onSuccess={() => {
                                        setIsWaitingEditOpen(false);
                                        utils.landWaiting.listAll.invalidate();
                                        utils.reservation.listAll.invalidate();
                                        utils.calendar.events.invalidate();
                                    }}
                                    onCancel={() => setIsWaitingEditOpen(false)}
                                    onRejectWaitlist={() => {
                                        removeLandWaitingMutation.mutate({ id: editingWaiting.id });
                                    }}
                                    isRejectPending={removeLandWaitingMutation.isPending}
                                    submitButtonText="Spremi i potvrdi rezervaciju"
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                    <PDFDownloadLink
                        key={`${viewDate.toISOString()}-${selectedCrane}-${pdfReservations.length}-${pdfReservations.map(r => r.id + '-' + r.status).join(',')}`}
                        document={
                            <CalendarSchedulePdf
                                date={viewDate}
                                cranes={pdfCranes}
                                reservations={pdfReservations}
                                workStart={workStart}
                                workEnd={workEnd}
                                marinaName={sysSettings?.marinaName || "PŠD Špinut"}
                                marinaLogo={sysSettings?.marinaLogo || undefined}
                            />
                        }
                        fileName={`Plan_rada_dizalica_${format(viewDate, "yyyy-MM-dd")}.pdf`}
                    >
                        {({ loading }: { loading: boolean }) => (
                            <Button variant="secondary" disabled={loading} className="gap-2">
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Printer className="h-4 w-4" />
                                )}
                                <span className="hidden sm:inline">Ispiši plan</span>
                            </Button>
                        )}
                    </PDFDownloadLink>
                </div>
            </div>

            {/* Filters Bar */}
            <Card className="bg-muted/30 border-none shadow-none">
                <CardContent className="p-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground mr-1" />
                        <span className="text-sm font-medium">Statusi:</span>
                        <div className="flex bg-background border rounded-md p-1 items-center gap-1">
                            <Button
                                variant={statusFilters.length === 0 ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setStatusFilters([])}
                                className="h-7 text-xs px-2.5 rounded-sm font-semibold"
                            >
                                Svi
                            </Button>
                            {["pending", "approved", "in_progress", "completed", "rejected", "cancelled"].map(s => (
                                <Button
                                    key={s}
                                    variant={statusFilters.includes(s) ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => toggleStatus(s)}
                                    className="h-7 text-xs px-2.5 rounded-sm"
                                >
                                    <div
                                        className="h-2 w-2 rounded-full mr-1.5"
                                        style={{ backgroundColor: STATUS_COLORS[s] }}
                                    />
                                    {STATUS_LABELS[s] || s}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <UserSearchCombobox
                        users={usersList as any}
                        value={selectedUser}
                        onChange={setSelectedUser}
                    />

                    <div className="flex items-center gap-2">
                        <Anchor className="h-4 w-4 text-muted-foreground mr-1" />
                        <Select value={selectedCrane} onValueChange={setSelectedCrane}>
                            <SelectTrigger className="w-[180px] h-9 bg-background"><SelectValue placeholder="Dizalica" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Sve dizalice</SelectItem>
                                {cranesList.map((c: any) => (
                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="ml-auto flex items-center bg-background border rounded-md p-1 overflow-hidden shadow-sm">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            const newDate = viewMode === 'master' ? addDays(viewDate, -1) :
                                           viewMode === 'timeGridWeek' ? addWeeks(viewDate, -1) :
                                           addMonths(viewDate, -1);
                            setViewDate(newDate);
                            calendarRef.current?.getApi().gotoDate(newDate);
                        }}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="px-3 text-sm font-semibold tabular-nums min-w-[140px] text-center">
                            {viewMode === 'master' ? formatAppDate(viewDate, lang as any) : format(viewDate, "MMMM yyyy", { locale: lang === 'hr' ? hr : enUS })}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            const newDate = viewMode === 'master' ? addDays(viewDate, 1) :
                                           viewMode === 'timeGridWeek' ? addWeeks(viewDate, 1) :
                                           addMonths(viewDate, 1);
                            setViewDate(newDate);
                            calendarRef.current?.getApi().gotoDate(newDate);
                        }}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-semibold ml-1 border-l rounded-none" onClick={() => {
                            const today = startOfDay(new Date());
                            setViewDate(today);
                            calendarRef.current?.getApi().gotoDate(today);
                        }}>
                            Danas
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Calendar Container */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 bg-background border rounded-xl p-4 shadow-sm h-[700px] relative">
                    {isResLoading && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-xl">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    )}
                    <style dangerouslySetInnerHTML={{ __html: `
                        .fc-theme-standard td, .fc-theme-standard th { border-color: var(--border) !important; }
                        .fc-timegrid-slot { height: 40px !important; }
                        .fc-timegrid-axis-cushion, .fc-timegrid-slot-label-cushion { font-size: 11px; color: var(--muted-foreground); }
                        .fc-col-header-cell { background-color: var(--muted); padding: 8px 0; font-size: 12px; font-weight: 600; }
                        .fc-event { cursor: pointer; transition: transform 0.1s ease; }
                        .fc-event:hover { transform: scale(1.01); z-index: 5; }
                        .fc-timegrid-event { border-radius: 4px; border: none !important; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .fc-v-event .fc-event-main { padding: 4px; }
                    `}} />
                    <FullCalendar
                        key={`${viewMode}-${selectedCrane}-${activeCranes.length}-${workStart}-${workEnd}`}
                        ref={calendarRef}
                        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                        initialView={viewMode === 'master' ? 'timeGrid' : viewMode}
                        initialDate={viewDate}
                        visibleRange={viewMode === 'master' ? {
                            start: viewDate,
                            end: addDays(viewDate, Math.max(1, activeCranes.length))
                        } : undefined}
                        headerToolbar={false}
                        allDaySlot={viewMode !== 'master'}
                        slotMinTime={workStart + ":00"}
                        slotMaxTime={workEnd + ":00"}
                        slotDuration="00:30:00"
                        slotLabelInterval="00:30:00"
                        snapDuration="00:30:00"
                        slotLabelFormat={{
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }}
                        scrollTime={workStart + ":00"}
                        height="100%"
                        editable={true}
                        droppable={true}
                        eventReceive={async (info: any) => {
                            const p = info.event.extendedProps;
                            if (p.isFromWaitingList) {
                                // Calculate crane and time
                                const dropDate = info.event.start!;

                                let targetCrane = activeCranes[0] || cranesList[0];
                                let startDate = dropDate;

                                if (viewMode === 'master') {
                                    const diffDays = Math.round((dropDate.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
                                    if (diffDays < 0 || diffDays >= activeCranes.length) {
                                        info.revert();
                                        return;
                                    }
                                    targetCrane = activeCranes[diffDays];
                                    const dateStr = formatToSqlDate(viewDate);
                                    const timeStr = `${String(dropDate.getHours()).padStart(2, "0")}:${String(dropDate.getMinutes()).padStart(2, "0")}`;
                                    startDate = fromZagreb(dateStr, timeStr);
                                } else if (selectedCrane !== "all") {
                                    const found = cranesList.find((c: any) => String(c.id) === String(selectedCrane));
                                    if (found) targetCrane = found;
                                }

                                info.revert(); // Remove the temp DOM element

                                directAssignMutation.mutate({
                                    id: String(p.waitingId),
                                    scheduledStart: startDate,
                                    durationMin: 30,
                                    craneId: targetCrane.id
                                });
                            }
                        }}
                        eventDrop={handleEventDrop}
                        eventResize={handleEventResize}
                        eventClick={handleEventClick}
                        datesSet={handleDatesSet}
                        events={calendarEvents as any}
                        dayHeaderContent={(arg: any) => {
                            if (viewMode === 'master') {
                                const diff = Math.round((arg.date.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
                                const crane = activeCranes[diff];
                                return crane ? (
                                    <div className="flex flex-col items-center py-1">
                                        <span className="text-xs font-bold">{crane.name}</span>
                                        <span className="text-[10px] opacity-60 font-normal normal-case">
                                            {format(viewDate, "eee dd.MM.", { locale: lang === 'hr' ? hr : enUS })}
                                        </span>
                                    </div>
                                ) : "";
                            }

                            // Weekly view - show day name and date
                            if (viewMode === 'timeGridWeek') {
                                return (
                                    <div className="flex flex-col items-center py-1">
                                        <span className="text-xs font-bold uppercase">{format(arg.date, "eee", { locale: lang === 'hr' ? hr : enUS })}</span>
                                        <span className="text-[10px] opacity-60 font-normal">{format(arg.date, "dd.MM.", { locale: lang === 'hr' ? hr : enUS })}</span>
                                    </div>
                                );
                            }

                            return undefined;
                        }}
                        eventContent={(arg: any) => {
                            const p = arg.event.extendedProps;
                            if (p.isHoliday) {
                                return <div className="text-[10px] font-bold p-1 text-red-700/50">{arg.event.title}</div>
                            }
                            const statusColor = STATUS_COLORS[p.status] ?? '#6b7280';

                            // Format registration and dry berth zone direction
                            const reg = p.vesselRegistration || "";
                            let zoneDirection = "";
                            if (p.landZoneCode) {
                                if (p.operationCategory === "lift_from_sea") {
                                    zoneDirection = `➡️ ${p.landZoneCode}`;
                                } else if (p.operationCategory === "lower_to_sea") {
                                    zoneDirection = `⬅️ ${p.landZoneCode}`;
                                } else {
                                    zoneDirection = `${p.landZoneCode}`;
                                }
                            }
                            const details = [reg, zoneDirection].filter(Boolean).join(" • ");

                            return (
                                <div
                                    className="flex flex-col h-full overflow-hidden p-1 rounded-sm text-white leading-tight"
                                    style={{ backgroundColor: statusColor }}
                                >
                                    <div className="flex items-center justify-between font-bold text-[10px] truncate">
                                        <span className="truncate">{p.user}</span>
                                        {p.status === 'pending' && <Clock className="h-3 w-3 animate-pulse shrink-0 ml-0.5" />}
                                        {p.status === 'completed' && <CheckCircle2 className="h-3 w-3 shrink-0 ml-0.5 text-white/95" />}
                                    </div>
                                    {p.serviceTypeName && (
                                        <div className="text-[9px] font-semibold opacity-95 truncate">
                                            {p.serviceTypeName}
                                        </div>
                                    )}
                                    {details && (
                                        <div className="text-[9px] font-medium opacity-90 truncate">
                                            {details}
                                        </div>
                                    )}
                                    {p.adminNote && (
                                        <div className="text-[9px] italic opacity-85 truncate">
                                            📝 {p.adminNote}
                                        </div>
                                    )}
                                    {p.status === 'cancelled' && p.cancelReason && (
                                        <div className="text-[9px] italic opacity-90 truncate mt-0.5 border-t border-white/20 pt-0.5">
                                            {p.cancelReason}
                                        </div>
                                    )}
                                    {!p.isMaintenance && p.status === 'pending' && (
                                        <div className="mt-auto flex gap-1 pt-1 border-t border-white/20">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); window.location.href = `/admin/reservations?status=pending`; }}
                                                className="hover:bg-white/20 rounded p-0.5"
                                                title="Odobri u Rezervacijama"
                                            >
                                                <CheckCircle2 className="h-3 w-3 text-green-300" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); rejectMutation.mutate({ id: p.reservationId, adminNote: "Preko kalendara" }); }}
                                                className="hover:bg-red-600/50 rounded p-0.5"
                                                title="Odbij"
                                            >
                                                <XCircle className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )}
                                    {!p.isMaintenance && (p.status === 'approved' || p.status === 'in_progress') && (
                                        <div className="mt-auto flex gap-1 pt-1 border-t border-white/20">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const res = allReservations.find((r: any) => r.id === p.reservationId);
                                                    if (res) setWorkOrderRes(res);
                                                }}
                                                className="hover:bg-white/25 rounded px-1 py-0.5 flex items-center gap-1 text-[9px] font-semibold text-white bg-black/20"
                                                title="Otvori radni nalog"
                                            >
                                                <ClipboardList className="h-3 w-3 text-emerald-200" />
                                                <span>Radni nalog</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                        dayMaxEvents={true}
                        locale={lang === "hr" ? "hr" : "en"}
                    />
                </div>

                {/* Sidebar: Waiting List & Info */}
                <div className="space-y-4 h-[700px] flex flex-col">
                    <Card className="flex-1 flex flex-col overflow-hidden">
                        <CardHeader className="py-4 px-5 border-b bg-muted/20">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <ListTodo className="h-4 w-4 text-blue-500" />
                                    Lista čekanja za suhi vez
                                </CardTitle>
                                <Badge variant="outline" className="bg-background">{landWaitingList.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-hidden">
                            <ScrollArea className="h-full">
                                <div className="p-4 space-y-3" ref={draggableRef}>
                                    {landWaitingList.length === 0 ? (
                                        <div className="text-center py-8 text-sm text-muted-foreground italic">
                                            Nema aktivnih zahtjeva na listi čekanja za suhi vez.
                                        </div>
                                    ) : (
                                        landWaitingList.map((w: any) => (
                                            <div
                                                key={w.id}
                                                className="waiting-list-item p-3 border rounded-lg bg-background hover:border-primary/50 transition-colors shadow-sm group cursor-grab active:cursor-grabbing"
                                                data-event={JSON.stringify({
                                                    id: w.id,
                                                    title: `${w.user?.name || "Korisnik"} (${w.vessel?.registration || w.vessel?.name || "Plovilo"})`,
                                                })}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                                        {w.preferredZone?.name ? `Zona: ${w.preferredZone.name}` : "Bilo koja zona"}
                                                    </span>
                                                    <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                        #{w.position || 1}
                                                    </span>
                                                </div>
                                                <div className="font-semibold text-sm mb-1">{w.user?.name || "Korisnik"}</div>
                                                <div className="text-xs text-muted-foreground flex items-center justify-between mb-3">
                                                    <span>{w.vessel?.registration || w.vessel?.name || "—"}</span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        30 min
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleEditWaiting(w); }}
                                                    >
                                                        Uredi zahtjev
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="py-4 px-5 border-b bg-muted/20">
                            <CardTitle className="text-sm font-bold">Legenda</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2">
                            {Object.entries(STATUS_COLORS).map(([s, color]) => (
                                <div key={s} className="flex items-center gap-2 text-xs">
                                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                                    <span>{STATUS_LABELS[s] || s}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 text-xs mt-2 border-t pt-2">
                                <div className="h-3 w-3 rounded-full bg-[#f97316]" />
                                <span>Blokada / Održavanje</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Work Order Execution Dialog */}
            {workOrderRes && (
                <WorkOrderExecutionDialog
                    open={!!workOrderRes}
                    onOpenChange={(open) => !open && setWorkOrderRes(null)}
                    reservationId={workOrderRes.id}
                    craneId={workOrderRes.craneId || workOrderRes.crane?.id || ""}
                    craneName={workOrderRes.crane?.name || workOrderRes.craneName}
                    userName={workOrderRes.user?.name || (workOrderRes.user?.firstName ? `${workOrderRes.user.firstName} ${workOrderRes.user.lastName || ''}`.trim() : null) || workOrderRes.userName}
                    userOib={workOrderRes.user?.oib || workOrderRes.userOib}
                    isMember={workOrderRes.user ? (!workOrderRes.user.isLegalEntity && workOrderRes.user.role === "user") : !workOrderRes.isLegalEntity}
                    vesselName={workOrderRes.vesselName || workOrderRes.vessel?.name}
                    vesselLengthM={workOrderRes.vesselLengthM || workOrderRes.vessel?.lengthM}
                    onSuccess={() => {
                        utils.reservation.listAll.invalidate();
                        utils.calendar.events.invalidate();
                    }}
                />
            )}
        </div>
    );
}
