import AdminLayout from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Loader2, Pencil, Plus, Trash2, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ServiceTypeForm {
    name: string;
    description: string;
    defaultDurationMin: number;
    isActive: boolean;
    sortOrder: number;
}

const emptyForm: ServiceTypeForm = {
    name: "",
    description: "",
    defaultDurationMin: 60,
    isActive: true,
    sortOrder: 0,
};

export default function AdminServiceTypes() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ServiceTypeForm>(emptyForm);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const utils = trpc.useUtils();

    const { data: serviceTypes = [], isLoading } = trpc.serviceType.listAll.useQuery();

    const createMutation = trpc.serviceType.create.useMutation({
        onSuccess: () => {
            toast.success("Tip operacije kreiran.");
            utils.serviceType.listAll.invalidate();
            utils.serviceType.list.invalidate();
            setDialogOpen(false);
            setForm(emptyForm);
        },
        onError: (err) => toast.error(err.message),
    });

    const updateMutation = trpc.serviceType.update.useMutation({
        onSuccess: () => {
            toast.success("Tip operacije ažuriran.");
            utils.serviceType.listAll.invalidate();
            utils.serviceType.list.invalidate();
            setDialogOpen(false);
            setEditingId(null);
            setForm(emptyForm);
        },
        onError: (err) => toast.error(err.message),
    });

    const deleteMutation = trpc.serviceType.delete.useMutation({
        onSuccess: () => {
            toast.success("Tip operacije obrisan.");
            utils.serviceType.listAll.invalidate();
            utils.serviceType.list.invalidate();
            setDeleteConfirmId(null);
        },
        onError: (err) => toast.error(err.message),
    });

    const seedMutation = trpc.serviceType.seed.useMutation({
        onSuccess: () => {
            toast.success("Početni tipovi operacija dodani.");
            utils.serviceType.listAll.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setDialogOpen(true);
    };

    const openEdit = (st: any) => {
        setEditingId(st.id);
        setForm({
            name: st.name,
            description: st.description ?? "",
            defaultDurationMin: st.defaultDurationMin,
            isActive: st.isActive,
            sortOrder: st.sortOrder,
        });
        setDialogOpen(true);
    };

    const handleSubmit = () => {
        if (!form.name.trim()) { toast.error("Naziv je obavezan."); return; }
        if (editingId) {
            updateMutation.mutate({ id: editingId, ...form });
        } else {
            createMutation.mutate(form);
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold">Tipovi operacija</h2>
                        <p className="text-sm text-muted-foreground">
                            Upravljanje vrstama zahvata koji korisnici mogu zahtijevati
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {(serviceTypes as any[]).length === 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => seedMutation.mutate()}
                                disabled={seedMutation.isPending}
                            >
                                {seedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                <Settings2 className="h-4 w-4 mr-2" />
                                Dodaj početne
                            </Button>
                        )}
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4 mr-2" /> Novi tip
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (serviceTypes as any[]).length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Settings2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-medium mb-2">Nema tipova operacija</h3>
                            <p className="text-muted-foreground mb-4">
                                Dodajte početne tipove ili kreirajte novi.
                            </p>
                            <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                                {seedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Dodaj početne tipove
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {(serviceTypes as any[])
                            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                            .map((st: any) => (
                                <Card key={st.id} className={!st.isActive ? "opacity-60" : ""}>
                                    <CardContent className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{st.name}</span>
                                                {!st.isActive && (
                                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                                        Neaktivan
                                                    </span>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    ~{st.defaultDurationMin} min
                                                </span>
                                            </div>
                                            {st.description && (
                                                <p className="text-sm text-muted-foreground mt-0.5">{st.description}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button size="sm" variant="ghost" onClick={() => openEdit(st)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setDeleteConfirmId(st.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                    </div>
                )}
            </div>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setEditingId(null); setForm(emptyForm); } setDialogOpen(v); }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Uredi tip operacije" : "Novi tip operacije"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Naziv *</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="npr. Spuštanje, Vađenje..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Opis</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Kratki opis tipa operacije..."
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Trajanje (min)</Label>
                                <Input
                                    type="number"
                                    min={15}
                                    max={480}
                                    value={form.defaultDurationMin}
                                    onChange={(e) => setForm((f) => ({ ...f, defaultDurationMin: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Redoslijed</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={form.sortOrder}
                                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={form.isActive}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                            />
                            <Label>Aktivan (vidljiv korisnicima)</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Odustani</Button>
                        <Button onClick={handleSubmit} disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingId ? "Spremi" : "Kreiraj"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Obriši tip operacije?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Brisanje tipa operacije ne utječe na postojeće rezervacije koje koriste ovaj tip.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Odustani</Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Obriši
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
