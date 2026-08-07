import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, ShieldCheck, AlertCircle, FileText, Anchor } from "lucide-react";

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
    const [durationMin, setDurationMin] = useState<number>(30);
    const [operatorNotes, setOperatorNotes] = useState<string>("");

    const utils = trpc.useUtils();

    // Query active work order for this reservation
    const { data: activeOrder, isLoading: isLoadingActive } = trpc.workOrders.getActiveByReservation.useQuery(
        { reservationId },
        { enabled: open && !!reservationId }
    );

    const startMutation = trpc.workOrders.startFromReservation.useMutation({
        onSuccess: (res: any) => {
            if (res.alreadyRunning) {
                toast.info("Radni nalog je već bio pokrenut.");
            } else {
                toast.success(`Radni nalog ${res.workOrder.orderNumber} je uspješno pokrenut!`);
            }
            utils.workOrders.getActiveByReservation.invalidate({ reservationId });
            utils.workOrders.list.invalidate();
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri pokretanju radnog naloga."),
    });

    const completeMutation = trpc.workOrders.complete.useMutation({
        onSuccess: () => {
            toast.success("Radni nalog je uspješno završen i evidentiran u karton!");
            utils.workOrders.getActiveByReservation.invalidate({ reservationId });
            utils.workOrders.list.invalidate();
            utils.userCard.getCard.invalidate();
            onOpenChange(false);
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri zaključivanju radnog naloga."),
    });

    const handleStart = () => {
        startMutation.mutate({
            reservationId,
            craneId,
            operatorNotes: operatorNotes || undefined,
        });
    };

    const handleComplete = () => {
        if (!activeOrder?.id) return;
        completeMutation.mutate({
            workOrderId: activeOrder.id,
            actualDurationMin: Number(durationMin) || 30,
            operatorNotes: operatorNotes || undefined,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <Anchor className="h-5 w-5 text-primary" />
                        Operativni Radni Nalog
                    </DialogTitle>
                </DialogHeader>

                {isLoadingActive ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {/* Info Header Box */}
                        <div className="bg-muted/40 p-4 rounded-lg border space-y-2 text-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-semibold text-base">{userName || "Korisnik"}</div>
                                    <div className="text-xs text-muted-foreground">OIB: {userOib || "Nije uneseno"}</div>
                                </div>
                                <div className="text-right">
                                    {isMember ? (
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
                                <div><span className="text-muted-foreground">Plovilo:</span> {vesselName || "—"} ({vesselLengthM ? `${vesselLengthM} m` : "—"})</div>
                                <div><span className="text-muted-foreground">Dizalica:</span> {craneName || "—"}</div>
                            </div>
                        </div>

                        {/* Active Order Status */}
                        {activeOrder ? (
                            <div className="space-y-4">
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-900 dark:text-amber-200 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Play className="h-4 w-4 text-amber-600 animate-pulse" />
                                        <div>
                                            <div className="font-semibold">Nalog {activeOrder.orderNumber} u tijeku</div>
                                            <div className="text-xs">Pokrenuto: {new Date(activeOrder.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} h</div>
                                        </div>
                                    </div>
                                    <Badge className="bg-amber-600">IN PROGRESS</Badge>
                                </div>

                                {/* Statutory Quota vs Price preview */}
                                {activeOrder.isStatutoryCovered ? (
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs space-y-1">
                                        <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                            Pokriveno godišnjom članarinom (0,00 €)
                                        </div>
                                        <p className="text-muted-foreground">
                                            Ovo je statutarno pravo člana (1 vađenje ili 1 spuštanje). Nakon završetka automatski se bilježi u Karton člana bez izdavanja računa.
                                        </p>
                                    </div>
                                ) : activeOrder.clientType === "member" ? (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs space-y-1">
                                        <div className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                                            <AlertCircle className="h-4 w-4 text-red-600" />
                                            Prekoračenje statutarne kvote (Doplata članarine)
                                        </div>
                                        <p className="text-muted-foreground">
                                            Članu se ne izdaje račun. Zadužuje se stavka <span className="font-semibold">{activeOrder.chargeItemName || "Korištenje dizalice 9T"}</span> u Kartonu člana za uvećanje članarine u Desktop ERP-u za iduću godinu.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-1">
                                        <div className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                            <FileText className="h-4 w-4 text-blue-600" />
                                            Komercijalni obračun po metrima duljine ({activeOrder.vesselLengthM || '8.0'} m)
                                        </div>
                                        <p className="text-muted-foreground">
                                            Ukupno za fakturiranje u Desktop ERP-u: <span className="font-bold text-foreground">{activeOrder.commercialTotal || '0.00'} EUR</span> (s PDV-om).
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-3 pt-2">
                                    <div className="space-y-1.5">
                                        <Label>Stvarno trajanje operacije (minuta)</Label>
                                        <Input
                                            type="number"
                                            value={durationMin}
                                            onChange={(e) => setDurationMin(Number(e.target.value))}
                                            min={5}
                                            step={5}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label>Napomena operatera / zapažanja na trupu</Label>
                                        <Textarea
                                            value={operatorNotes}
                                            onChange={(e) => setOperatorNotes(e.target.value)}
                                            placeholder="Npr. podupiranje izvršeno bez problema, trup čist..."
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground space-y-2">
                                    <p>
                                        Klikom na <strong>"Pokreni radni nalog"</strong> stvara se službeni broj naloga (npr. <span className="font-mono font-semibold text-foreground">RN-2026-XXXXX</span>), bilježi se početak operacije dizalice i priprema se obračun prema statusu korisnika.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Početna napomena (opcionalno)</Label>
                                    <Textarea
                                        value={operatorNotes}
                                        onChange={(e) => setOperatorNotes(e.target.value)}
                                        placeholder="Unesite specifičnosti prije početka dizanja/spuštanja..."
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Odustani
                    </Button>
                    {activeOrder ? (
                        <Button
                            onClick={handleComplete}
                            disabled={completeMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                            {completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Završi radni nalog i evidentiraj
                        </Button>
                    ) : (
                        <Button
                            onClick={handleStart}
                            disabled={startMutation.isPending}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                        >
                            {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Pokreni radni nalog
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
