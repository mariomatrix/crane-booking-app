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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, Plus, Calendar, Clock, BarChart3, Activity, Wrench, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";

export default function AdminCraneOps() {
  const { lang } = useLang();
  const isHr = lang === "hr";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCraneId, setSelectedCraneId] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Manual log state
  const [craneId, setCraneId] = useState("");
  const [operationType, setOperationType] = useState("lift");
  const [startDateStr, setStartDateStr] = useState("");
  const [durationMin, setDurationMin] = useState("30");
  const [note, setNote] = useState("");

  const utils = trpc.useUtils();

  const { data: stats = [], isLoading: statsLoading } = trpc.craneOps.stats.useQuery();
  const { data: logsRes, isLoading: logsLoading } = trpc.craneOps.listByCrane.useQuery({
    craneId: selectedCraneId === "all" ? undefined : selectedCraneId,
    page,
    pageSize: 25,
  });
  const logs = logsRes?.data || [];
  const totalLogs = logsRes?.total || 0;

  const { data: cranes = [] } = trpc.crane.list.useQuery();

  const logMutation = trpc.craneOps.log.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Operacija dizalice je uspješno zabilježena." : "Crane operation successfully logged.");
      utils.craneOps.listByCrane.invalidate();
      utils.craneOps.stats.invalidate();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setCraneId("");
    setOperationType("lift");
    setStartDateStr("");
    setDurationMin("30");
    setNote("");
  };

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!craneId || !startDateStr || !durationMin) {
      toast.error(isHr ? "Popunite sva obavezna polja." : "Please fill all required fields.");
      return;
    }

    const start = new Date(startDateStr);
    const end = new Date(start.getTime() + Number(durationMin) * 60000);

    logMutation.mutate({
      craneId,
      operationType,
      startTime: start,
      endTime: end,
      durationMinutes: Number(durationMin),
      note: note || undefined,
    });
  };

  const getOpBadge = (opType: string) => {
    switch (opType) {
      case "lift":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">{isHr ? "Vađenje" : "Lift"}</Badge>;
      case "lower":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">{isHr ? "Spuštanje" : "Lower"}</Badge>;
      case "move":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">{isHr ? "Premještanje" : "Move"}</Badge>;
      case "maintenance":
        return <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">{isHr ? "Održavanje" : "Maintenance"}</Badge>;
      default:
        return <Badge variant="outline">{opType}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isHr ? "Dnevnik rada dizalica" : "Crane Operation Log"}</h2>
          <p className="text-sm text-muted-foreground">
            {isHr ? "Pratite statistike rada dizalica i pregledavajte povijest operacija." : "Monitor crane utilization statistics and view operation logs."}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/95 text-white rounded-xl shadow-md">
          <Plus className="h-4 w-4 mr-2" />
          {isHr ? "Zabilježi rad" : "Log Operation"}
        </Button>
      </div>

      {/* Crane Stats Section */}
      {statsLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => (
            <Card key={stat.id} className="rounded-2xl border-muted shadow-sm hover:shadow transition-all overflow-hidden">
              <CardHeader className="pb-2 border-b bg-muted/10">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>{stat.name}</span>
                  <Badge variant={stat.status === "active" ? "default" : "destructive"}>
                    {stat.status === "active" ? (isHr ? "Aktivna" : "Active") : (isHr ? "Servis" : "Maintenance")}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">{stat.location || "Marina Spinut"}</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {isHr ? "Radni sati" : "Work Hours"}
                  </div>
                  <div className="text-xl font-bold text-primary">{stat.totalHours} h</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {isHr ? "Operacije" : "Operations"}
                  </div>
                  <div className="text-xl font-bold">{stat.opsCount}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Operations List */}
      <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold">{isHr ? "Povijest operacija" : "Operation History"}</CardTitle>
              <CardDescription>{isHr ? "Popis svih zabilježenih podizanja, spuštanja i servisa." : "Chronological history of lifts, launches and maintenance."}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap text-muted-foreground">{isHr ? "Filtriraj po dizalici:" : "Filter by crane:"}</Label>
              <Select value={selectedCraneId} onValueChange={(val) => { setSelectedCraneId(val); setPage(1); }}>
                <SelectTrigger className="w-[180px] h-8 rounded-lg text-xs">
                  <SelectValue placeholder={isHr ? "Sve dizalice" : "All cranes"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isHr ? "Sve dizalice" : "All cranes"}</SelectItem>
                  {cranes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {isHr ? "Nema zabilježenih operacija." : "No operations logged."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isHr ? "Dizalica" : "Crane"}</TableHead>
                  <TableHead>{isHr ? "Operacija" : "Operation"}</TableHead>
                  <TableHead>{isHr ? "Početak" : "Start Time"}</TableHead>
                  <TableHead>{isHr ? "Trajanje" : "Duration"}</TableHead>
                  <TableHead>{isHr ? "Operater" : "Operator"}</TableHead>
                  <TableHead>{isHr ? "Napomena" : "Note"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-semibold text-sm">{log.crane.name}</TableCell>
                    <TableCell>{getOpBadge(log.operationType)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatAppDate(log.startTime)}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-xs">{log.durationMinutes} min</TableCell>
                    <TableCell className="text-xs">{log.operator?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={log.note || ""}>
                      {log.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalLogs > 25 && (
            <div className="flex justify-end items-center gap-2 p-4 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1} 
                onClick={() => setPage(page - 1)}
              >
                {isHr ? "Prethodna" : "Previous"}
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {isHr ? `Stranica ${page} od ${Math.ceil(totalLogs / 25)}` : `Page ${page} of ${Math.ceil(totalLogs / 25)}`}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page * 25 >= totalLogs} 
                onClick={() => setPage(page + 1)}
              >
                {isHr ? "Sljedeća" : "Next"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Operation Logging Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {isHr ? "Zabilježi operaciju dizalice" : "Log Crane Operation"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{isHr ? "Dizalica" : "Crane"} *</Label>
              <Select value={craneId} onValueChange={setCraneId}>
                <SelectTrigger><SelectValue placeholder={isHr ? "Odaberite dizalicu" : "Select crane"} /></SelectTrigger>
                <SelectContent>
                  {cranes.filter(c => c.craneStatus === "active").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isHr ? "Tip operacije" : "Operation Type"} *</Label>
                <Select value={operationType} onValueChange={setOperationType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lift">{isHr ? "Vađenje (Lift)" : "Haul Out (Lift)"}</SelectItem>
                    <SelectItem value="lower">{isHr ? "Spuštanje (Lower)" : "Launch (Lower)"}</SelectItem>
                    <SelectItem value="move">{isHr ? "Premještanje (Move)" : "Move"}</SelectItem>
                    <SelectItem value="maintenance">{isHr ? "Održavanje (Maintenance)" : "Maintenance"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{isHr ? "Trajanje (minuta)" : "Duration (minutes)"} *</Label>
                <Input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Vrijeme početka" : "Start Time"} *</Label>
              <Input type="datetime-local" value={startDateStr} onChange={e => setStartDateStr(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Napomena" : "Note"}</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder={isHr ? "Opis zahvata..." : "Operation details..."} rows={3} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" disabled={logMutation.isPending || !craneId || !startDateStr}>
                {logMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Spremi" : "Log"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
