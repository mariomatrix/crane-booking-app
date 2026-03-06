import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";
import { Loader2, Save, Settings2, Key, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AdminSettings() {
    const { t } = useLang();
    const { data: settings, isLoading } = trpc.settings.get.useQuery();
    const utils = trpc.useUtils();

    const [slotMin, setSlotMin] = useState("60");
    const [bufferMin, setBufferMin] = useState("15");
    const [workStart, setWorkStart] = useState("08:00");
    const [workEnd, setWorkEnd] = useState("16:00");

    useEffect(() => {
        if (settings) {
            setSlotMin(settings.slotDurationMinutes ?? "60");
            setBufferMin(settings.bufferMinutes ?? "15");
            setWorkStart(settings.workdayStart ?? "08:00");
            setWorkEnd(settings.workdayEnd ?? "16:00");
        }
    }, [settings]);

    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            utils.settings.get.invalidate();
            toast.success("Postavke su spremljene.");
        },
        onError: (err) => toast.error(err.message),
    });

    const handleSave = (key: string, value: string) => {
        updateMutation.mutate({ key: key as any, value });
    };

    const isSaving = updateMutation.isPending;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Settings2 className="h-5 w-5" /> {t.admin.settings}
                </h2>
                <p className="text-sm text-muted-foreground">Konfigurirajte operativne parametre sustava.</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Vremenski slotovi</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t.admin.settingsSlotDuration}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min="15"
                                        step="15"
                                        value={slotMin}
                                        onChange={(e) => setSlotMin(e.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isSaving}
                                        onClick={() => handleSave("slotDurationMinutes", slotMin)}
                                    >
                                        <Save className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Osnovni slot za rezervacije. Korisnici mogu birati višekratnike.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>{t.admin.settingsBuffer}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min="0"
                                        step="5"
                                        value={bufferMin}
                                        onChange={(e) => setBufferMin(e.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isSaving}
                                        onClick={() => handleSave("bufferMinutes", bufferMin)}
                                    >
                                        <Save className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Automatski tampon između rezervacija (priprema, moguća kašnjenja plovila).
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Radno vrijeme</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t.admin.settingsWorkStart}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="time"
                                        value={workStart}
                                        onChange={(e) => setWorkStart(e.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isSaving}
                                        onClick={() => handleSave("workdayStart", workStart)}
                                    >
                                        <Save className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>{t.admin.settingsWorkEnd}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="time"
                                        value={workEnd}
                                        onChange={(e) => setWorkEnd(e.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isSaving}
                                        onClick={() => handleSave("workdayEnd", workEnd)}
                                    >
                                        <Save className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="md:col-span-2">
                        <ApiKeysSection />
                    </div>
                </div>
            )}
        </div>
    );
}

function ApiKeysSection() {
    const utils = trpc.useUtils();
    const { lang } = useLang();
    const { data: keys, isLoading } = trpc.apiKey.list.useQuery();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newKey, setNewKey] = useState<{ id: string; key: string; name: string } | null>(null);

    const createMutation = trpc.apiKey.create.useMutation({
        onSuccess: (data) => {
            utils.apiKey.list.invalidate();
            setNewKey(data);
            setNewName("");
        },
        onError: (err) => toast.error(err.message),
    });

    const revokeMutation = trpc.apiKey.revoke.useMutation({
        onSuccess: () => {
            utils.apiKey.list.invalidate();
            toast.success("API Ključ opozvan.");
        },
        onError: (err) => toast.error(err.message),
    });

    const handleCreate = () => {
        if (!newName.trim()) return;
        createMutation.mutate({ name: newName });
    };

    const handleRevoke = (id: string) => {
        if (confirm("Jeste li sigurni da želite opozvati ovaj ključ?")) {
            revokeMutation.mutate({ id });
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        API Ključevi (REST API)
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Upravljajte ključevima za pristup vanjskom REST API-ju (npr. Marina aplikacija).
                    </p>
                </div>
                <Button size="sm" onClick={() => setIsAddOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Novi ključ
                </Button>
            </CardHeader>
            <CardContent className="mt-4">
                {isLoading ? (
                    <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Naziv</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Kreirano</TableHead>
                                    <TableHead>Zadnje korištenje</TableHead>
                                    <TableHead className="text-right">Akcije</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {keys?.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                                            Nema aktivnih ključeva.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {keys?.map(k => (
                                    <TableRow key={k.id}>
                                        <TableCell className="font-medium">{k.name}</TableCell>
                                        <TableCell>
                                            <Badge variant={k.isActive ? "default" : "secondary"}>
                                                {k.isActive ? "Aktivno" : "Opozvano"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatAppDate(k.createdAt, lang as any, true)}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {k.lastUsedAt ? formatAppDate(k.lastUsedAt, lang as any, true) : "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive/90"
                                                onClick={() => handleRevoke(k.id)}
                                                disabled={!k.isActive || revokeMutation.isPending}
                                            >
                                                Opozovi
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <Dialog open={isAddOpen} onOpenChange={(v) => {
                setIsAddOpen(v);
                if (!v) setNewKey(null);
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novi API Ključ</DialogTitle>
                    </DialogHeader>

                    {!newKey ? (
                        <div className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label>Naziv ključa</Label>
                                <Input
                                    placeholder="npr. Marina ERP Integracija"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="py-4 space-y-4">
                            <div className="p-4 bg-muted text-muted-foreground rounded-md text-sm">
                                Ključ je usješno kreiran. Molimo kopirajte ga sada jer se <strong>neće</strong> više moći prikazati!
                            </div>
                            <div className="space-y-2">
                                <Label>API Ključ</Label>
                                <div className="flex gap-2">
                                    <Input value={newKey.key} readOnly className="font-mono text-sm" />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {!newKey ? (
                            <>
                                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Odustani</Button>
                                <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
                                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kreiraj"}
                                </Button>
                            </>
                        ) : (
                            <Button onClick={() => setIsAddOpen(false)}>Zatvori</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
