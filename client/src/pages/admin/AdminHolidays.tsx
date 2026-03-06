import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, CalendarOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatAppDate, formatToSqlDate } from "@/lib/date-utils";
import { useLang } from "@/contexts/LangContext";
import { DatePicker } from "@/components/ui/date-picker";

export default function AdminHolidays() {
    const { lang } = useLang();
    const { data: holidays = [], isLoading } = trpc.holiday.list.useQuery();
    const utils = trpc.useUtils();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [name, setName] = useState("");
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [isRecurring, setIsRecurring] = useState(true);

    const createMutation = trpc.holiday.create.useMutation({
        onSuccess: () => {
            toast.success("Praznik dodan.");
            setDialogOpen(false);
            setName("");
            setDate(undefined);
            utils.holiday.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const deleteMutation = trpc.holiday.delete.useMutation({
        onSuccess: () => { toast.success("Praznik obrisan."); utils.holiday.list.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const seedMutation = trpc.holiday.seed.useMutation({
        onSuccess: () => { toast.success("HR praznici dodani."); utils.holiday.list.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold">Praznici i neradni dani</h2>
                    <p className="text-sm text-muted-foreground">
                        Upravljajte praznicima i neradnim danima. Rezervacije su blokirane na te datume.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => seedMutation.mutate()}
                        disabled={seedMutation.isPending}
                    >
                        {seedMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Dodaj HR praznike
                    </Button>
                    <Button onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Novi praznik
                    </Button>
                </div>
            </div>

            {holidays.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <CalendarOff className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium mb-2">Nema praznika</h3>
                        <p className="text-muted-foreground">Kliknite "Dodaj HR praznike" za automatski unos.</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Datum</TableHead>
                                    <TableHead>Naziv</TableHead>
                                    <TableHead>Ponavlja se</TableHead>
                                    <TableHead className="text-right">Akcije</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(holidays as any[]).map((h: any) => (
                                    <TableRow key={h.id}>
                                        <TableCell className="font-mono">{formatAppDate(h.date, lang as any)}</TableCell>
                                        <TableCell className="font-medium">{h.name}</TableCell>
                                        <TableCell>
                                            {h.isRecurring ? (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded dark:bg-blue-900/30 dark:text-blue-300">Godišnje</span>
                                            ) : (
                                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded dark:bg-gray-800 dark:text-gray-400">Jednokratno</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive"
                                                onClick={() => deleteMutation.mutate({ id: h.id })}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Add Holiday Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novi praznik</DialogTitle>
                        <DialogDescription>
                            Dodajte praznik ili neradni dan. Rezervacije neće biti moguće na taj datum.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Datum *</Label>
                            <DatePicker date={date} onChange={setDate} placeholder="Odaberi datum" />
                        </div>
                        <div className="space-y-2">
                            <Label>Naziv *</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="npr. Dan državnosti"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="recurring"
                                checked={isRecurring}
                                onChange={(e) => setIsRecurring(e.target.checked)}
                                className="rounded"
                            />
                            <Label htmlFor="recurring" className="text-sm">Ponavlja se svake godine</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Odustani</Button>
                        <Button
                            onClick={() => createMutation.mutate({ date: formatToSqlDate(date!), name, isRecurring })}
                            disabled={!date || !name || createMutation.isPending}
                        >
                            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Dodaj praznik
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
