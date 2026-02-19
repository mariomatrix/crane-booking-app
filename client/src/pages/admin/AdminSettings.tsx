import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Loader2, Save, Settings2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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
                </div>
            )}
        </div>
    );
}
