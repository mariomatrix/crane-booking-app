import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tag, Edit2, Plus, CheckCircle2, ShieldAlert, Layers } from "lucide-react";
import { toast } from "sonner";

export default function AdminPriceList() {
    const utils = trpc.useUtils();
    const { data: priceItems = [], isLoading } = trpc.priceList.list.useQuery();

    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({
        name: "",
        pricePerMeterEur: "",
        fixedPriceEur: "",
        vatRate: "25.00",
    });

    const updateMutation = trpc.priceList.update.useMutation({
        onSuccess: () => {
            toast.success("Stavka cjenika je uspješno ažurirana.");
            setEditingItem(null);
            utils.priceList.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri ažuriranju cjenika."),
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

    const memberItems = priceItems.filter((p: any) => p.targetType === "member_adjustment");
    const externalItems = priceItems.filter((p: any) => p.targetType === "external_commercial");

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Tag className="h-7 w-7 text-primary" />
                    Cjenik Usluga i Šifrarnik Zaduženja
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Parametrizacija cjenika po dužnom metru za vanjske korisnike i šifre stavki za zaduženja članarina u Desktop ERP-u.
                </p>
            </div>

            {/* Member fee adjustments section */}
            <Card className="border-l-4 border-l-amber-500">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                        <CardTitle className="text-lg">Šifrarnik zaduženja za uvećanje članarine (Članovi PŠD)</CardTitle>
                    </div>
                    <CardDescription>
                        Stavke koje se evidentiraju u Kartonu člana u slučaju prekoračenja statutarne kvote (dodatna vađenja/spuštanja) i prenose u Desktop ERP pri obnovi članarine.
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

            {/* External commercial pricelist */}
            <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-lg">Komercijalni cjenik po metrima duljine (Vanjski korisnici)</CardTitle>
                    </div>
                    <CardDescription>
                        Cjenik po dužnom metru plovila za vanjske klijente i partnere bez statusa člana. Služi za izdavanje faktura u Desktop ERP-u.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="w-[140px]">Šifra stavke</TableHead>
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
                                    <TableCell className="font-medium">
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

            {/* Edit Dialog */}
            {editingItem && (
                <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
                    <DialogContent>
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
                                    placeholder="npr. 50.00"
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
        </div>
    );
}
