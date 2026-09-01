import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tag, Edit2, Plus, ShieldAlert, Layers, Wrench, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminPriceList() {
    const utils = trpc.useUtils();
    const { data: priceItems = [], isLoading } = trpc.priceList.list.useQuery();
    const { data: resourceList = [], isLoading: isLoadingResources } = trpc.resources.list.useQuery();

    // Price list item edit state
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({
        name: "",
        pricePerMeterEur: "",
        fixedPriceEur: "",
        vatRate: "25.00",
    });

    // Resource edit / create state
    const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<any | null>(null);
    const [resourceForm, setResourceForm] = useState({
        name: "",
        code: "",
        unit: "sat",
        pricePerUnitEur: "20.00",
        vatRate: "25.00",
        description: "",
        isActive: true,
    });

    const updateMutation = trpc.priceList.update.useMutation({
        onSuccess: () => {
            toast.success("Stavka cjenika je uspješno ažurirana.");
            setEditingItem(null);
            utils.priceList.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri ažuriranju cjenika."),
    });

    const createResourceMutation = trpc.resources.create.useMutation({
        onSuccess: () => {
            toast.success("Novi resurs je uspješno dodan.");
            setResourceDialogOpen(false);
            utils.resources.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri dodavanju resursa."),
    });

    const updateResourceMutation = trpc.resources.update.useMutation({
        onSuccess: () => {
            toast.success("Resurs je uspješno ažuriran.");
            setResourceDialogOpen(false);
            utils.resources.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri ažuriranju resursa."),
    });

    const deleteResourceMutation = trpc.resources.delete.useMutation({
        onSuccess: () => {
            toast.success("Resurs je uspješno obrisan.");
            utils.resources.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri brisanju resursa."),
    });

    const handleOpenEdit = (item: any) => {
        setEditingItem(item);
        setEditForm({
            name: item.name,
            pricePerMeterEur: item.pricePerMeterEur || "",
            fixedPriceEur: item.fixedPriceEur || "",
            vatRate: item.vatRate || "25.00",
        });
    };

    const handleSaveEdit = () => {
        if (!editingItem) return;
        updateMutation.mutate({
            id: editingItem.id,
            name: editForm.name,
            pricePerMeterEur: editForm.pricePerMeterEur ? Number(editForm.pricePerMeterEur) : null,
            fixedPriceEur: editForm.fixedPriceEur ? Number(editForm.fixedPriceEur) : null,
            vatRate: Number(editForm.vatRate) || 25.00,
        });
    };

    const handleOpenCreateResource = () => {
        setEditingResource(null);
        setResourceForm({
            name: "",
            code: `RES-${Date.now().toString().slice(-4)}`,
            unit: "sat",
            pricePerUnitEur: "25.00",
            vatRate: "25.00",
            description: "",
            isActive: true,
        });
        setResourceDialogOpen(true);
    };

    const handleOpenEditResource = (r: any) => {
        setEditingResource(r);
        setResourceForm({
            name: r.name,
            code: r.code,
            unit: r.unit,
            pricePerUnitEur: r.pricePerUnitEur || "0.00",
            vatRate: r.vatRate || "25.00",
            description: r.description || "",
            isActive: r.isActive,
        });
        setResourceDialogOpen(true);
    };

    const handleSaveResource = () => {
        if (editingResource) {
            updateResourceMutation.mutate({
                id: editingResource.id,
                name: resourceForm.name,
                code: resourceForm.code,
                unit: resourceForm.unit,
                pricePerUnitEur: resourceForm.pricePerUnitEur,
                vatRate: resourceForm.vatRate,
                description: resourceForm.description,
                isActive: resourceForm.isActive,
            });
        } else {
            createResourceMutation.mutate({
                name: resourceForm.name,
                code: resourceForm.code,
                unit: resourceForm.unit,
                pricePerUnitEur: resourceForm.pricePerUnitEur,
                vatRate: resourceForm.vatRate,
                description: resourceForm.description,
                isActive: resourceForm.isActive,
            });
        }
    };

    const memberItems = priceItems.filter((p: any) => p.targetType === "member_adjustment");
    const externalItems = priceItems.filter((p: any) => p.targetType === "external_commercial");

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Tag className="h-7 w-7 text-primary" />
                    Cjenik Usluga, Ležarina i Dodatnih Resursa
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Parametrizacija cjenika po dužnom metru za vanjske korisnike, ležarine na kopnu, dodatnih resursa (traktor, pumpa...) i šifri za Desktop ERP.
                </p>
            </div>

            {/* Member fee adjustments section */}
            <Card className="border-l-4 border-l-amber-500 rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                        <CardTitle className="text-lg">Šifrarnik zaduženja za uvećanje članarine (Članovi PŠD)</CardTitle>
                    </div>
                    <CardDescription>
                        Stavke koje se evidentiraju u Kartonu člana u slučaju prekoračenja statutarne kvote (dodatna vađenja/spuštanja ili boravak preko 30 dana) i prenose u Desktop ERP pri obnovi članarine.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="w-[140px]">Šifra stavke</TableHead>
                                <TableHead>Naziv operacije / usluge</TableHead>
                                <TableHead className="w-[140px]">Informativna tarifa</TableHead>
                                <TableHead className="w-[100px]">PDV</TableHead>
                                <TableHead className="text-right w-[100px]">Uredi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {memberItems.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-mono font-bold">{item.code}</TableCell>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="font-bold text-amber-600">
                                        {item.fixedPriceEur ? `${item.fixedPriceEur} €` : "Po statutu"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{item.vatRate}%</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* External commercial pricelist & Dry Berth */}
            <Card className="border-l-4 border-l-blue-500 rounded-2xl shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-lg">Komercijalni cjenik i ležarina po danu (Vanjski korisnici)</CardTitle>
                    </div>
                    <CardDescription>
                        Cjenik po dužnom metru plovila za operacije dizalice i fiksna cijena ležarine na suhom vezu po danu za privremene klijente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="w-[160px]">Šifra stavke</TableHead>
                                <TableHead>Naziv usluge</TableHead>
                                <TableHead className="w-[160px]">Cijena po metru (EUR/m)</TableHead>
                                <TableHead className="w-[140px]">Fiksna cijena</TableHead>
                                <TableHead className="w-[100px]">PDV</TableHead>
                                <TableHead className="text-right w-[100px]">Uredi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {externalItems.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-mono font-bold">{item.code}</TableCell>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="font-bold text-blue-600">
                                        {item.pricePerMeterEur ? `${item.pricePerMeterEur} €/m` : "—"}
                                    </TableCell>
                                    <TableCell className="font-bold text-blue-600">
                                        {item.fixedPriceEur ? `${item.fixedPriceEur} €` : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{item.vatRate}%</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(item)}>
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Additional Resources (Dodatni resursi lučice: Traktor, Pumpa, Visokotlačni perač...) */}
            <Card className="border-l-4 border-l-emerald-500 rounded-2xl shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-emerald-600" />
                            <CardTitle className="text-lg">Dodatni Resursi i Oprema Lučice</CardTitle>
                        </div>
                        <CardDescription className="mt-1">
                            Resursi koji se opcionalno biraju pri operaciji dizalice (traktor, pumpa za ispumpavanje, perač, postolje). Default je bez dodatnih resursa.
                        </CardDescription>
                    </div>
                    <Button onClick={handleOpenCreateResource} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs">
                        <Plus className="h-4 w-4 mr-2" />
                        Dodaj resurs
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="w-[140px]">Šifra resursa</TableHead>
                                <TableHead>Naziv opreme / resursa</TableHead>
                                <TableHead className="w-[120px]">Jedinica</TableHead>
                                <TableHead className="w-[140px]">Cijena po jedinici</TableHead>
                                <TableHead className="w-[100px]">PDV</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="text-right w-[120px]">Akcije</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {resourceList.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground italic">
                                        Nema unesenih dodatnih resursa. Kliknite na "Dodaj resurs".
                                    </TableCell>
                                </TableRow>
                            ) : (
                                resourceList.map((res: any) => (
                                    <TableRow key={res.id}>
                                        <TableCell className="font-mono font-bold">{res.code}</TableCell>
                                        <TableCell className="font-semibold">{res.name}</TableCell>
                                        <TableCell><Badge variant="outline">{res.unit}</Badge></TableCell>
                                        <TableCell className="font-bold text-emerald-600">
                                            {Number(res.pricePerUnitEur).toFixed(2)} €
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{res.vatRate}%</TableCell>
                                        <TableCell>
                                            <Badge className={res.isActive ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-700"}>
                                                {res.isActive ? "Aktivan" : "Neaktivan"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => handleOpenEditResource(res)}>
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                                    onClick={() => {
                                                        if (confirm(`Želite li obrisati resurs "${res.name}"?`)) {
                                                            deleteResourceMutation.mutate({ id: res.id });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Price Item Edit Dialog */}
            {editingItem && (
                <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
                    <DialogContent className="rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>Uredi stavku: {editingItem.code}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label>Naziv stavke / usluge</Label>
                                <Input
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>

                            {editingItem.targetType === "external_commercial" && (
                                <div className="space-y-1.5">
                                    <Label>Cijena po dužnom metru plovila (€/m)</Label>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        value={editForm.pricePerMeterEur}
                                        onChange={(e) => setEditForm({ ...editForm, pricePerMeterEur: e.target.value })}
                                        placeholder="npr. 12.00"
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label>Fiksna cijena ili doplata (€)</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    value={editForm.fixedPriceEur}
                                    onChange={(e) => setEditForm({ ...editForm, fixedPriceEur: e.target.value })}
                                    placeholder="npr. 15.00"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label>Stopa PDV-a (%)</Label>
                                <Input
                                    type="number"
                                    value={editForm.vatRate}
                                    onChange={(e) => setEditForm({ ...editForm, vatRate: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditingItem(null)}>
                                Odustani
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                                Spremi izmjene
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Resource Create / Edit Dialog */}
            {resourceDialogOpen && (
                <Dialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen}>
                    <DialogContent className="rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>
                                {editingResource ? `Uredi resurs: ${editingResource.name}` : "Dodaj novi resurs lučice"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Naziv resursa / opreme</Label>
                                    <Input
                                        value={resourceForm.name}
                                        onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                                        placeholder="Npr. Traktor, Pumpa..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Šifra resursa</Label>
                                    <Input
                                        value={resourceForm.code}
                                        onChange={(e) => setResourceForm({ ...resourceForm, code: e.target.value.toUpperCase() })}
                                        placeholder="RES-TRAKTOR"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Jedinica mjere</Label>
                                    <Input
                                        value={resourceForm.unit}
                                        onChange={(e) => setResourceForm({ ...resourceForm, unit: e.target.value })}
                                        placeholder="sat / rad / dan"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Cijena po jedinici (€)</Label>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        value={resourceForm.pricePerUnitEur}
                                        onChange={(e) => setResourceForm({ ...resourceForm, pricePerUnitEur: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>PDV (%)</Label>
                                    <Input
                                        type="number"
                                        value={resourceForm.vatRate}
                                        onChange={(e) => setResourceForm({ ...resourceForm, vatRate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Opis / Napomena</Label>
                                <Input
                                    value={resourceForm.description}
                                    onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                                    placeholder="Opcionalni opis primjene..."
                                />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                                <div>
                                    <div className="text-xs font-bold">Aktivan resurs</div>
                                    <div className="text-[10px] text-muted-foreground">Prikazuje se operateru u mobilnoj aplikaciji</div>
                                </div>
                                <Switch
                                    checked={resourceForm.isActive}
                                    onCheckedChange={(val) => setResourceForm({ ...resourceForm, isActive: val })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setResourceDialogOpen(false)}>
                                Odustani
                            </Button>
                            <Button
                                onClick={handleSaveResource}
                                disabled={createResourceMutation.isPending || updateResourceMutation.isPending || !resourceForm.name || !resourceForm.code}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                Spremi resurs
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
