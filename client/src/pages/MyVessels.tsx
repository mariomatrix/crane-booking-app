import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, Plus, Ship, Trash2, Edit2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function MyVessels() {
    const { user, loading: authLoading } = useAuth();
    const [, setLocation] = useLocation();
    const { t } = useLang();
    const utils = trpc.useUtils();
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [type, setType] = useState<"sailboat" | "motorboat" | "catamaran">("motorboat");
    const [length, setLength] = useState("");
    const [width, setWidth] = useState("");
    const [draft, setDraft] = useState("");
    const [weight, setWeight] = useState("");

    const { data: vessels = [], isLoading } = trpc.vessel.listMine.useQuery(
        undefined,
        { enabled: !!user }
    );

    const createMutation = trpc.vessel.create.useMutation({
        onSuccess: () => {
            toast.success(t.vessels.save);
            utils.vessel.listMine.invalidate();
            setIsAddOpen(false);
            resetForm();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const deleteMutation = trpc.vessel.delete.useMutation({
        onSuccess: () => {
            toast.success(t.vessels.delete);
            utils.vessel.listMine.invalidate();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const resetForm = () => {
        setName("");
        setType("motorboat");
        setLength("");
        setWidth("");
        setDraft("");
        setWeight("");
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate({
            name,
            type,
            length: length || undefined,
            width: width || undefined,
            draft: draft || undefined,
            weight: weight || undefined,
        });
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        window.location.href = "/auth";
        return null;
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="border-b bg-card">
                <div className="container py-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-2 -ml-2">
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                {t.nav.calendar}
                            </Button>
                            <h1 className="text-xl font-semibold">{t.vessels.title}</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                {t.vessels.subtitle}
                            </p>
                        </div>

                        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus className="h-4 w-4 mr-2" />
                                    {t.vessels.addVessel}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <form onSubmit={handleCreate}>
                                    <DialogHeader>
                                        <DialogTitle>{t.vessels.addVessel}</DialogTitle>
                                        <DialogDescription>
                                            {t.vessels.dimensions}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">{t.vessels.vesselName} *</Label>
                                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>{t.vessels.vesselType} *</Label>
                                            <Select value={type} onValueChange={(v: any) => setType(v)}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="sailboat">{t.form.vesselTypeSailboat}</SelectItem>
                                                    <SelectItem value="motorboat">{t.form.vesselTypeMotorboat}</SelectItem>
                                                    <SelectItem value="catamaran">{t.form.vesselTypeCatamaran}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>{t.form.vesselLength}</Label>
                                                <Input type="number" step="0.01" value={length} onChange={(e) => setLength(e.target.value)} />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>{t.form.vesselWidth}</Label>
                                                <Input type="number" step="0.01" value={width} onChange={(e) => setWidth(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>{t.form.vesselDraft}</Label>
                                                <Input type="number" step="0.01" value={draft} onChange={(e) => setDraft(e.target.value)} />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>{t.form.vesselWeight}</Label>
                                                <Input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" disabled={createMutation.isPending}>
                                            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            {t.vessels.save}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            <div className="container py-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : vessels.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Ship className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-medium mb-2">{t.vessels.noVessels}</h3>
                            <p className="text-muted-foreground mb-4">
                                {t.vessels.subtitle}
                            </p>
                            <Button onClick={() => setIsAddOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                {t.vessels.addVessel}
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {vessels.map((vessel: any) => (
                            <Card key={vessel.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Ship className="h-5 w-5 text-primary" />
                                            {vessel.name}
                                        </CardTitle>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive h-8 w-8"
                                            onClick={() => {
                                                if (confirm(t.vessels.deleteConfirm)) {
                                                    deleteMutation.mutate({ id: vessel.id });
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <CardDescription>
                                        {vessel.type === "sailboat" ? t.form.vesselTypeSailboat :
                                            vessel.type === "motorboat" ? t.form.vesselTypeMotorboat :
                                                t.form.vesselTypeCatamaran}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                                        <div className="text-muted-foreground">{t.form.vesselLength}</div>
                                        <div>{vessel.length} m</div>
                                        <div className="text-muted-foreground">{t.form.vesselWidth}</div>
                                        <div>{vessel.width} m</div>
                                        <div className="text-muted-foreground">{t.form.vesselDraft}</div>
                                        <div>{vessel.draft} m</div>
                                        <div className="text-muted-foreground">{t.form.vesselWeight}</div>
                                        <div className="font-semibold">{vessel.weight} t</div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
