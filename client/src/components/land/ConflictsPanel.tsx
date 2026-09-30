import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConflictItem {
  id: string;
  severity: "blocking" | "warning";
  code: string;
  message: string;
  spotId?: string;
  spotCode?: string;
  reservationIds?: string[];
  title?: string;
  description?: string;
  time?: string;
  resolutionHint?: string;
}

interface ConflictsPanelProps {
  conflicts: ConflictItem[];
  minimumProjectedFreeSpots?: number;
  firstDeficitAt?: Date | string | null;
  onResolve?: (conflict: ConflictItem) => void;
  className?: string;
}

export function ConflictsPanel({
  conflicts,
  minimumProjectedFreeSpots = 0,
  firstDeficitAt,
  onResolve,
  className,
}: ConflictsPanelProps) {
  const [filter, setFilter] = useState<"ALL" | "BLOCKING" | "WARNING">("ALL");

  const blockingConflicts = conflicts.filter((c) => c.severity === "blocking");
  const warningConflicts = conflicts.filter((c) => c.severity === "warning");

  const filteredConflicts =
    filter === "BLOCKING"
      ? blockingConflicts
      : filter === "WARNING"
      ? warningConflicts
      : conflicts;

  const hasDeficit = minimumProjectedFreeSpots < 0;

  return (
    <Card className={cn("border border-border/80 shadow-sm", className)}>
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "p-2 rounded-lg",
                blockingConflicts.length > 0
                  ? "bg-destructive/15 text-destructive"
                  : warningConflicts.length > 0
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {blockingConflicts.length > 0 ? (
                <ShieldAlert className="w-5 h-5" />
              ) : warningConflicts.length > 0 ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Status kapaciteta i operativni konflikti
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {conflicts.length === 0
                  ? "Nema zabilježenih operativnih preklapanja ni deficita kapaciteta."
                  : `Pronađeno ${conflicts.length} stavki (${blockingConflicts.length} kritičnih, ${warningConflicts.length} upozorenja)`}
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border",
                hasDeficit
                  ? "bg-destructive/10 text-destructive border-destructive/30"
                  : "bg-muted/50 text-foreground border-border"
              )}
            >
              <span className="text-muted-foreground mr-1.5">Min. slobodno:</span>
              <span className="font-bold">{minimumProjectedFreeSpots}</span>
              {firstDeficitAt && (
                <span className="ml-1 text-[11px] opacity-80">
                  (deficit u {new Date(firstDeficitAt).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })})
                </span>
              )}
            </div>

            {/* Filter Tabs */}
            {conflicts.length > 0 && (
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
                <button
                  type="button"
                  onClick={() => setFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    filter === "ALL"
                      ? "bg-background text-foreground shadow-xs font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Svi ({conflicts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("BLOCKING")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    filter === "BLOCKING"
                      ? "bg-destructive text-destructive-foreground shadow-xs font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Kritični ({blockingConflicts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("WARNING")}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    filter === "WARNING"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Upozorenja ({warningConflicts.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-3 pb-3">
        {filteredConflicts.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Svi resursi su uravnoteženi. Nema detektiranih konflikata za odabrani kriterij.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConflicts.map((c) => {
              const isBlocking = c.severity === "blocking";
              return (
                <div
                  key={c.id}
                  className={cn(
                    "p-3 rounded-lg border text-sm flex flex-col md:flex-row md:items-center justify-between gap-3",
                    isBlocking
                      ? "bg-destructive/5 border-destructive/30 text-destructive-foreground dark:bg-destructive/10"
                      : "bg-amber-50/70 border-amber-200/80 text-amber-950 dark:bg-amber-950/20 dark:border-amber-800/50 dark:text-amber-200"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {isBlocking ? (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={isBlocking ? "destructive" : "outline"}
                          className={cn(
                            "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0",
                            !isBlocking &&
                              "border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-900/30"
                          )}
                        >
                          {isBlocking ? "Blokirajući konflikt" : "Upozorenje"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                          {c.code}
                        </Badge>
                        {c.spotCode && (
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                            {c.spotCode}
                          </Badge>
                        )}
                        {c.time && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {c.time}
                          </span>
                        )}
                        <span className="font-semibold text-foreground text-xs">
                          {c.title || c.message}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {c.description || c.message}
                      </p>
                      {c.resolutionHint && (
                        <p className="text-[11px] font-medium text-foreground/80 mt-1">
                          Preporuka: {c.resolutionHint}
                        </p>
                      )}
                    </div>
                  </div>

                  {onResolve && (
                    <Button
                      size="sm"
                      variant={isBlocking ? "destructive" : "outline"}
                      className="shrink-0 h-8 text-xs gap-1.5"
                      onClick={() => onResolve(c)}
                    >
                      <span>Riješi</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
