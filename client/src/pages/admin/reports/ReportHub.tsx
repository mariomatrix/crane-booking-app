import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
    CalendarDays,
    BarChart3,
    Users,
    Layers,
    Anchor,
    ListOrdered,
    ArrowRight
} from "lucide-react";

export default function ReportHub() {
    const [, setLocation] = useLocation();

    const reportsList = [
        {
            title: "Plan rada dizalica",
            description: "Dnevni, tjedni i mjesečni plan rezervacija i rada dizalica. Sadrži raspored s terminima, klijentima i dodijeljenim dizalicama.",
            path: "/admin/reports/schedule",
            icon: CalendarDays,
            color: "text-blue-600 border-blue-100 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-950/20",
        },
        {
            title: "Korištenje dizalica (Utilizacija)",
            description: "Kumulativni radni sati i statistika za svaku dizalicu. Pomaže u analizi zauzetosti dizalica u određenom periodu.",
            path: "/admin/reports/utilization",
            icon: BarChart3,
            color: "text-emerald-600 border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-950/20",
        },
        {
            title: "Analitika po korisnicima",
            description: "Pregled zahtjeva, odobrenja i ukupnog vremena korištenja po pojedinom klijentu (pretraga i filtriranje po OIB-u).",
            path: "/admin/reports/users",
            icon: Users,
            color: "text-purple-600 border-purple-100 bg-purple-50/50 dark:bg-purple-950/10 dark:border-purple-950/20",
        },
        {
            title: "Analitika po tipovima operacija",
            description: "Udio i prosječno trajanje pojedine radnje (dizanje, spuštanje, pranje...) u ukupnom radu marine.",
            path: "/admin/reports/operations",
            icon: Layers,
            color: "text-amber-600 border-amber-100 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-950/20",
        },
        {
            title: "Plovila na kopnu",
            description: "Evidencija plovila koja se nalaze na kopnu u suhom vezu. Prikazuje vlasnika (OIB), zonu, mjesto i duljinu boravka.",
            path: "/admin/reports/land-occupancy",
            icon: Anchor,
            color: "text-indigo-600 border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/10 dark:border-indigo-950/20",
        },
        {
            title: "Pregled liste čekanja",
            description: "Hronološki pregled klijenata na listama čekanja za dizalice s prikazom prioriteta, željenog datuma i statusa prijave.",
            path: "/admin/reports/waiting-list",
            icon: ListOrdered,
            color: "text-pink-600 border-pink-100 bg-pink-50/50 dark:bg-pink-950/10 dark:border-pink-950/20",
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Izvještaji i Analitika</h1>
                <p className="text-muted-foreground">Odaberite i generirajte print-ready izvještaje o poslovanju marine.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {reportsList.map((report, idx) => {
                    const Icon = report.icon;
                    return (
                        <Card key={idx} className="flex flex-col h-full hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                                <div className={`p-2.5 rounded-lg border ${report.color}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-lg">{report.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col justify-between pt-0 space-y-4">
                                <CardDescription className="text-sm text-muted-foreground line-clamp-3">
                                    {report.description}
                                </CardDescription>
                                <Button
                                    className="w-full mt-4 flex items-center justify-center gap-1.5"
                                    variant="outline"
                                    onClick={() => setLocation(report.path)}
                                >
                                    Otvori izvještaj <ArrowRight className="h-4 w-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
