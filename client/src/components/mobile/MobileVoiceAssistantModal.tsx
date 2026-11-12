import { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Volume2,
  VolumeX,
  Play,
  Check,
  MapPin,
  MessageSquare,
  CreditCard,
  Wind,
  Ship,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

export interface ProposedVoiceAction {
  id: string;
  type:
    | "start_work_order"
    | "complete_work_order"
    | "update_work_order_notes"
    | "assign_land_zone"
    | "add_card_charge"
    | "send_owner_message"
    | "report_stoppage"
    | "resolve_stoppage"
    | "vessel_lookup";
  title: string;
  description: string;
  confidence: number;
  requiresConfirmation: boolean;
  reservationId?: string | null;
  vesselId?: string | null;
  vesselName?: string | null;
  vesselRegistration?: string | null;
  userId?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  spotNumber?: number | null;
  durationMin?: number | null;
  operatorNotes?: string | null;
  messageText?: string | null;
  serviceItemCode?: string | null;
  serviceItemName?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

interface VoiceInterpretResponse {
  modelUsed: string;
  transcript: string;
  spokenResponse: string;
  actions: ProposedVoiceAction[];
  warnings: string[];
}

interface MobileVoiceAssistantModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  selectedDate: string;
  activeReservationId?: string | null;
  activeVesselLabel?: string | null;
  onActionsExecuted: () => void;
}

const EXAMPLE_COMMANDS = [
  "Pokreni radni nalog za brod Balerina ST-4253",
  "Završi dizanje za ST-4253, trajalo 45 minuta, smješten u zonu Arla 3 mjesto 12",
  "Brod ST-4253, pukao mu je krmeni konop, spojili smo ga na struju 2 dana i javi vlasniku",
  "Gdje se nalazi brod ST-4253 i koji je broj mobitela vlasnika?",
  "Obustavi rad svih dizalica zbog jake bure",
];

export function MobileVoiceAssistantModal({
  open,
  onClose,
  token,
  selectedDate,
  activeReservationId,
  activeVesselLabel,
  onActionsExecuted,
}: MobileVoiceAssistantModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>("audio/webm");
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const [interpretResult, setInterpretResult] = useState<VoiceInterpretResponse | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Record<string, boolean>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      stopRecordingInternal();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      setInterpretResult(null);
      setAudioBase64(null);
    }
  }, [open]);

  const speakText = (text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "hr-HR";
      utterance.rate = 1.02;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore TTS errors on unsupported devices
    }
  };

  const stopRecordingInternal = () => {
    setIsRecording(false);
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  };

  const startRecording = async () => {
    setInterpretResult(null);
    setAudioBase64(null);
    audioChunksRef.current = [];

    // 1. Start Web Speech API live transcription if supported (instant visual feedback)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.lang = "hr-HR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: any) => {
          let combined = "";
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0].transcript + " ";
          }
          setTranscript(combined.trim());
        };
        rec.start();
        speechRecRef.current = rec;
      } catch {
        // Web Speech API optional
      }
    }

    // 2. Start MediaRecorder for raw audio capture (sent to Gemini 3.5 Flash-Lite)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        setAudioMimeType(recorder.mimeType || "audio/webm");

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              setAudioBase64(base64data);
            };
            reader.readAsDataURL(blob);
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch {
        if (speechRecRef.current) {
          setIsRecording(true);
        } else {
          toast.error("Mikrofon nije dostupan. Možete upisati naredbu ili odabrati brzi predložak.");
        }
      }
    } else if (speechRecRef.current) {
      setIsRecording(true);
    } else {
      toast.error("Vaš preglednik ne podržava izravno snimanje zvuka.");
    }
  };

  const handleStopAndAnalyze = async () => {
    stopRecordingInternal();
    // Give FileReader 250ms to finalize base64 audio blob if recording just stopped
    setTimeout(() => {
      handleInterpret();
    }, 250);
  };

  const handleInterpret = async (overrideTranscript?: string) => {
    const textToSend = overrideTranscript !== undefined ? overrideTranscript : transcript;
    if (!textToSend.trim() && !audioBase64) {
      toast.error("Izgovorite ili unesite glasovnu bilješku prije obrade.");
      return;
    }

    setIsInterpreting(true);
    try {
      const res = await fetch("/api/mobile/v1/voice/interpret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transcript: textToSend.trim() || undefined,
          audioBase64: overrideTranscript ? undefined : audioBase64 || undefined,
          audioMimeType,
          activeReservationId: activeReservationId || undefined,
          date: selectedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Greška pri analizi glasovne naredbe.");
        return;
      }

      setInterpretResult(data);
      if (data.transcript && !textToSend.trim()) {
        setTranscript(data.transcript);
      }

      const initialChecked: Record<string, boolean> = {};
      (data.actions || []).forEach((a: ProposedVoiceAction) => {
        initialChecked[a.id] = true;
      });
      setSelectedActionIds(initialChecked);

      if (data.spokenResponse) {
        speakText(data.spokenResponse);
      }
    } catch {
      toast.error("Mrežna greška pri komunikaciji s glasovnim asistentom.");
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleExecuteSelected = async () => {
    if (!interpretResult) return;
    const actionsToRun = interpretResult.actions.filter((a) => selectedActionIds[a.id]);
    if (actionsToRun.length === 0) {
      toast.error("Odaberite barem jednu akciju za izvršavanje.");
      return;
    }

    setIsExecuting(true);
    try {
      const res = await fetch("/api/mobile/v1/voice/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ actions: actionsToRun }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Greška pri izvršavanju akcija.");
        return;
      }

      const failed = (data.results || []).filter((r: any) => !r.success);
      const succeeded = (data.results || []).filter((r: any) => r.success);

      if (succeeded.length > 0) {
        const msg = succeeded.map((s: any) => s.message).join(" · ");
        toast.success(`Izvršeno (${succeeded.length}): ${msg}`);
        speakText(`Izvršeno. ${msg}`);
        onActionsExecuted();
      }
      if (failed.length > 0) {
        toast.error(`Neuspješno: ${failed.map((f: any) => f.message).join(", ")}`);
      } else {
        onClose();
      }
    } catch {
      toast.error("Mrežna greška pri izvršavanju akcija.");
    } finally {
      setIsExecuting(false);
    }
  };

  const getActionBadge = (type: ProposedVoiceAction["type"]) => {
    switch (type) {
      case "start_work_order":
        return { label: "Pokretanje naloga", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Play };
      case "complete_work_order":
        return { label: "Završetak operacije", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: Check };
      case "assign_land_zone":
        return { label: "Smještaj na kopno", color: "bg-blue-100 text-blue-800 border-blue-200", icon: MapPin };
      case "add_card_charge":
        return { label: "Zaduženje kartona", color: "bg-amber-100 text-amber-900 border-amber-300", icon: CreditCard };
      case "send_owner_message":
        return { label: "Obavijest vlasniku", color: "bg-purple-100 text-purple-800 border-purple-200", icon: MessageSquare };
      case "report_stoppage":
      case "resolve_stoppage":
        return { label: "Obustava rada", color: "bg-rose-100 text-rose-800 border-rose-200", icon: Wind };
      case "vessel_lookup":
        return { label: "Info o plovilu", color: "bg-slate-100 text-slate-800 border-slate-300", icon: Ship };
      default:
        return { label: "Bilješka", color: "bg-slate-100 text-slate-800 border-slate-200", icon: Sparkles };
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-white border-4 border-indigo-200 rounded-[2rem] p-4 sm:p-5 w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl space-y-3.5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                Glasovni terenski zapisnik
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                  Gemini AI
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {activeVesselLabel
                  ? `Aktivno plovilo: ${activeVesselLabel}`
                  : "Diktirajte nalog, zaduženje struje/opreme ili poruku vlasniku"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title={ttsEnabled ? "Glasovni odgovor uključen" : "Glasovni odgovor isključen"}
            >
              {ttsEnabled ? <Volume2 className="h-4 w-4 text-indigo-600" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Big Push-to-Talk Microphone Button */}
        <div className="flex flex-col items-center justify-center py-2">
          <button
            type="button"
            onClick={isRecording ? handleStopAndAnalyze : startRecording}
            disabled={isInterpreting || isExecuting}
            className={`h-20 w-20 rounded-full flex flex-col items-center justify-center transition-all shadow-lg active:scale-95 ${
              isRecording
                ? "bg-rose-600 hover:bg-rose-700 text-white ring-8 ring-rose-200 animate-pulse"
                : "bg-indigo-600 hover:bg-indigo-700 text-white ring-4 ring-indigo-100"
            }`}
          >
            {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </button>
          <span className="text-xs font-bold mt-2 text-slate-700">
            {isRecording
              ? "🔴 Snimanje u tijeku... Dodirnite za obradu"
              : "Dodirnite mikrofon i izgovorite naredbu"}
          </span>
        </div>

        {/* Editable Transcript Box + Analyze Button */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-700">
              Izgovoreni tekst ili brza terenska bilješka:
            </label>
            {audioBase64 && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                🎵 Audio snimka spremna
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={2}
              placeholder='Npr. "Brod ST-4253, spojili smo ga na struju 2 dana, pukao krmeni konop, javi vlasniku..."'
              className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => handleInterpret()}
              disabled={isInterpreting || (!transcript.trim() && !audioBase64)}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-3 rounded-xl text-xs flex flex-col items-center justify-center gap-1 shrink-0 shadow-xs"
            >
              {isInterpreting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Analiziraj</span>
            </button>
          </div>
        </div>

        {/* Quick Example Chips (when no result yet) */}
        {!interpretResult && !isInterpreting && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Primjeri glasovnih naredbi (dodirnite za isprobavanje):
            </span>
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_COMMANDS.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setTranscript(ex);
                    handleInterpret(ex);
                  }}
                  className="text-left text-[10px] bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 hover:border-indigo-200 px-2 py-1 rounded-lg transition"
                >
                  🎙️ "{ex}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isInterpreting && (
          <div className="flex items-center justify-center gap-2 p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs font-bold text-indigo-800">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            <span>Gemini analizira glasovni zapis i povezuje plovilo s bazom...</span>
          </div>
        )}

        {/* Parsed Action Plan & Confirmation */}
        {interpretResult && (
          <div className="space-y-3 pt-1 border-t border-slate-100">
            {/* Spoken Summary Banner */}
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-indigo-700 font-bold">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI sažetak ({interpretResult.modelUsed})
                </span>
                <button
                  type="button"
                  onClick={() => speakText(interpretResult.spokenResponse)}
                  className="underline hover:text-indigo-950"
                >
                  🔊 Ponovi glasom
                </button>
              </div>
              <p className="text-xs font-semibold text-indigo-950 leading-snug">
                {interpretResult.spokenResponse}
              </p>
            </div>

            {/* Warnings if any */}
            {interpretResult.warnings && interpretResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 space-y-1">
                {interpretResult.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Proposed Actions Checklist */}
            {interpretResult.actions.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-extrabold text-slate-700 block">
                  Predložene akcije u ERP-u ({interpretResult.actions.length}):
                </span>
                {interpretResult.actions.map((act) => {
                  const badge = getActionBadge(act.type);
                  const IconComp = badge.icon;
                  const isChecked = !!selectedActionIds[act.id];
                  return (
                    <label
                      key={act.id}
                      className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                        isChecked
                          ? "bg-white border-indigo-500 shadow-xs"
                          : "bg-slate-50 border-slate-200 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setSelectedActionIds((prev) => ({
                            ...prev,
                            [act.id]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${badge.color}`}
                          >
                            <IconComp className="h-3 w-3" />
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-xs font-extrabold text-slate-900 leading-tight">
                          {act.title}
                        </p>
                        <p className="text-[11px] text-slate-600 leading-snug">
                          {act.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Confirm & Execute Footer */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs"
              >
                Zatvori
              </button>
              {interpretResult.actions.some((a) => a.type !== "vessel_lookup") && (
                <button
                  type="button"
                  onClick={handleExecuteSelected}
                  disabled={
                    isExecuting ||
                    interpretResult.actions.filter((a) => selectedActionIds[a.id]).length === 0
                  }
                  className="flex-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Potvrdi i izvrši odabrano</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
