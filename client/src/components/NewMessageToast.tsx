import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export function NewMessageToast() {
    const { user } = useAuth();
    const lastCount = useRef<number | null>(null);

    const { data } = trpc.message.unreadCount.useQuery(undefined, {
        enabled: !!user,
        refetchInterval: 15000, // Check every 15 seconds
    });

    useEffect(() => {
        if (data?.count !== undefined) {
            if (lastCount.current !== null && data.count > lastCount.current) {
                toast("Nova poruka", {
                    description: `Imate ${data.count} nepročitanih poruka.`,
                    icon: <MessageSquare className="h-4 w-4 text-primary" />,
                    action: {
                        label: "Pogledaj",
                        onClick: () => {
                            if (user?.role === "admin" || user?.role === "operator") {
                                window.location.href = "/admin/reservations?status=all";
                            } else {
                                window.location.href = "/my-reservations";
                            }
                        },
                    },
                });
            }
            lastCount.current = data.count;
        }
    }, [data?.count, user?.role]);

    return null;
}
