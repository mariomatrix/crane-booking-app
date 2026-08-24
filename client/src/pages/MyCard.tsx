import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReservationChat } from "@/components/ReservationChat";
import {
    Loader2, CalendarDays, CheckCircle2, XCircle, Hourglass, Ban, MessageSquare, Ship,
} from "lucide-react";
import { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";

const STAT_CARDS = [
    { key: "total", label: "Ukupno", icon: CalendarDays, color: "text-foreground" },
    { key: "pending", label: "Na čekanju", icon: Hourglass, color: "text-amber-500" },
    { key: "approved", label: "Odobreno", icon: CheckCircle2, color: "text-blue-500" },
    { key: "completed", label: "Izvršeno", icon: CheckCircle2, color: "text-green-600" },
    { key: "rejected", label: "Odbijeno", icon: XCircle, color: "text-red-500" },
    { key: "cancelled", label: "Otkazano", icon: Ban, color: "text-gray-500" },
];

export default function MyCard() {
    const { user: authUser, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
    const { lang } = useLang();
    const [chatResId, setChatResId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");

    const { data, isLoading } = trpc.user.getCard.useQuery(undefined, {
        enabled: !!authUser,
    });

    if (authLoading || isLoading || !data) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { stats, reservations, vessels } = data;
    const filteredReservations = statusFilter === "all"
        ? reservations
        : reservations.filter((r: any) => r.status === statusFilter);

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-4 sm:p-6">
            <div>
                <h1 className="text-2xl font-bold">Moj karton</h1>
                <p className="text-sm text-muted-foreground">Pregled vaših zahtjeva i rezervacija</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
                    <Card
                        key={key}
                        className={`cursor-pointer transition hover:shadow-md ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${color}`} />
                            <div>
                                <p className="text-2xl font-bold">{(stats as any)[key]}</p>
                                <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Reservations */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Moje rezervacije ({filteredReservations.length})
                        {statusFilter !== "all" && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setStatusFilter("all")}>
                                Prikaži sve
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredReservations.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">Nema rezervacija.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Br.</TableHead>
                                    <TableHead>Datum</TableHead>
                                    <TableHead>Operacija</TableHead>
                                    <TableHead>Mjesto na kopnu</TableHead>
                                    <TableHead>Plovilo</TableHead>
                                    <TableHead>Dizalica</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Poruke</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReservations.map((r: any) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-mono text-xs">{r.reservationNumber || "—"}</TableCell>
                                        <TableCell className="text-xs font-medium whitespace-nowrap">
                                            {r.scheduledStart
                                                ? formatAppDate(r.scheduledStart, lang as any, true)
                                                : r.requestedDate
                                                    ? formatAppDate(r.requestedDate, lang as any)
                                                    : "—"}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-semibold text-xs text-foreground block">
                                                {r.serviceTypeName || (r.isMaintenance ? "Održavanje" : "Dizanje/Spuštanje")}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {r.landZoneCode || r.landZoneName ? (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[11px] font-semibold whitespace-nowrap">
                                                    {r.landZoneCode ? `${r.landZoneName || "Kopno"} (${r.landZoneCode})` : r.landZoneName}
                                                </Badge>
                                            ) : r.serviceTypeCategory === "lift_from_sea" ? (
                                                <span className="text-xs text-amber-600 font-medium italic">Nije dodijeljeno</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold">{r.vesselRegistration || "—"}</span>
                                                {r.vesselName && r.vesselName !== r.vesselRegistration && (
                                                    <span className="text-[10px] text-muted-foreground">{r.vesselName}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{r.craneName || "—"}</TableCell>
                                        <TableCell><StatusBadge status={r.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-xs"
                                                onClick={() => setChatResId(r.id)}
                                            >
                                                <MessageSquare className="h-3 w-3 mr-1" />Poruke
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Vessels */}
            {vessels.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Ship className="h-4 w-4" />Moja plovila ({vessels.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Naziv</TableHead>
                                    <TableHead>Tip</TableHead>
                                    <TableHead>Dužina</TableHead>
                                    <TableHead>Registracija</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(vessels as any[]).map((v: any) => (
                                    <TableRow key={v.id}>
                                        <TableCell className="font-medium">{v.name}</TableCell>
                                        <TableCell>{v.type}</TableCell>
                                        <TableCell>{v.lengthM ? `${Number(v.lengthM).toFixed(1)} m` : "—"}</TableCell>
                                        <TableCell>{v.registration || "—"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Chat Modal */}
            <Dialog open={!!chatResId} onOpenChange={(open) => !open && setChatResId(null)}>
                <DialogContent className="max-w-lg p-0">
                    <DialogHeader className="p-4 pb-0">
                        <DialogTitle>Poruke</DialogTitle>
                        <DialogDescription>Razgovor o ovoj rezervaciji.</DialogDescription>
                    </DialogHeader>
                    {chatResId && <ReservationChat reservationId={chatResId} pollInterval={15000} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
