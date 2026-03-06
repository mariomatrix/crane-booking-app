import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, Edit2, Sun, Snowflake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DAYS = [
    { key: "mon", label: "Ponedjeljak" },
    { key: "tue", label: "Utorak" },
    { key: "wed", label: "Srijeda" },
    { key: "thu", label: "Četvrtak" },
    { key: "fri", label: "Petak" },
    { key: "sat", label: "Subota" },
    { key: "sun", label: "Nedjelja" },
];

const DEFAULT_HOURS: Record<string, { from: string; to: string }> = {
    mon: { from: "08:00", to: "16:00" },
    tue: { from: "08:00", to: "16:00" },
    wed: { from: "08:00", to: "16:00" },
    thu: { from: "08:00", to: "16:00" },
    fri: { from: "08:00", to: "16:00" },
    sat: { from: "08:00", to: "12:00" },
    sun: { from: "", to: "" },
};

import { formatAppDate, formatToSqlDate } from "@/lib/date-utils";
import { useLang } from "@/contexts/LangContext";
import { DatePicker } from "@/components/ui/date-picker";

export default function AdminSeasons() {
    const { lang } = useLang();
    const { data: seasons = [], isLoading } = trpc.season.list.useQuery();
    const utils = trpc.useUtils();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);
    const [workingHours, setWorkingHours] = useState<Record<string, { from: string; to: string }>>(DEFAULT_HOURS);

    const createMutation = trpc.season.create.useMutation({
        onSuccess: () => { toast.success("Sezona kreirana."); closeDialog(); utils.season.list.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const updateMutation = trpc.season.update.useMutation({
        onSuccess: () => { toast.success("Sezona ažurirana."); closeDialog(); utils.season.list.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const deleteMutation = trpc.season.delete.useMutation({
        onSuccess: () => { toast.success("Sezona obrisana."); utils.season.list.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const toggleActive = trpc.season.update.useMutation({
        onSuccess: () => utils.season.list.invalidate(),
        onError: (e) => toast.error(e.message),
    });

    const closeDialog = () => {
        setDialogOpen(false);
        setEditingId(null);
        setName("");
        setStartDate(undefined);
        setEndDate(undefined);
        setWorkingHours(DEFAULT_HOURS);
    };

    const openEdit = (s: any) => {
        setEditingId(s.id);
        setName(s.name);
        setStartDate(s.startDate ? new Date(s.startDate) : undefined);
        setEndDate(s.endDate ? new Date(s.endDate) : undefined);
        setWorkingHours(s.workingHours || DEFAULT_HOURS);
        setDialogOpen(true);
    };

    const handleSave = () => {
        if (!name || !startDate || !endDate) {
            toast.error("Molimo popunite sve obavezne podatke.");
            return;
        }
        if (editingId) {
            updateMutation.mutate({
                id: editingId,
                name,
                startDate: formatToSqlDate(startDate!),
                endDate: formatToSqlDate(endDate!),
                workingHours
            });
        } else {
            createMutation.mutate({
                name,
                startDate: formatToSqlDate(startDate!),
                endDate: formatToSqlDate(endDate!),
                workingHours
            });
        }
    };

    const updateHour = (day: string, field: "from" | "to", value: string) => {
        setWorkingHours((prev) => ({
            ...prev,
            [day]: { ...prev[day], [field]: value },
        }));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Sezonski rasporedi</h2>
                    <p className="text-sm text-muted-foreground">
                        Definirajte sezone s radnim vremenom. Rezervacije su moguće samo unutar aktivne sezone.
                    </p>
                </div>
                <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Nova sezona
                </Button>
            </div>

            {seasons.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Sun className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium mb-2">Nema definiranih sezona</h3>
                        <p className="text-muted-foreground">Dodajte ljetnu ili zimsku sezonu.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {(seasons as any[]).map((s: any) => (
                        <Card key={s.id}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {s.name.toLowerCase().includes("ljet") || s.name.toLowerCase().includes("summer")
                                            ? <Sun className="h-5 w-5 text-amber-500" />
                                            : <Snowflake className="h-5 w-5 text-blue-500" />}
                                        <div>
                                            <CardTitle className="text-base">{s.name}</CardTitle>
                                            <p className="text-sm text-muted-foreground">
                                                {formatAppDate(s.startDate, lang as any)} — {formatAppDate(s.endDate, lang as any)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-sm">Aktivna</Label>
                                            <Switch
                                                checked={s.isActive}
                                                onCheckedChange={(v) => toggleActive.mutate({ id: s.id, isActive: v })}
                                            />
                                        </div>
                                        <Button variant="outline" size="icon" onClick={() => openEdit(s)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="text-destructive"
                                            onClick={() => deleteMutation.mutate({ id: s.id })}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Dan</TableHead>
                                            <TableHead>Od</TableHead>
                                            <TableHead>Do</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {DAYS.map((d) => {
                                            const h = (s.workingHours as any)?.[d.key];
                                            return (
                                                <TableRow key={d.key}>
                                                    <TableCell className="font-medium">{d.label}</TableCell>
                                                    <TableCell>{h?.from || "—"}</TableCell>
                                                    <TableCell>{h?.to || "—"}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
                <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Uredi sezonu" : "Nova sezona"}</DialogTitle>
                        <DialogDescription>
                            Definirajte naziv, period i radno vrijeme za svaki dan u tjednu.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Naziv sezone *</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="npr. Ljetna sezona 2026"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Početak *</Label>
                                <DatePicker date={startDate} onChange={setStartDate} placeholder="Odaberi datum" />
                            </div>
                            <div className="space-y-2">
                                <Label>Kraj *</Label>
                                <DatePicker date={endDate} onChange={setEndDate} placeholder="Odaberi datum" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Radno vrijeme po danima</Label>
                            <div className="space-y-2">
                                {DAYS.map((d) => (
                                    <div key={d.key} className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center">
                                        <span className="text-sm">{d.label}</span>
                                        <Input
                                            type="time"
                                            value={workingHours[d.key]?.from || ""}
                                            onChange={(e) => updateHour(d.key, "from", e.target.value)}
                                            placeholder="Od"
                                        />
                                        <Input
                                            type="time"
                                            value={workingHours[d.key]?.to || ""}
                                            onChange={(e) => updateHour(d.key, "to", e.target.value)}
                                            placeholder="Do"
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Ostavite prazno za neradne dane.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialog}>Odustani</Button>
                        <Button
                            onClick={handleSave}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {(createMutation.isPending || updateMutation.isPending) && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            {editingId ? "Spremi promjene" : "Kreiraj sezonu"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
