import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

interface ReservationChatProps {
    reservationId: string;
    /** Auto-refetch interval in ms (0 = disabled) */
    pollInterval?: number;
}

export function ReservationChat({ reservationId, pollInterval = 30000 }: ReservationChatProps) {
    const { user } = useAuth();
    const [body, setBody] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: messages = [], isLoading, refetch } = trpc.message.list.useQuery(
        { reservationId },
        {
            refetchInterval: pollInterval || false,
        }
    );

    const sendMutation = trpc.message.send.useMutation({
        onSuccess: () => {
            setBody("");
            refetch();
        },
        onError: (err) => toast.error(err.message),
    });

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length]);

    const handleSend = () => {
        const trimmed = body.trim();
        if (!trimmed) return;
        sendMutation.mutate({ reservationId, body: trimmed });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Messages area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-3 p-3 min-h-[200px] max-h-[400px]"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                        <p className="text-sm">Nema poruka. Započnite razgovor.</p>
                    </div>
                ) : (
                    messages.map((msg: any) => {
                        const isMe = msg.senderId === user?.id;
                        const isStaff = msg.senderRole === "admin" || msg.senderRole === "operator";
                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${isMe
                                            ? "bg-primary text-primary-foreground rounded-br-md"
                                            : isStaff
                                                ? "bg-blue-100 dark:bg-blue-900/30 text-foreground rounded-bl-md"
                                                : "bg-muted text-foreground rounded-bl-md"
                                        }`}
                                >
                                    {!isMe && (
                                        <div className="text-xs font-medium mb-1 opacity-70">
                                            {msg.senderName || "Korisnik"}
                                            {isStaff && " (Marina)"}
                                        </div>
                                    )}
                                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                    <div className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                        {new Date(msg.createdAt).toLocaleString("hr-HR", {
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input area */}
            <div className="border-t p-3">
                <div className="flex gap-2">
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Napišite poruku..."
                        className="min-h-[40px] max-h-[100px] resize-none"
                        rows={1}
                    />
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!body.trim() || sendMutation.isPending}
                        className="shrink-0 self-end"
                    >
                        {sendMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
