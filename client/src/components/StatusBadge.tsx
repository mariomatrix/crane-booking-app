import { Badge } from "@/components/ui/badge";

type Status = "pending" | "approved" | "rejected" | "cancelled";

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "status-badge-pending border-0 font-medium",
  },
  approved: {
    label: "Approved",
    className: "status-badge-approved border-0 font-medium",
  },
  rejected: {
    label: "Rejected",
    className: "status-badge-rejected border-0 font-medium",
  },
  cancelled: {
    label: "Cancelled",
    className: "status-badge-cancelled border-0 font-medium",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as Status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground border-0",
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
