import { Badge } from "@/components/ui/badge";
import { getStatusContract } from "@/lib/statusContract";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = getStatusContract(status);
  return (
    <Badge variant="outline" className={`${config.badgeClassName} ${className || ""}`.trim()}>
      {config.badgeLabel}
    </Badge>
  );
}
