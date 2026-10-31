import fs from "fs";

const file = "client/src/components/landDispatch/SlotRecommendationDialog.tsx";
let content = fs.readFileSync(file, "utf8");

// 1. handleAssign error check
const oldAssignCheck = 'toast.error("Kapacitet timova je popunjen. Potrebno je označiti dispečerski override posade.");';
const newAssignCheck = `toast.error("Kapacitet ekipa je popunjen. Potrebno je odobriti iznimku uz dodatnu ekipu.");
      return;
    }

    if (teamOverride && teamOverrideReason.trim().length < 3) {
      toast.error("Molimo unesite razlog odobravanja iznimke (najmanje 3 znaka).");`;
content = content.replace(oldAssignCheck, newAssignCheck);

// 2. header description
content = content.replace(
  "Automatizirana preporuka prema nosivosti, afinitetu zona i raspoloživosti 2 tima.",
  "Automatizirana preporuka prema nosivosti, afinitetu zona i raspoloživosti ekipa."
);

// 3. 2/2 tima zauzeto badge
content = content.replace(
  "2/2 tima zauzeto",
  "Zauzete ekipe: {opt.concurrentTeamsInSlot} od {opt.maxConcurrentTeams ?? 2}"
);

// 4. Team Concurrency Override Box
const startIdx = content.indexOf("{/* Team Concurrency Override Box */}");
const endMarker = "Aktiviraj dispečerski override posade";
if (startIdx !== -1 && content.indexOf(endMarker) !== -1) {
  const afterMarkerCRLF = content.indexOf("</div>\r\n                    )}", startIdx);
  const afterMarkerLF = content.indexOf("</div>\n                    )}", startIdx);
  const actualEnd =
    afterMarkerCRLF !== -1
      ? afterMarkerCRLF + "</div>\r\n                    )}".length
      : afterMarkerLF + "</div>\n                    )}".length;

  const newBox = `{/* Team Concurrency Override Box */}
                    {currentOption.requiresTeamOverride && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                            <Users className="w-4 h-4 shrink-0" />
                            <span>Zauzete ekipe: {currentOption.concurrentTeamsInSlot} od {currentOption.maxConcurrentTeams ?? 2}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30 font-medium">
                            Potrebno odobrenje iznimke
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Standardni kapacitet raspoloživih operativnih ekipa u ovom terminu je popunjen. Odobravanje ove iznimke omogućuje angažman dodatne ekipe na terenu uz vašu dispečersku potvrdu i obrazloženje.
                        </p>
                        <div className="text-[10px] text-amber-800/80 dark:text-amber-300/80 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                          <strong>Napomena o ograničenjima:</strong> Ova iznimka mijenja isključivo kapacitet osoblja. Fizička i tehnička ograničenja dizalice (maksimalna nosivost, širina bazena i obustave rada) ne mogu se zaobići iznimkom.
                        </div>
                        <div className="pt-2 space-y-2 border-t border-amber-500/20">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="dialogTeamOverride"
                              checked={teamOverride}
                              onChange={(e) => setTeamOverride(e.target.checked)}
                              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                            />
                            <label htmlFor="dialogTeamOverride" className="text-xs font-semibold cursor-pointer">
                              Odobri iznimku uz dodatnu ekipu
                            </label>
                          </div>
                          {teamOverride && (
                            <div className="space-y-1">
                              <label htmlFor="teamOverrideReasonInput" className="text-[11px] font-medium text-muted-foreground">
                                Razlog odobravanja iznimke *
                              </label>
                              <Input
                                id="teamOverrideReasonInput"
                                value={teamOverrideReason}
                                onChange={(e) => setTeamOverrideReason(e.target.value)}
                                placeholder="Npr. osigurana dodatna ekipa na terenu, preraspodjela posade..."
                                className="h-8 text-xs bg-background"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}`;

  content = content.slice(0, startIdx) + newBox + content.slice(actualEnd);
}

fs.writeFileSync(file, content, "utf8");
console.log("Updated SlotRecommendationDialog.tsx successfully");
