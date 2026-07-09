import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListOrdered, Loader2, ArrowUp, ArrowDown, UserPlus, CheckCircle, XCircle, Send, Ban, RefreshCw, Calendar } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";

export default function AdminLandWaiting() {
  const { lang } = useLang();
  const isHr = lang === "hr";
  
  // Waitlist add dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [vesselId, setVesselId] = useState("");
  const [preferredZoneId, setPreferredZoneId] = useState("");
  const [note, setNote] = useState("");

  // Assign dialog states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignEntryId, setAssignEntryId] = useState<string | null>(null);
  const [assignZoneId, setAssignZoneId] = useState("");
  const [assignSpotNumber, setAssignSpotNumber] = useState("");

  // Direct assign (Bypass / calendar schedule) states
  const [directAssignDialogOpen, setDirectAssignDialogOpen] = useState(false);
  const [directAssignEntry, setDirectAssignEntry] = useState<any | null>(null);
  const [directCraneId, setDirectCraneId] = useState("");
  const [directDate, setDirectDate] = useState<Date | undefined>(undefined);
  const [directTime, setDirectTime] = useState("08:00");
  const [directDuration, setDirectDuration] = useState("60");
  const [directAdminNote, setDirectAdminNote] = useState("");

  const utils = trpc.useUtils();

  const { data: waiting = [], isLoading: waitingLoading } = trpc.landWaiting.listAll.useQuery();
  const { data: zones = [] } = trpc.landZone.list.useQuery();
  const { data: cranes = [] } = trpc.crane.list.useQuery();
  const { data: usersListRes } = trpc.user.list.useQuery({ pageSize: 1000 });
  const usersList = usersListRes?.data || [];

  const { data: userVessels = [], isLoading: vesselsLoading } = trpc.vessel.listByUser.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const addMutation = trpc.landWaiting.add.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Korisnik je dodan na listu čekanja." : "User successfully added to waitlist.");
      utils.landWaiting.listAll.invalidate();
      setAddDialogOpen(false);
      resetAddForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const offerMutation = trpc.landWaiting.offer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Ponuda je uspješno poslana korisniku." : "Offer successfully sent.");
      utils.landWaiting.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const declineMutation = trpc.landWaiting.declineOffer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Zabilježeno je odbijanje ponude." : "Vessel decline recorded.");
      utils.landWaiting.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMutation = trpc.landWaiting.remove.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Zahtjev je uklonjen s liste." : "Waitlist entry cancelled.");
      utils.landWaiting.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const assignMutation = trpc.landWaiting.assignFromOffer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Mjesto je uspješno dodijeljeno (boravak započet)." : "Dry berth successfully assigned.");
      utils.landWaiting.listAll.invalidate();
      utils.landZone.list.invalidate();
      setAssignDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const directAssignMutation = trpc.landWaiting.directAssign.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Uspješno odobreno i raspoređeno na kalendar." : "Successfully approved and scheduled.");
      utils.landWaiting.listAll.invalidate();
      utils.landZone.list.invalidate();
      setDirectAssignDialogOpen(false);
      setDirectCraneId("");
      setDirectDate(undefined);
      setDirectTime("08:00");
      setDirectDuration("60");
      setDirectAdminNote("");
    },
    onError: (error) => toast.error(error.message),
  });

  const reorderMutation = trpc.landWaiting.reorder.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Redoslijed liste je uspješno spremljen." : "Waitlist reordered.");
      utils.landWaiting.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetAddForm = () => {
    setUserId("");
    setVesselId("");
    setPreferredZoneId("");
    setNote("");
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const nextList = [...waiting];
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= nextList.length) return;
    
    // Swap items
    const temp = nextList[index];
    nextList[index] = nextList[swapWith];
    nextList[swapWith] = temp;

    // Trigger reorder with ids
    reorderMutation.mutate(nextList.map(item => item.id));
  };

  const openAssign = (entry: any) => {
    setAssignEntryId(entry.id);
    setAssignZoneId(entry.preferredZoneId || "");
    setAssignSpotNumber("");
    setAssignDialogOpen(true);
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignEntryId || !assignZoneId) {
      toast.error(isHr ? "Odaberite zonu." : "Select a zone.");
      return;
    }
    assignMutation.mutate({
      id: assignEntryId,
      zoneId: assignZoneId,
      spotNumber: assignSpotNumber ? Number(assignSpotNumber) : undefined,
    });
  };

  const handleDirectAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directAssignEntry || !directCraneId || !directDate || !directTime) {
      toast.error(isHr ? "Molimo popunite sva polja." : "Please fill in all fields.");
      return;
    }
    const [hours, minutes] = directTime.split(":").map(Number);
    const scheduledStart = new Date(directDate);
    scheduledStart.setHours(hours, minutes, 0, 0);

    directAssignMutation.mutate({
      id: directAssignEntry.id,
      craneId: directCraneId,
      scheduledStart,
      durationMin: Number(directDuration),
      adminNote: directAdminNote || undefined,
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error(isHr ? "Korisnik je obavezan." : "User is required.");
      return;
    }
    addMutation.mutate({
      userId,
      vesselId: vesselId || undefined,
      preferredZoneId: preferredZoneId || undefined,
      note: note || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{isHr ? "Čeka" : "Waiting"}</Badge>;
      case "offered":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">{isHr ? "Ponuda poslana" : "Offered"}</Badge>;
      case "declined":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{isHr ? "Odbio ponudu" : "Declined"}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isHr ? "Lista čekanja za kopno" : "Dry Berth Waitlist"}</h2>
          <p className="text-sm text-muted-foreground">
            {isHr ? "Upravljajte FIFO listom čekanja korisnika za suhi vez." : "Manage the FIFO waitlist of users waiting for dry berth slots."}
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="bg-primary hover:bg-primary/95 text-white rounded-xl shadow-md">
          <UserPlus className="h-4 w-4 mr-2" />
          {isHr ? "Dodaj na listu" : "Add to List"}
        </Button>
      </div>

      <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {waitingLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : waiting.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListOrdered className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {isHr ? "Trenutno nema korisnika na listi čekanja." : "No entries on the waitlist."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>{isHr ? "Korisnik" : "User"}</TableHead>
                  <TableHead>{isHr ? "Plovilo" : "Vessel"}</TableHead>
                  <TableHead>{isHr ? "Preferirana zona" : "Preferred Zone"}</TableHead>
                  <TableHead>{isHr ? "Status" : "Status"}</TableHead>
                  <TableHead className="text-center">{isHr ? "Odbijanja" : "Declines"}</TableHead>
                  <TableHead>{isHr ? "Dodano" : "Added At"}</TableHead>
                  <TableHead className="text-right">{isHr ? "Akcije" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting.map((entry, idx) => (
                  <TableRow key={entry.id} className={entry.status === "offered" ? "bg-blue-50/10" : ""}>
                    <TableCell className="font-semibold text-center text-muted-foreground text-sm">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm">{entry.user.name || "Korisnik"}</div>
                      <div className="text-xs text-muted-foreground">{entry.user.email}</div>
                    </TableCell>
                    <TableCell>
                      {entry.vessel ? (
                        <div>
                          <div className="font-medium text-xs">{entry.vessel.name}</div>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1">{entry.vessel.registration}</Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.preferredZone ? (
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10">
                          {entry.preferredZone.name} ({entry.preferredZone.code})
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{isHr ? "Bilo koja" : "Any"}</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell className="text-center font-medium">
                      <span className={entry.declineCount >= 2 ? "text-destructive font-bold" : ""}>
                        {entry.declineCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatAppDate(entry.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Reorder Buttons */}
                        <div className="flex flex-col gap-0.5 mr-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded-md hover:bg-accent" 
                            disabled={idx === 0 || reorderMutation.isPending}
                            onClick={() => handleMove(idx, "up")}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded-md hover:bg-accent" 
                            disabled={idx === waiting.length - 1 || reorderMutation.isPending}
                            onClick={() => handleMove(idx, "down")}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Custom status actions */}
                        {entry.status === "waiting" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => offerMutation.mutate({ id: entry.id })}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            {isHr ? "Ponudi" : "Offer"}
                          </Button>
                        )}

                        {entry.status === "offered" && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              onClick={() => openAssign(entry)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {isHr ? "Dodijeli" : "Assign"}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 rounded-lg text-amber-600 border-amber-200 hover:bg-amber-50"
                              onClick={() => {
                                if (confirm(isHr ? "Označiti da je korisnik odbio ponudu?" : "Mark as declined by user?")) {
                                  declineMutation.mutate({ id: entry.id });
                                }
                              }}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              {isHr ? "Odbio" : "Decline"}
                            </Button>
                          </>
                        )}

                        {entry.status === "declined" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => offerMutation.mutate({ id: entry.id })}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {isHr ? "Ponudi opet" : "Offer again"}
                          </Button>
                        )}

                        {entry.reservationId && (entry.status === "waiting" || entry.status === "offered" || entry.status === "declined") && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 rounded-lg text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => {
                              setDirectAssignEntry(entry);
                              setDirectCraneId("");
                              setDirectDate(undefined);
                              setDirectTime("08:00");
                              setDirectDuration("60");
                              setDirectAdminNote("");
                              setDirectAssignDialogOpen(true);
                            }}
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            {isHr ? "Ugovori" : "Schedule"}
                          </Button>
                        )}

                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(isHr ? "Ukloniti s liste čekanja?" : "Remove from waitlist?")) {
                              removeMutation.mutate({ id: entry.id });
                            }
                          }}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {isHr ? "Dodaj na listu čekanja" : "Add to Waitlist"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{isHr ? "Korisnik (Vlasnik)" : "Owner"} *</Label>
              <UserSearchCombobox
                users={usersList as any}
                value={userId}
                onChange={setUserId}
                placeholder={isHr ? "Odaberite korisnika..." : "Select user..."}
              />
            </div>
            
            <div className="space-y-1">
              <Label>{isHr ? "Plovilo (Opcijski)" : "Vessel (Optional)"}</Label>
              <Select value={vesselId} onValueChange={setVesselId} disabled={!userId || vesselsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    vesselsLoading ? "..." : (isHr ? "Odaberite plovilo" : "Select vessel")
                  } />
                </SelectTrigger>
                <SelectContent>
                  {userVessels.map(v => (
                    <SelectItem key={v.id} value={v.id}>⛵ {v.registration ? `[${v.registration}] ` : ""}{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Preferirana zona (Opcijski)" : "Preferred Zone (Optional)"}</Label>
              <Select value={preferredZoneId} onOpenChange={() => {}} onValueChange={setPreferredZoneId}>
                <SelectTrigger><SelectValue placeholder={isHr ? "Bilo koja" : "Any zone"} /></SelectTrigger>
                <SelectContent>
                  {zones.map(z => (
                    <SelectItem key={z.id} value={z.id}>{z.name} ({z.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" disabled={addMutation.isPending || !userId}>
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Dodaj" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {isHr ? "Dodijeli mjesto na kopnu" : "Assign Land Spot"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{isHr ? "Zona" : "Zone"} *</Label>
              <Select value={assignZoneId} onValueChange={setAssignZoneId}>
                <SelectTrigger><SelectValue placeholder={isHr ? "Odaberite zonu" : "Select zone"} /></SelectTrigger>
                <SelectContent>
                  {zones.map(z => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name} ({z.activeSpots}/{z.totalSpots})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <Label>{isHr ? "Broj mjesta (Opcijski)" : "Spot Number (Optional)"}</Label>
              <Input 
                type="number" 
                placeholder="npr. 12" 
                value={assignSpotNumber} 
                onChange={e => setAssignSpotNumber(e.target.value)} 
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setAssignDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" disabled={assignMutation.isPending || !assignZoneId}>
                {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Potvrdi i dodijeli" : "Confirm & Assign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      {/* Direct assign (Bypass / calendar schedule) dialog */}
      <Dialog open={directAssignDialogOpen} onOpenChange={setDirectAssignDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {isHr ? "Ugovori i odobri dizalicu (Bypass)" : "Direct Schedule & Approve (Bypass)"}
            </DialogTitle>
          </DialogHeader>
          {directAssignEntry && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border text-xs space-y-1 my-2">
              <p><strong>{isHr ? "Klijent:" : "Client:"}</strong> {directAssignEntry.user.name} ({directAssignEntry.user.email})</p>
              <p><strong>{isHr ? "Plovilo:" : "Vessel:"}</strong> {directAssignEntry.vessel?.name || "—"} {directAssignEntry.vessel?.registration ? `[${directAssignEntry.vessel.registration}]` : ""}</p>
              <p><strong>{isHr ? "Preferirana zona:" : "Preferred Zone:"}</strong> {directAssignEntry.preferredZone?.name || (isHr ? "Bilo koja" : "Any")}</p>
            </div>
          )}
          <form onSubmit={handleDirectAssignSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{isHr ? "Datum dizanja" : "Date"} *</Label>
              <Input
                type="date"
                value={directDate ? directDate.toISOString().split("T")[0] : ""}
                onChange={e => setDirectDate(e.target.value ? new Date(e.target.value) : undefined)}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{isHr ? "Vrijeme" : "Time"} *</Label>
                <Input
                  type="time"
                  value={directTime}
                  onChange={e => setDirectTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>{isHr ? "Trajanje (min)" : "Duration (min)"} *</Label>
                <Input
                  type="number"
                  value={directDuration}
                  onChange={e => setDirectDuration(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Dizalica" : "Crane"} *</Label>
              <Select value={directCraneId} onValueChange={setDirectCraneId}>
                <SelectTrigger>
                  <SelectValue placeholder={isHr ? "Odaberite dizalicu" : "Select crane"} />
                </SelectTrigger>
                <SelectContent>
                  {cranes.filter((c: any) => c.craneStatus === "active").map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Napomena" : "Note"}</Label>
              <Input
                value={directAdminNote}
                onChange={e => setDirectAdminNote(e.target.value)}
                placeholder={isHr ? "Administrativna napomena (opcijski)" : "Admin note (optional)"}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setDirectAssignDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" disabled={directAssignMutation.isPending || !directCraneId || !directDate}>
                {directAssignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Ugovori i odobri" : "Schedule & Approve"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
