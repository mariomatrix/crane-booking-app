export type ReservationStatus =
  | "pending"
  | "waitlisted"
  | "approved"
  | "in_progress"
  | "completed"
  | "not_performed"
  | "rejected"
  | "cancelled";

export interface StatusContractItem {
  status: ReservationStatus;
  badgeLabel: string;
  contextLabel: string;
  stepperLabel?: string;
  colorHex: string;
  badgeClassName: string;
  description: string;
}

export const RESERVATION_STATUS_CONTRACT: Record<ReservationStatus, StatusContractItem> = {
  pending: {
    status: "pending",
    badgeLabel: "Na čekanju",
    contextLabel: "Zahtjev na čekanju",
    stepperLabel: "Zahtjev",
    colorHex: "#eab308", // Yellow 500
    badgeClassName: "status-badge-pending border-0 font-medium",
    description: "Zahtjev je zaprimljen i čeka administrativnu obradu i dodjelu termina.",
  },
  waitlisted: {
    status: "waitlisted",
    badgeLabel: "Lista čekanja",
    contextLabel: "Na listi čekanja za suhi vez",
    stepperLabel: "Lista čekanja",
    colorHex: "#d97706", // Amber 600
    badgeClassName: "bg-amber-600 text-white dark:bg-amber-600 dark:text-white border-0 font-medium",
    description: "Zahtjev se nalazi na listi čekanja zbog popunjenosti kopnenih kapaciteta ili termina.",
  },
  approved: {
    status: "approved",
    badgeLabel: "Odobreno",
    contextLabel: "Potvrđen termin",
    stepperLabel: "Potvrđeno",
    colorHex: "#16a34a", // Green 600
    badgeClassName: "status-badge-approved border-0 font-medium",
    description: "Zahtjev je odobren, a operativni termin dizalice je potvrđen.",
  },
  in_progress: {
    status: "in_progress",
    badgeLabel: "U tijeku",
    contextLabel: "Operacija u tijeku",
    stepperLabel: "U tijeku",
    colorHex: "#8b5cf6", // Violet 500
    badgeClassName: "bg-violet-600 text-white dark:bg-violet-600 dark:text-white border-0 font-medium",
    description: "Dizanje ili spuštanje plovila trenutno je u tijeku na terenu.",
  },
  completed: {
    status: "completed",
    badgeLabel: "Završeno",
    contextLabel: "Operacija završena",
    stepperLabel: "Završeno",
    colorHex: "#2563eb", // Blue 600
    badgeClassName: "bg-blue-600 text-white dark:bg-blue-600 dark:text-white border-0 font-medium",
    description: "Operacija je uspješno provedena i evidentirana.",
  },
  not_performed: {
    status: "not_performed",
    badgeLabel: "Nije izvedeno",
    contextLabel: "Operacija nije izvedena",
    stepperLabel: "Nije izvedeno",
    colorHex: "#f43f5e", // Rose 500
    badgeClassName: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-medium",
    description: "Termin je bio potvrđen, ali operacija nije izvedena na dan termina.",
  },
  rejected: {
    status: "rejected",
    badgeLabel: "Odbijeno",
    contextLabel: "Zahtjev odbijen",
    stepperLabel: "Odbijeno",
    colorHex: "#dc2626", // Red 600
    badgeClassName: "status-badge-rejected border-0 font-medium",
    description: "Zahtjev za rezervaciju je odbijen.",
  },
  cancelled: {
    status: "cancelled",
    badgeLabel: "Otkazano",
    contextLabel: "Termin otkazan",
    stepperLabel: "Otkazano",
    colorHex: "#64748b", // Slate 500
    badgeClassName: "status-badge-cancelled border-0 font-medium",
    description: "Rezervacija ili termin su otkazani od strane korisnika ili dispečera.",
  },
};

export function getStatusContract(status: string | null | undefined): StatusContractItem {
  if (status && status in RESERVATION_STATUS_CONTRACT) {
    return RESERVATION_STATUS_CONTRACT[status as ReservationStatus];
  }
  return {
    status: (status as ReservationStatus) || "pending",
    badgeLabel: status || "Nepoznato",
    contextLabel: `Status: ${status || "Nepoznato"}`,
    colorHex: "#94a3b8",
    badgeClassName: "bg-muted text-muted-foreground border-0 font-medium",
    description: "Nepoznat ili neevidentiran status rezervacije.",
  };
}
