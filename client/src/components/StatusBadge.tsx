import { Badge } from "@/components/ui/badge";

type Status = "pending" | "approved" | "rejected" | "cancelled" | "completed";

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: {
    label: "Na čekanju",
    className: "status-badge-pending border-0 font-medium",
  },
  approved: {
    label: "Odobreno",
    className: "status-badge-approved border-0 font-medium",
  },
  rejected: {
    label: "Odbijeno",
    className: "status-badge-rejected border-0 font-medium",
  },
  cancelled: {
    label: "Otkazano",
    className: "status-badge-cancelled border-0 font-medium",
  },
  completed: {
    label: "Završeno",
    className: "bg-green-600 text-white dark:bg-green-600 dark:text-white border-0 font-medium",
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

