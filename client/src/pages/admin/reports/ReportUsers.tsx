import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { UserActivityPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export default function ReportUsers() {
    const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
    const [oib, setOib] = useState("");
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    const { data: reportData, isLoading } = trpc.reports.userActivity.useQuery({
        from,
        to,
        oib: oib.trim() !== "" ? oib : undefined,
    });

    const summaries = reportData?.summaries || [];
    const details = reportData?.details || [];

    const excelExportData = summaries.map(item => ({
        "OIB": item.oib || "",
        "Klijent": item.clientName || "",
        "Email": item.email || "",
        "Ukupno Zahtjeva": item.totalRequests || 0,
        "Odobreno": item.approvedRequests || 0,
        "Dovršeno": item.completedRequests || 0,
        "Otkazano": item.cancelledRequests || 0,
        "Radni sati": (item.totalMinutes / 60).toFixed(1),
    }));

    const toggleExpand = (userId: string) => {
        if (expandedUser === userId) {
            setExpandedUser(null);
        } else {
            setExpandedUser(userId);
        }
    };

    return (
        <div className="space-y-6">
            <ReportPageNav title="Aktivnost korisnika" />

            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" /> Filteri
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Datum od</Label>
                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Datum do</Label>
                            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>OIB klijenta</Label>
                            <Input 
                                type="text" 
                                placeholder="Pretraga po OIB-u..." 
                                value={oib} 
                                onChange={(e) => setOib(e.target.value.replace(/\D/g, "").slice(0, 11))} 
                                maxLength={11}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-4">
                    <ExportActions 
                        excelData={excelExportData}
                        excelFileName="Aktivnost_korisnika"
                        pdfDocument={<UserActivityPdf data={details} summaries={summaries} dateFrom={from} dateTo={to} marinaName="PŠD Špinut Marina" />}
                        pdfFileName="Aktivnost_korisnika"
                    />

                    {/* Printable Preview */}
                    <div className="border rounded-lg bg-card p-8 shadow-sm max-w-[21cm] mx-auto report-print-container">
                        <ReportHeader title="Aktivnost korisnika" dateFrom={from} dateTo={to} />

                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg border-b pb-2">Sažetak aktivnosti po klijentima</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[15%]">OIB</TableHead>
                                        <TableHead className="w-[25%]">Klijent</TableHead>
                                        <TableHead className="w-[20%]">Email adresa</TableHead>
                                        <TableHead className="text-center w-[10%]">Zahtjevi</TableHead>
                                        <TableHead className="text-center w-[15%]">Dovršeno / Otkaz</TableHead>
                                        <TableHead className="text-right w-[10%]">Sati rada</TableHead>
                                        <TableHead className="no-print w-[5%]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaries.map((s, idx) => {
                                        const userReservations = details.filter(r => r.userId === s.userId);
                                        const isExpanded = expandedUser === s.userId;
                                        return (
                                            <>
                                                <TableRow key={idx} className="hover:bg-slate-50/50">
                                                    <TableCell className="font-mono font-medium">{s.oib || "—"}</TableCell>
                                                    <TableCell className="font-semibold">{s.clientName}</TableCell>
                                                    <TableCell>{s.email}</TableCell>
                                                    <TableCell className="text-center font-semibold">{s.totalRequests}</TableCell>
                                                    <TableCell className="text-center text-xs">
                                                        <span className="text-green-600 font-semibold">{s.completedRequests}</span>
                                                        {" / "}
                                                        <span className="text-red-500 font-semibold">{s.cancelledRequests}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold">
                                                        {(s.totalMinutes / 60).toFixed(1)} h
                                                    </TableCell>
                                                    <TableCell className="no-print text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => toggleExpand(s.userId)}
                                                            className="h-8 w-8"
                                                        >
                                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                
                                                {/* Collapsible details for screen & automatically printed on paper print */}
                                                {(isExpanded || window.matchMedia("print").matches) && (
                                                    <TableRow className="bg-slate-50/50 dark:bg-slate-900/30">
                                                        <TableCell colSpan={7} className="p-4 border-t">
                                                            <div className="space-y-3">
                                                                <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider">
                                                                    Povijest rezervacija (Plovila i Radnje):
                                                                </h4>
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow className="bg-transparent hover:bg-transparent">
                                                                            <TableHead className="h-7 text-xs">Rezervacija</TableHead>
                                                                            <TableHead className="h-7 text-xs">Registracija plovila</TableHead>
                                                                            <TableHead className="h-7 text-xs">Naziv plovila</TableHead>
                                                                            <TableHead className="h-7 text-xs">Radnja</TableHead>
                                                                            <TableHead className="h-7 text-xs">Termin</TableHead>
                                                                            <TableHead className="h-7 text-xs">Status</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {userReservations.map((r, rIdx) => (
                                                                            <TableRow key={rIdx} className="bg-transparent hover:bg-transparent">
                                                                                <TableCell className="py-1.5 font-mono text-xs">{r.reservationNumber || "—"}</TableCell>
                                                                                <TableCell className="py-1.5 font-mono text-xs font-semibold">{r.vesselRegistration || "—"}</TableCell>
                                                                                <TableCell className="py-1.5 text-xs">{r.vesselName || "—"}</TableCell>
                                                                                <TableCell className="py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">{r.serviceTypeName || "—"}</TableCell>
                                                                                <TableCell className="py-1.5 text-xs font-mono">
                                                                                    {r.scheduledStart ? format(new Date(r.scheduledStart), "dd.MM.yyyy HH:mm") : "—"}
                                                                                </TableCell>
                                                                                <TableCell className="py-1.5 text-xs capitalize">{r.status}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                        {userReservations.length === 0 && (
                                                                            <TableRow>
                                                                                <TableCell colSpan={6} className="text-center py-2 text-xs italic text-muted-foreground">
                                                                                    Nema pojedinačnih rezervacija.
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        )}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </>
                                        );
                                    })}
                                    {summaries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                                                Nema zapisa za odabrani period.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <ReportFooter 
                            summaryItems={[
                                { label: "Ukupno aktivnih klijenata", value: summaries.length },
                                { label: "Sveukupno zahtjeva", value: summaries.reduce((acc, curr) => acc + (curr.totalRequests || 0), 0) }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
