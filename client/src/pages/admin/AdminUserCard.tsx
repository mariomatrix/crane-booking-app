import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
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
    Loader2, ArrowLeft, CalendarDays, Mail, Phone, Shield, Clock,
    CheckCircle2, XCircle, Hourglass, Ban, Anchor, MessageSquare, Ship,
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

export default function AdminUserCard() {
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const { lang } = useLang();
    const [chatResId, setChatResId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");

    const { data, isLoading } = trpc.user.getCard.useQuery(
        { userId: id },
        { enabled: !!id }
    );

    const utils = trpc.useUtils();

    const completeMutation = trpc.reservation.complete.useMutation({
        onSuccess: () => {
            utils.user.getCard.invalidate();
        },
    });

    if (isLoading || !data) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { user, stats, reservations, vessels } = data;
    const filteredReservations = statusFilter === "all"
        ? reservations
        : reservations.filter((r: any) => r.status === statusFilter);

    return (
        <div className="space-y-6">
            {/* Back button + Header */}
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/users")}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold">{user.name || `${user.firstName} ${user.lastName}`}</h2>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />{user.email}
                        </span>
                        {user.phone && (
                            <span className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5" />{user.phone}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" />
                            <Badge variant="secondary">{user.role}</Badge>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            Registriran: {user.createdAt ? new Date(user.createdAt).toLocaleDateString("hr-HR") : "—"}
                        </span>
                    </div>
                </div>
                <Button variant="outline" onClick={() => setLocation(`/admin/calendar?userId=${user.id}`)}>
                    <CalendarDays className="h-4 w-4 mr-2" />Kalendar
                </Button>
            </div>

            {/* Stats Cards */}
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

            {/* Reservations Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Rezervacije ({filteredReservations.length})
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
                                    <TableHead>Plovilo</TableHead>
                                    <TableHead>Dizalica</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Akcije</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReservations.map((r: any) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-mono text-xs">{r.reservationNumber || "—"}</TableCell>
                                        <TableCell>
                                            {r.scheduledStart
                                                ? formatAppDate(r.scheduledStart, lang as any, true)
                                                : r.requestedDate
                                                    ? formatAppDate(r.requestedDate, lang as any)
                                                    : "—"}
                                        </TableCell>
                                        <TableCell>{r.vesselName || "—"}</TableCell>
                                        <TableCell>{r.craneName || "—"}</TableCell>
                                        <TableCell><StatusBadge status={r.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                {r.status === "approved" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                                                        onClick={() => completeMutation.mutate({ id: r.id })}
                                                        disabled={completeMutation.isPending}
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />Završi
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={() => setChatResId(r.id)}
                                                >
                                                    <MessageSquare className="h-3 w-3 mr-1" />Poruke
                                                </Button>
                                            </div>
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
                            <Ship className="h-4 w-4" />Plovila ({vessels.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Naziv</TableHead>
                                    <TableHead>Tip</TableHead>
                                    <TableHead>Težina</TableHead>
                                    <TableHead>Registracija</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(vessels as any[]).map((v: any) => (
                                    <TableRow key={v.id}>
                                        <TableCell className="font-medium">{v.name}</TableCell>
                                        <TableCell>{v.type}</TableCell>
                                        <TableCell>{v.weightKg ? `${(v.weightKg / 1000).toFixed(1)} t` : "—"}</TableCell>
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
                        <DialogDescription>Razgovarajte s korisnikom u vezi ove rezervacije.</DialogDescription>
                    </DialogHeader>
                    {chatResId && <ReservationChat reservationId={chatResId} pollInterval={15000} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
