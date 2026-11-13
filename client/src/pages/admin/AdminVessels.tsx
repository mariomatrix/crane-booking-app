import { useEffect, useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Anchor,
  Calendar,
  ExternalLink,
  Layers,
  Loader2,
  Phone,
  Search,
  Ship,
  User,
  X,
} from "lucide-react";

type FilterMode = "all" | "on_land" | "with_upcoming";
type VesselTypeMode = "all" | "jedrilica" | "motorni" | "katamaran" | "ostalo";

const VESSEL_TYPE_LABELS_HR: Record<string, string> = {
  jedrilica: "Jedrilica",
  motorni: "Motorni",
  katamaran: "Katamaran",
  ostalo: "Ostalo",
};

const VESSEL_TYPE_LABELS_EN: Record<string, string> = {
  jedrilica: "Sailboat",
  motorni: "Motorboat",
  katamaran: "Catamaran",
  ostalo: "Other",
};

const RESERVATION_STATUS_HR: Record<string, string> = {
  in_progress: "U tijeku",
  approved: "Odobreno",
  pending: "Na čekanju",
};

function formatCroatianDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminVessels() {
  const { lang } = useLang();
  const isHr = lang === "hr";

  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [vesselType, setVesselType] = useState<VesselTypeMode>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(queryInput.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const { data, isLoading, isFetching } = trpc.vessel.search.useQuery({
    query: debouncedQuery || undefined,
    filter: filterMode,
    vesselType,
    limit: 120,
  });

  const items = data?.items ?? [];
  const totalMatched = data?.totalMatched ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="h-6 w-6 text-primary" />
            {isHr ? "Pretraga brodova" : "Vessels Search"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isHr
              ? "Brzi pregled plovila po registraciji, imenu broda ili vlasniku, uz lokaciju na kopnu i aktivne termine."
              : "Quick read-only lookup of vessels by registration, vessel name or owner."}
          </p>
        </div>

        <Badge variant="secondary" className="self-start sm:self-auto px-3 py-1 text-xs font-medium">
          {isLoading
            ? isHr
              ? "Učitavanje..."
              : "Loading..."
            : isHr
              ? `Prikazano ${items.length} od ${totalMatched} plovila`
              : `Showing ${items.length} of ${totalMatched} vessels`}
        </Badge>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={
                  isHr
                    ? "Pretraži registraciju (npr. ST-5150 ili 5150), ime broda ili vlasnika..."
                    : "Search registration, vessel name or owner..."
                }
                className="pl-9 pr-9"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput("");
                    setDebouncedQuery("");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Očisti pretragu"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="w-full md:w-52">
              <Select
                value={vesselType}
                onValueChange={(val) => setVesselType(val as VesselTypeMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isHr ? "Svi tipovi plovila" : "All vessel types"}</SelectItem>
                  <SelectItem value="jedrilica">{isHr ? "Jedrilica" : "Sailboat"}</SelectItem>
                  <SelectItem value="motorni">{isHr ? "Motorni" : "Motorboat"}</SelectItem>
                  <SelectItem value="katamaran">{isHr ? "Katamaran" : "Catamaran"}</SelectItem>
                  <SelectItem value="ostalo">{isHr ? "Ostalo" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={filterMode === "all" ? "default" : "outline"}
              onClick={() => setFilterMode("all")}
            >
              {isHr ? "Svi brodovi" : "All vessels"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === "on_land" ? "default" : "outline"}
              onClick={() => setFilterMode("on_land")}
              className="gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              {isHr ? "Trenutno na kopnu" : "Currently on land"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === "with_upcoming" ? "default" : "outline"}
              onClick={() => setFilterMode("with_upcoming")}
              className="gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5" />
              {isHr ? "S aktivnim / najavljenim terminom" : "With upcoming reservation"}
            </Button>
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isHr ? "Osvježavanje..." : "Refreshing..."}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{isHr ? "Učitavanje plovila..." : "Loading vessels..."}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 px-4 text-muted-foreground">
              <Ship className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">
                {isHr ? "Nema pronađenih plovila." : "No matching vessels found."}
              </p>
              <p className="text-xs mt-1">
                {isHr
                  ? "Pokušajte unijeti dio registracije bez crtica (npr. 5150) ili prezime vlasnika."
                  : "Try searching by partial registration or owner name."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isHr ? "Plovilo / Registracija" : "Vessel / Registration"}</TableHead>
                    <TableHead>{isHr ? "Tip i dimenzije" : "Type & Dimensions"}</TableHead>
                    <TableHead>{isHr ? "Vlasnik i kontakt" : "Owner & Contact"}</TableHead>
                    <TableHead>{isHr ? "Lokacija na kopnu" : "Land Location"}</TableHead>
                    <TableHead>{isHr ? "Aktivni / idući termin" : "Active / Next Booking"}</TableHead>
                    <TableHead className="text-right">{isHr ? "Karton" : "Card"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((vessel) => {
                    const typeLabel = isHr
                      ? VESSEL_TYPE_LABELS_HR[vessel.type] || vessel.type
                      : VESSEL_TYPE_LABELS_EN[vessel.type] || vessel.type;

                    const dims: string[] = [];
                    if (vessel.lengthM) dims.push(`L ${vessel.lengthM}m`);
                    if (vessel.beamM) dims.push(`B ${vessel.beamM}m`);
                    if (vessel.draftM) dims.push(`T ${vessel.draftM}m`);
                    if (vessel.weightTons) dims.push(`${vessel.weightTons}t`);

                    return (
                      <TableRow key={vessel.id}>
                        <TableCell>
                          <div className="font-semibold text-foreground">{vessel.name}</div>
                          {vessel.registration ? (
                            <Badge variant="outline" className="mt-1 font-mono text-xs">
                              {vessel.registration}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {isHr ? "Bez registracije" : "No registration"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="text-xs font-medium text-foreground">{typeLabel}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {dims.length > 0 ? dims.join(" · ") : "—"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium text-sm">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{vessel.owner.name || "—"}</span>
                          </div>
                          {vessel.owner.phone && (
                            <a
                              href={`tel:${vessel.owner.phone}`}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                            >
                              <Phone className="h-3 w-3" />
                              {vessel.owner.phone}
                            </a>
                          )}
                        </TableCell>

                        <TableCell>
                          {vessel.landOccupancy ? (
                            <div className="space-y-0.5">
                              <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/20">
                                <Anchor className="h-3 w-3 mr-1" />
                                {vessel.landOccupancy.zoneCode}
                                {vessel.landOccupancy.spotNumber
                                  ? ` · #${vessel.landOccupancy.spotNumber}`
                                  : ""}
                              </Badge>
                              <div className="text-[11px] text-muted-foreground">
                                {vessel.landOccupancy.zoneName} · {isHr ? "od" : "since"}{" "}
                                {formatCroatianDate(vessel.landOccupancy.liftedAt)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {isHr ? "Nema boravka na kopnu" : "Not on land"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          {vessel.nextReservation ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-[11px] font-mono">
                                  {vessel.nextReservation.reservationNumber || "REZ"}
                                </Badge>
                                <span className="text-xs font-medium">
                                  {isHr
                                    ? RESERVATION_STATUS_HR[vessel.nextReservation.status] ||
                                      vessel.nextReservation.status
                                    : vessel.nextReservation.status}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatCroatianDate(
                                  vessel.nextReservation.scheduledStart ||
                                    vessel.nextReservation.requestedDate
                                )}
                                {vessel.nextReservation.serviceName
                                  ? ` · ${vessel.nextReservation.serviceName}`
                                  : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Link href={`/admin/users/${vessel.owner.id}/card`}>
                            <Button variant="ghost" size="sm" className="gap-1">
                              <span>{isHr ? "Karton" : "Card"}</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
