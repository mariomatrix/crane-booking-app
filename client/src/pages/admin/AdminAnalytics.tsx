import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from "recharts";
import { Loader2, Download, Users, Anchor, AlertTriangle, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function AdminAnalytics() {
    const { data, isLoading } = trpc.analytics.dashboard.useQuery();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Učitavanje analitike...</span>
            </div>
        );
    }

    if (!data) return null;

    const exportToCSV = () => {
        // Basic CSV export for crane stats
        const headers = ["Dizalica", "Sati rada", "Sati održavanja", "Odbijeno", "Otkazano"];
        const rows = data.craneStats.map((c: any) => [
            c.craneName,
            c.utilization.toFixed(1),
            c.maintenanceHours.toFixed(1),
            c.rejectedCount,
            c.cancelledCount
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((e: any) => e.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `marina_izvjestaj_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Izvještaj je preuzet.");
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Analitika i izvještaji</h1>
                    <p className="text-muted-foreground">Pregled rada u zadnjih 30 dana</p>
                </div>
                <Button onClick={exportToCSV} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Izvezi u CSV
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Ukupno sati rada</CardTitle>
                        <Anchor className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.craneStats.reduce((acc: number, c: any) => acc + c.utilization, 0).toFixed(1)}h
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Sati održavanja</CardTitle>
                        <Hammer className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.craneStats.reduce((acc: number, c: any) => acc + c.maintenanceHours, 0).toFixed(1)}h
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Otkazane rezervacije</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.craneStats.reduce((acc: number, c: any) => acc + c.cancelledCount, 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Aktivni korisnici (30d)</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.topUsers.length}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Utilization Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Iskorištenost dizalica (h)</CardTitle>
                        <CardDescription>Usporedba radnih sati po dizalici</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.craneStats}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="craneName" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="utilization" name="Radni sati" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="maintenanceHours" name="Održavanje" fill="#f97316" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Cancellation Reasons Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Razlozi otkazivanja</CardTitle>
                        <CardDescription>Analiza zašto korisnici odustaju</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {data.cancelReasons.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.cancelReasons}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.cancelReasons.map((_: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground italic">
                                Nema podataka o otkazivanjima.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Users Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Ključni korisnici</CardTitle>
                        <CardDescription>Korisnici s najviše ostvarenih rezervacija</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.topUsers.map((user: any, idx: number) => (
                                <div key={user.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium leading-none">{user.name}</p>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold">{user.count} rezervacija</div>
                                </div>
                            ))}
                            {data.topUsers.length === 0 && (
                                <p className="text-sm text-muted-foreground italic">Nema zabilježenih rezervacija.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Lost Opportunities (Rejected/Cancelled) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Propušteni termini</CardTitle>
                        <CardDescription>Broj odbijenih zahtjeva po dizalici</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.craneStats} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="craneName" type="category" width={100} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="rejectedCount" name="Odbijeno" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="cancelledCount" name="Otkazano" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
