import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
    Loader2, Play, CheckCircle2, ShieldCheck, AlertCircle,
    FileText, Anchor, Clock, MapPin, PackagePlus, Plus, Minus, Info,
    Printer, Download, Check
} from "lucide-react";
import { format } from "date-fns";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { WorkOrderPdf } from "@/components/WorkOrderPdfTemplate";

interface WorkOrderExecutionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reservationId: string;
    craneId: string;
    craneName?: string;
    userName?: string;
    userOib?: string;
    isMember?: boolean;
    vesselName?: string;
    vesselLengthM?: string | number;
    onSuccess?: () => void;
}

export function WorkOrderExecutionDialog({
    open,
    onOpenChange,
    reservationId,
    craneId,
    craneName,
    userName,
    userOib,
    isMember = true,
    vesselName,
    vesselLengthM,
    onSuccess,
}: WorkOrderExecutionDialogProps) {
    const [startDate, setStartDate] = useState<string>("");
    const [startTime, setStartTime] = useState<string>("");
    const [durationMin, setDurationMin] = useState<number>(30);
    const [selectedZoneId, setSelectedZoneId] = useState<string>("none");
    const [operatorNotes, setOperatorNotes] = useState<string>("");
    const [selectedResources, setSelectedResources] = useState<Record<string, number>>({});
    const [showResourcePicker, setShowResourcePicker] = useState<boolean>(false);
    const [showPdf, setShowPdf] = useState<boolean>(false);

    const utils = trpc.useUtils();

    // Query work order (active or completed) for this reservation
    const { data: existingOrder, isLoading: isLoadingOrder, refetch: refetchOrder } = trpc.workOrders.getByReservation.useQuery(
        { reservationId },
        { enabled: open && !!reservationId }
    );

    const activeOrder = existingOrder?.status === "in_progress" ? existingOrder : null;
    const isCompleted = existingOrder?.status === "completed";
    const isInProgress = existingOrder?.status === "in_progress";

    // Mutation for updating notes on a completed or active work order
    const updateNotesMutation = trpc.workOrders.updateNotes.useMutation({
        onSuccess: () => {
            toast.success("Napomena operatera je uspješno ažurirana!");
            refetchOrder();
            utils.reservation.listDailyOperations.invalidate();
            utils.workOrders.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri spremanju napomene."),
    });

    // Query reservation details
    const { data: resDetails, isLoading: isLoadingRes } = trpc.reservation.getById.useQuery(
        { id: reservationId },
        { enabled: open && !!reservationId }
    );

    // Query land zones for dry berth placement
    const { data: landZones = [] } = trpc.landZone.list.useQuery(
        undefined,
        { enabled: open }
    );

    // Query active resources for pricelist extras
    const { data: availableResources = [] } = trpc.resources.list.useQuery(
        { activeOnly: true },
        { enabled: open }
    );

    // Initialize state when existingOrder changes
    useEffect(() => {
        if (existingOrder) {
            if (existingOrder.operatorNotes !== undefined && existingOrder.operatorNotes !== null) {
                setOperatorNotes(existingOrder.operatorNotes);
            }
            if (existingOrder.actualDurationMin) {
                setDurationMin(Number(existingOrder.actualDurationMin));
            }
            if ((resDetails as any)?.landZoneId) {
                setSelectedZoneId((resDetails as any).landZoneId);
            } else if ((resDetails as any)?.landZone?.id) {
                setSelectedZoneId((resDetails as any).landZone.id);
            }
            if (existingOrder.startedAt) {
                const d = new Date(existingOrder.startedAt);
                if (!isNaN(d.getTime())) {
                    setStartDate(format(d, "yyyy-MM-dd"));
                    setStartTime(format(d, "HH:mm"));
                }
            }
            if (existingOrder.resources && Array.isArray(existingOrder.resources)) {
                const resMap: Record<string, number> = {};
                for (const r of existingOrder.resources) {
                    if (r.resourceId) {
                        resMap[r.resourceId] = Number(r.quantity) || 1;
                    }
                }
                setSelectedResources(resMap);
            }
        }
    }, [existingOrder]);

    // Initialize state when resDetails changes (fallback if no order yet)
    useEffect(() => {
        if (resDetails && !existingOrder) {
            const sched = (resDetails as any).scheduledStart || (resDetails as any).scheduledDate || (resDetails as any).requestedDate;
            if (sched) {
                const d = new Date(sched);
                if (!isNaN(d.getTime())) {
                    setStartDate(format(d, "yyyy-MM-dd"));
                    setStartTime(format(d, "HH:mm"));
                }
            } else {
                setStartDate(format(new Date(), "yyyy-MM-dd"));
                setStartTime("08:00");
            }

            if ((resDetails as any).durationMin) {
                setDurationMin(Number((resDetails as any).durationMin));
            }

            if ((resDetails as any).landZoneId) {
                setSelectedZoneId((resDetails as any).landZoneId);
            } else if ((resDetails as any).landZone?.id) {
                setSelectedZoneId((resDetails as any).landZone.id);
            }

            // If reservation has pre-selected resources
            if ((resDetails as any).selectedResources && Array.isArray((resDetails as any).selectedResources)) {
                const resMap: Record<string, number> = {};
                for (const r of (resDetails as any).selectedResources) {
                    if (r.resourceId) {
                        resMap[r.resourceId] = Number(r.quantity) || 1;
                    }
                }
                setSelectedResources(resMap);
            }
        }
    }, [resDetails, existingOrder]);

    const userObj = (resDetails as any)?.user;
    const displayName =
        userObj?.name ||
        (userObj?.firstName ? `${userObj.firstName} ${userObj.lastName || ''}`.trim() : null) ||
        (resDetails as any)?.userName ||
        ((resDetails as any)?.userFirstName ? `${(resDetails as any).userFirstName} ${(resDetails as any).userLastName || ''}`.trim() : null) ||
        userName ||
        "Korisnik";

    const displayOib =
        userObj?.oib ||
        (resDetails as any)?.userOib ||
        userOib ||
        "—";

    const displayVesselName =
        (resDetails as any)?.vesselName ||
        (resDetails as any)?.vessel?.name ||
        vesselName ||
        "Plovilo";

    const displayVesselLength =
        (resDetails as any)?.vesselLengthM ||
        (resDetails as any)?.vessel?.lengthM ||
        vesselLengthM ||
        "—";

    const displayCraneName =
        (resDetails as any)?.crane?.name ||
        (resDetails as any)?.craneName ||
        craneName ||
        "Dizalica";

    const displayIsMember =
        userObj ? (!userObj.isLegalEntity && userObj.role === "user") : isMember;

    const targetCraneId = craneId || (resDetails as any)?.craneId || (resDetails as any)?.crane?.id;

    // Operation category detection
    const operationCategory =
        (resDetails as any)?.serviceType?.operationCategory ||
        (resDetails as any)?.serviceTypeCategory;

    const isLiftFromSea = operationCategory === "lift_from_sea";
    const isLowerToSea = operationCategory === "lower_to_sea";
    const isMove = operationCategory === "move";

    const operationTitle =
        (resDetails as any)?.serviceType?.name ||
        (isLiftFromSea ? "Vađenje iz mora" : isLowerToSea ? "Spuštanje u more" : isMove ? "Premještanje" : "Operacija dizalice");

    // Mutation for starting work order live
    const startMutation = trpc.workOrders.startFromReservation.useMutation({
        onSuccess: (res: any) => {
            if (res.alreadyRunning) {
                toast.info("Radni nalog je već bio pokrenut.");
            } else {
                toast.success(`Radni nalog ${res.workOrder.orderNumber} je uspješno pokrenut!`);
            }
            utils.workOrders.getActiveByReservation.invalidate({ reservationId });
            utils.workOrders.list.invalidate();
            utils.reservation.listAll.invalidate();
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri pokretanju radnog naloga."),
    });

    // Mutation for completing an already active order
    const completeMutation = trpc.workOrders.complete.useMutation({
        onSuccess: () => {
            toast.success("Radni nalog je uspješno završen i evidentiran!");
            utils.workOrders.getActiveByReservation.invalidate({ reservationId });
            utils.workOrders.list.invalidate();
            utils.userCard.getCard.invalidate();
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
            onOpenChange(false);
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri zaključivanju radnog naloga."),
    });

    // Mutation for direct 1-step completion (retroactive entry)
    const completeDirectlyMutation = trpc.workOrders.completeDirectly.useMutation({
        onSuccess: (res: any) => {
            toast.success(`Radni nalog ${res.workOrder.orderNumber} je uspješno evidentiran i zaključen!`);
            utils.workOrders.getActiveByReservation.invalidate({ reservationId });
            utils.workOrders.list.invalidate();
            utils.userCard.getCard.invalidate();
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
            onOpenChange(false);
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri evidentiranju radnog naloga."),
    });

    // Handle Live Start
    const handleStart = () => {
        let parsedStart: Date | undefined = undefined;
        if (startDate && startTime) {
            parsedStart = new Date(`${startDate}T${startTime}:00`);
        }
        startMutation.mutate({
            reservationId,
            craneId: targetCraneId,
            startTime: parsedStart,
            operatorNotes: operatorNotes || undefined,
        });
    };

    // Build resource items array for payload
    const getResourcePayload = () => {
        return Object.entries(selectedResources)
            .filter(([_, qty]) => qty > 0)
            .map(([resourceId, quantity]) => ({ resourceId, quantity }));
    };

    // Handle 1-step direct completion (retroactive)
    const handleDirectComplete = () => {
        let parsedStart: Date | undefined = undefined;
        if (startDate && startTime) {
            parsedStart = new Date(`${startDate}T${startTime}:00`);
        }

        completeDirectlyMutation.mutate({
            reservationId,
            craneId: targetCraneId,
            startTime: parsedStart,
            actualDurationMin: Number(durationMin) || 30,
            zoneId: selectedZoneId === "none" ? null : selectedZoneId,
            operatorNotes: operatorNotes || undefined,
            resources: getResourcePayload(),
        });
    };

    // Handle active order completion
    const handleCompleteActive = () => {
        if (!activeOrder?.id) return;
        completeMutation.mutate({
            workOrderId: activeOrder.id,
            actualDurationMin: Number(durationMin) || 30,
            operatorNotes: operatorNotes || undefined,
            zoneId: selectedZoneId === "none" ? null : selectedZoneId,
            resources: getResourcePayload(),
        });
    };

    // Check if scheduled date is strictly in the future (after today)
    const isFuture = (() => {
        if (!startDate) return false;
        const target = new Date(`${startDate}T23:59:59`);
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return target.getTime() > endOfToday.getTime();
    })();

    // Total extra resources price calculation
    const extraResourcesTotalEur = Object.entries(selectedResources).reduce((sum, [resId, qty]) => {
        const item = availableResources.find((r: any) => r.id === resId);
        if (!item || !qty) return sum;
        return sum + (Number(item.pricePerUnitEur) || 0) * qty;
    }, 0);

    const isPending = startMutation.isPending || completeMutation.isPending || completeDirectlyMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <Anchor className="h-5 w-5 text-primary" />
                        {isCompleted && existingOrder
                            ? `Pregled Radnog Naloga — ${existingOrder.orderNumber}`
                            : "Radni Nalog — Evidencija Terenskog Rada"}
                    </DialogTitle>
                </DialogHeader>

                {isLoadingOrder || isLoadingRes ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4 py-1">
                        {/* Header Box: User & Vessel summary */}
                        <div className="bg-muted/40 p-3.5 rounded-lg border space-y-2 text-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-semibold text-base flex items-center gap-2">
                                        {displayName}
                                        <Badge variant="outline" className="text-xs font-normal">
                                            {operationTitle}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground">OIB: {displayOib}</div>
                                </div>
                                <div className="text-right">
                                    {displayIsMember ? (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                                            ČLAN PŠD-a
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                                            VANJSKI KORISNIK
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                                <div><span className="text-muted-foreground">Plovilo:</span> {displayVesselName} ({displayVesselLength ? `${displayVesselLength} m` : "—"})</div>
                                <div><span className="text-muted-foreground">Dizalica:</span> {displayCraneName}</div>
                            </div>
                        </div>

                        {/* Completed Order Banner */}
                        {isCompleted && existingOrder && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                    <div>
                                        <div className="font-semibold text-sm">
                                            Radni nalog {existingOrder.orderNumber} je zaključen
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Evidentirano: {existingOrder.completedAt ? new Date(existingOrder.completedAt).toLocaleString("hr-HR") : "Dovršeno"} • Stvarno trajanje: {existingOrder.actualDurationMin || durationMin} min
                                        </div>
                                    </div>
                                </div>
                                <Badge className="bg-emerald-600 text-white font-semibold">DOVRŠENO</Badge>
                            </div>
                        )}

                        {/* Active Order Banner if already running */}
                        {activeOrder && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-900 dark:text-amber-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Play className="h-4 w-4 text-amber-600 animate-pulse" />
                                    <div>
                                        <div className="font-semibold text-sm">Nalog {activeOrder.orderNumber} u tijeku</div>
                                        <div className="text-xs">
                                            Pokrenuto: {new Date(activeOrder.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} h
                                        </div>
                                    </div>
                                </div>
                                <Badge className="bg-amber-600">IN PROGRESS</Badge>
                            </div>
                        )}

                        {/* Quota / Billing Preview Card */}
                        {displayIsMember ? (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs space-y-1">
                                <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                    Statutarno pravo člana (Godišnja članarina)
                                </div>
                                <p className="text-muted-foreground">
                                    Nakon završetka radnog naloga, operacija se automatski bilježi u Karton člana. Ako je član premašio godišnju kvotu (1 vađenje i 1 spuštanje), zadužuje se stavka doplate članarine za iduću godinu.
                                </p>
                            </div>
                        ) : (
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
                                <div className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    Komercijalni obračun po važećem cjeniku
                                </div>
                                <p className="text-muted-foreground">
                                    Vanjski korisnik: Obračunava se operacija dizalice prema dužini trupa ({displayVesselLength} m) uz izdavanje zaduženja za Desktop ERP.
                                </p>
                            </div>
                        )}

                        {/* Future date warning */}
                        {isFuture && !isCompleted && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                                <span>
                                    Odabrani datum je u budućnosti ({startDate}). Radni nalog se obično evidentira na dan izvršenja ili retroaktivno.
                                </span>
                            </div>
                        )}

                        {/* Operational Execution Fields */}
                        <div className="border rounded-lg p-4 space-y-4 bg-card">
                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {isCompleted ? "Evidentirano vrijeme i trajanje" : "Vrijeme i trajanje operacije"}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Datum izvršenja</Label>
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        disabled={!!activeOrder || isCompleted}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Vrijeme početka</Label>
                                    <Input
                                        type="time"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        disabled={!!activeOrder || isCompleted}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Stvarno trajanje (min)</Label>
                                    <Input
                                        type="number"
                                        value={durationMin}
                                        onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value)))}
                                        min={5}
                                        step={5}
                                        disabled={isCompleted}
                                    />
                                </div>
                            </div>

                            {/* Dry Berth / Land Zone placement */}
                            {(isLiftFromSea || isMove) ? (
                                <div className="space-y-1.5 pt-1">
                                    <Label className="text-xs flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5 text-primary" />
                                        Kopnena zona / Smještaj na suhom vezu
                                    </Label>
                                    <Select value={selectedZoneId} onValueChange={setSelectedZoneId} disabled={isCompleted}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Odaberi zonu na kopnu" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Bez dodijeljene zone</SelectItem>
                                            {landZones.map((z: any) => (
                                                <SelectItem key={z.id} value={z.id}>
                                                    {z.name} ({z.code}) {z.totalSpots ? `— Kapacitet: ${z.totalSpots}` : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-muted-foreground">
                                        Plovilo će se evidentirati kao zauzeto u odabranoj zoni na listi mjesta na kopnu.
                                    </p>
                                </div>
                            ) : isLowerToSea ? (
                                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md text-xs flex items-start gap-2 text-blue-900 dark:text-blue-200">
                                    <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                                    <div>
                                        <span className="font-semibold">Spuštanje u more (oslobađanje veza):</span>
                                        <p className="text-muted-foreground mt-0.5">
                                            Zaključivanjem ovog radnog naloga plovilo se automatski odjavljuje sa suhog veza i oslobađa se kopneni kapacitet.
                                        </p>
                                    </div>
                                </div>
                            ) : null}

                            {/* Extra Resources Accordion / Section */}
                            <div className="pt-2 border-t space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <PackagePlus className="h-3.5 w-3.5" />
                                        Dodatni resursi i oprema
                                    </div>
                                    {!isCompleted && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-primary"
                                            onClick={() => setShowResourcePicker(!showResourcePicker)}
                                        >
                                            {showResourcePicker ? "Sakrij resurse" : "Uredi resurse"}
                                            {extraResourcesTotalEur > 0 && (
                                                <Badge variant="secondary" className="ml-2 font-mono">
                                                    +{extraResourcesTotalEur.toFixed(2)} €
                                                </Badge>
                                            )}
                                        </Button>
                                    )}
                                </div>

                                {isCompleted && existingOrder?.resources && existingOrder.resources.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {existingOrder.resources.map((res: any) => (
                                            <div key={res.id} className="p-2 rounded border text-xs bg-muted/20 flex justify-between items-center">
                                                <span className="font-medium">{res.name}</span>
                                                <span className="font-mono font-semibold">{res.quantity} {res.unit || 'kom'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!isCompleted && showResourcePicker && (
                                    <div className="space-y-2 pt-1">
                                        {availableResources.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic">Nema definiranih dodatnih resursa u cjeniku.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {availableResources.map((res: any) => {
                                                    const currentQty = selectedResources[res.id] || 0;
                                                    return (
                                                        <div key={res.id} className="flex items-center justify-between p-2 rounded border text-xs bg-muted/20">
                                                            <div className="pr-2">
                                                                <div className="font-medium">{res.name}</div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {Number(res.pricePerUnitEur).toFixed(2)} € / {res.unit || 'kom'}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="outline"
                                                                    className="h-6 w-6"
                                                                    onClick={() => {
                                                                        setSelectedResources((prev) => ({
                                                                            ...prev,
                                                                            [res.id]: Math.max(0, (prev[res.id] || 0) - 1)
                                                                        }));
                                                                    }}
                                                                    disabled={currentQty <= 0}
                                                                >
                                                                    <Minus className="h-3 w-3" />
                                                                </Button>
                                                                <span className="w-6 text-center font-mono font-semibold">{currentQty}</span>
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="outline"
                                                                    className="h-6 w-6"
                                                                    onClick={() => {
                                                                        setSelectedResources((prev) => ({
                                                                            ...prev,
                                                                            [res.id]: (prev[res.id] || 0) + 1
                                                                        }));
                                                                    }}
                                                                >
                                                                    <Plus className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Operator Notes */}
                            <div className="space-y-1.5 pt-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-primary" />
                                        Napomena operatera / zapažanja na trupu
                                    </Label>
                                    {isCompleted && existingOrder && operatorNotes !== (existingOrder.operatorNotes || "") && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-[11px] text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                            onClick={() => updateNotesMutation.mutate({ workOrderId: existingOrder.id, operatorNotes })}
                                            disabled={updateNotesMutation.isPending}
                                        >
                                            {updateNotesMutation.isPending ? (
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                            ) : (
                                                <Check className="h-3 w-3 mr-1 text-emerald-600" />
                                            )}
                                            Spremi izmjenu napomene
                                        </Button>
                                    )}
                                </div>
                                <Textarea
                                    value={operatorNotes}
                                    onChange={(e) => setOperatorNotes(e.target.value)}
                                    placeholder="Npr. podupiranje izvršeno bez problema, trup opran, pripremljeno za suhi vez..."
                                    rows={isCompleted ? 3 : 2}
                                    className={isCompleted ? "bg-amber-50/20 border-amber-200/80 font-medium text-slate-800" : ""}
                                />
                                {isCompleted && existingOrder?.operatorNotes && (
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                        <Check className="h-3 w-3 text-emerald-600" />
                                        Evidentirana napomena: <span className="font-semibold text-foreground italic">"{existingOrder.operatorNotes}"</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2 pt-3 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        {isCompleted ? "Zatvori pregled" : "Odustani"}
                    </Button>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        {isCompleted && existingOrder ? (
                            <>
                                {operatorNotes !== (existingOrder.operatorNotes || "") && (
                                    <Button
                                        type="button"
                                        onClick={() => updateNotesMutation.mutate({ workOrderId: existingOrder.id, operatorNotes })}
                                        disabled={updateNotesMutation.isPending}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs font-semibold"
                                    >
                                        {updateNotesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        Spremi izmjenu napomene
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold"
                                    onClick={() => setShowPdf(true)}
                                >
                                    <Printer className="h-3.5 w-3.5" />
                                    Ispis naloga (A4 PDF)
                                </Button>
                            </>
                        ) : activeOrder ? (
                            <Button
                                onClick={handleCompleteActive}
                                disabled={isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 w-full sm:w-auto"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Završi radni nalog i evidentiraj
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleStart}
                                    disabled={isPending || isFuture}
                                    className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                    title="Pokretanje radnog naloga uživo s mjerenjem vremena"
                                >
                                    {startMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    Pokreni uživo
                                </Button>
                                <Button
                                    onClick={handleDirectComplete}
                                    disabled={isPending || isFuture}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 w-full sm:w-auto font-medium"
                                    title="Jednim klikom unosi radni nalog, evidentira kopno i zaduženje u kartonu"
                                >
                                    {completeDirectlyMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                    )}
                                    Završi i evidentiraj radni nalog
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>

            {/* Work Order PDF Modal */}
            {showPdf && existingOrder && (
                <Dialog open={showPdf} onOpenChange={setShowPdf}>
                    <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4 rounded-3xl">
                        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
                            <DialogTitle className="text-lg font-bold">
                                Radni nalog {existingOrder.orderNumber} (A4 Memorandum)
                            </DialogTitle>
                            <PDFDownloadLink
                                document={
                                    <WorkOrderPdf
                                        order={{
                                            orderNumber: existingOrder.orderNumber,
                                            startedAt: existingOrder.startedAt,
                                            completedAt: existingOrder.completedAt,
                                            actualDurationMin: existingOrder.actualDurationMin,
                                            clientType: displayIsMember ? "member" : "external",
                                            isStatutoryCovered: Boolean(existingOrder.isStatutoryCovered),
                                            chargeItemCode: (existingOrder as any).chargeItemCode || null,
                                            chargeItemName: (existingOrder as any).chargeItemName || null,
                                            vesselLengthM: displayVesselLength,
                                            commercialTotal: existingOrder.commercialTotal,
                                            operatorNotes: operatorNotes || existingOrder.operatorNotes || null,
                                            userName: displayName,
                                            userOib: displayOib,
                                            userEmail: userObj?.email || null,
                                            userPhone: userObj?.phone || (resDetails as any)?.contactPhone || null,
                                            vesselName: displayVesselName,
                                            vesselRegistration: (resDetails as any)?.vesselRegistration || (resDetails as any)?.vessel?.registration || null,
                                            craneName: displayCraneName,
                                            operatorName: null,
                                        }}
                                    />
                                }
                                fileName={`${existingOrder.orderNumber}.pdf`}
                            >
                                {({ loading }: any) => (
                                    <Button size="sm" className="gap-1.5 rounded-xl" disabled={loading}>
                                        <Download className="h-4 w-4" />
                                        Preuzmi PDF
                                    </Button>
                                )}
                            </PDFDownloadLink>
                        </DialogHeader>
                        <div className="flex-1 w-full h-full pt-2">
                            <PDFViewer width="100%" height="100%" className="rounded-2xl border">
                                <WorkOrderPdf
                                    order={{
                                        orderNumber: existingOrder.orderNumber,
                                        startedAt: existingOrder.startedAt,
                                        completedAt: existingOrder.completedAt,
                                        actualDurationMin: existingOrder.actualDurationMin,
                                        clientType: displayIsMember ? "member" : "external",
                                        isStatutoryCovered: Boolean(existingOrder.isStatutoryCovered),
                                        chargeItemCode: (existingOrder as any).chargeItemCode || null,
                                        chargeItemName: (existingOrder as any).chargeItemName || null,
                                        vesselLengthM: displayVesselLength,
                                        commercialTotal: existingOrder.commercialTotal,
                                        operatorNotes: operatorNotes || existingOrder.operatorNotes || null,
                                        userName: displayName,
                                        userOib: displayOib,
                                        userEmail: userObj?.email || null,
                                        userPhone: userObj?.phone || (resDetails as any)?.contactPhone || null,
                                        vesselName: displayVesselName,
                                        vesselRegistration: (resDetails as any)?.vesselRegistration || (resDetails as any)?.vessel?.registration || null,
                                        craneName: displayCraneName,
                                        operatorName: null,
                                    }}
                                />
                            </PDFViewer>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Dialog>
    );
}
