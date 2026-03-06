import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatAppDate } from "@/lib/date-utils";
import { useLang } from "@/contexts/LangContext";


export default function AdminAuditLog() {
    const { lang } = useLang();
    const { data: logs, isLoading } = trpc.system.auditLogs.useQuery({ limit: 100 });

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight mb-2">Povijest radnji (Audit Log)</h1>
                <p className="text-muted-foreground">
                    Pregled zadnjih 100 osjetljivih sistemskih promjena i aktivnosti operatera.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <History className="h-5 w-5" />
                        Aktivnosti
                    </CardTitle>
                    <CardDescription>
                        Zabilježene akcije prijava, rezervacija korisnika, uređivanja postavki i ostalih promjena bazi.
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                    {logs?.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            Nema evidentiranih akcija.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Vrijeme</TableHead>
                                        <TableHead>Operater / Korisnik</TableHead>
                                        <TableHead>Akcija</TableHead>
                                        <TableHead>Entitet</TableHead>
                                        <TableHead>Detalji</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(logs || []).map((log: any) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {formatAppDate(log.createdAt, lang as any, true)}
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {log.actor?.name || log.actor?.email || "Sustav (Nepoznato)"}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <span className="bg-slate-100 text-slate-800 text-xs px-2 py-1 rounded-md font-mono">
                                                    {log.action}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {log.entityType}
                                                {log.entityId && (
                                                    <span className="block text-[10px] font-mono mt-0.5" title={log.entityId}>
                                                        {log.entityId.substring(0, 8)}...
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={log.payload ? JSON.stringify(log.payload) : "-"}>
                                                {log.payload ? JSON.stringify(log.payload) : "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
