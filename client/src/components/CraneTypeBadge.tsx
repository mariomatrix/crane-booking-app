import { Badge } from "@/components/ui/badge";

const typeLabels: Record<string, string> = {
  tower: "Tower",
  mobile: "Mobile",
  crawler: "Crawler",
  overhead: "Overhead",
  telescopic: "Telescopic",
  loader: "Loader",
  other: "Other",
};

export function CraneTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="font-normal text-xs">
      {typeLabels[type] ?? type}
    </Badge>
  );
}
