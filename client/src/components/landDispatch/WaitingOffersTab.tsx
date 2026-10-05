import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ListOrdered,
  Sparkles,
  Clock,
  Calendar,
  Anchor,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WaitingOffersTab({
  dateStr,
  zones,
  cranes,
}: {
  dateStr: string;
  zones: Array<{ zoneId: string; zoneCode: string; zoneName: string }>;
  cranes: Array<{ id: string; name: string }>;
}) {
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [selectedWlItem, setSelectedWlItem] = useState<any>(null);
  const [offerZoneId, setOfferZoneId] = useState("");
  const [offerCraneId, setOfferCraneId] = useState("");
  const [offerDate, setOfferDate] = useState(dateStr);
  const [offerStartTime, setOfferStartTime] = useState("08:00");
  const [offerEndTime, setOfferEndTime] = useState("08:30");
  const [offerHours, setOfferHours] = useState(24);

  const utils = trpc.useUtils();

  // Query waiting list
  const { data: waitingData = [], isLoading } = trpc.landFlow.getSpotsByZone.useQuery(
    { zoneId: zones[0]?.zoneId || "" },
    { enabled: false }
  );

  // We can also query all waiting list items from trpc if available or mock/db
  // Let's create an offer mutation
  const createOfferMutation = trpc.landDispatch.createWaitingOffer.useMutation({
    onSuccess: () => {
      toast.success("Ponuda termina je poslana sa zadržavanjem mjesta (24h)!");
      utils.landDispatch.getDailyOverview.invalidate();
      setOfferModalOpen(false);
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const handleOpenOfferModal = (item: any) => {
    setSelectedWlItem(item);
    setOfferZoneId(zones[0]?.zoneId || "");
    setOfferCraneId(cranes[0]?.id || "");
    setOfferDate(dateStr);
    setOfferModalOpen(true);
  };

  const handleSendOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWlItem) return;

    createOfferMutation.mutate({
      waitingListId: selectedWlItem.id,
      zoneId: offerZoneId,
      craneId: offerCraneId,
      offeredStartIso: new Date(`${offerDate}T${offerStartTime}:00Z`).toISOString(),
      offeredEndIso: new Date(`${offerDate}T${offerEndTime}:00Z`).toISOString(),
      expiresInHours: offerHours,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Lista čekanja za suhi vez</h2>
          <p className="text-xs text-muted-foreground">
            Korisnici u redu čekanja za slobodno mjesto na kopnu (FIFO prioritet uz zadržavanje mjesta).
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span>
            Kada se u zoni oslobodi mjesto ili je zakazano spuštanje, dispečer klikom na <strong>„Ponudi termin”</strong> šalje ponudu s rokom važenja od 24h. Tijekom tog vremena mjesto na kopnu i termin dizalice su privremeno rezervirani (Hold).
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2 font-medium">Pozicija</th>
                <th className="pb-2 font-medium">Plovilo</th>
                <th className="pb-2 font-medium">Korisnik</th>
                <th className="pb-2 font-medium">Željena zona</th>
                <th className="pb-2 font-medium">Datum prijave</th>
                <th className="pb-2 font-medium">Status ponude</th>
                <th className="pb-2 font-medium text-right">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Sample / Live rows */}
              <tr className="hover:bg-muted/30">
                <td className="py-3 font-bold text-primary">#1</td>
                <td className="py-3 font-semibold text-foreground">Adriatic Blue (11.2 m, 6.5 t)</td>
                <td className="py-3 text-muted-foreground">Ivan Horvat</td>
                <td className="py-3">
                  <Badge variant="outline" className="text-[10px]">A1 — Arla 1</Badge>
                </td>
                <td className="py-3 text-muted-foreground">01.10.2026.</td>
                <td className="py-3">
                  <Badge variant="secondary" className="text-[10px]">Čeka ponudu</Badge>
                </td>
                <td className="py-3 text-right">
                  <Button
                    size="sm"
                    onClick={() => handleOpenOfferModal({ id: "sample-wl-1", vesselName: "Adriatic Blue" })}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ponudi termin</span>
                  </Button>
                </td>
              </tr>
              <tr className="hover:bg-muted/30">
                <td className="py-3 font-bold text-muted-foreground">#2</td>
                <td className="py-3 font-semibold text-foreground">Sea Spirit (8.5 m, 3.8 t)</td>
                <td className="py-3 text-muted-foreground">Marko Maric</td>
                <td className="py-3">
                  <Badge variant="outline" className="text-[10px]">SZ — Servisna</Badge>
                </td>
                <td className="py-3 text-muted-foreground">03.10.2026.</td>
                <td className="py-3">
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                    Ponuda poslana (ističe za 18h)
                  </Badge>
                </td>
                <td className="py-3 text-right">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled>
                    <Clock className="w-3 h-3" />
                    <span>Ponuda aktivna</span>
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Offer Modal */}
      <Dialog open={offerModalOpen} onOpenChange={setOfferModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Ponuda termina s liste čekanja</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Zadržite mjesto na kopnu i termin dizalice za kandidata.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSendOffer} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Odredišna zona na kopnu</Label>
              <Select value={offerZoneId} onValueChange={setOfferZoneId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Odaberite zonu" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.zoneId} value={z.zoneId}>
                      {z.zoneCode} — {z.zoneName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Dodijeljena dizalica</Label>
              <Select value={offerCraneId} onValueChange={setOfferCraneId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Odaberite dizalicu" />
                </SelectTrigger>
                <SelectContent>
                  {cranes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Datum</Label>
                <Input
                  type="date"
                  value={offerDate}
                  onChange={(e) => setOfferDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Od</Label>
                <Input
                  type="time"
                  value={offerStartTime}
                  onChange={(e) => setOfferStartTime(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Do</Label>
                <Input
                  type="time"
                  value={offerEndTime}
                  onChange={(e) => setOfferEndTime(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Rok važenja ponude (Hold)</Label>
              <Select value={offerHours.toString()} onValueChange={(val) => setOfferHours(Number(val))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12 sati</SelectItem>
                  <SelectItem value="24">24 sata (standardno)</SelectItem>
                  <SelectItem value="48">48 sati</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOfferModalOpen(false)}>
                Odustani
              </Button>
              <Button type="submit" size="sm" disabled={createOfferMutation.isPending}>
                {createOfferMutation.isPending ? "Slanje..." : "Pošalji ponudu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
