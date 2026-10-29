import { Router, Request, Response } from "express";
import {
  generateSingleReservationIcs,
  generateUserCalendarFeedIcs,
  generateOperatorCalendarFeedIcs,
  verifyReservationToken,
  verifyFeedToken,
} from "../services/icalService";

const icalRouter = Router();

/**
 * GET /api/calendar/reservation/:id.ics?token=...
 * Downloads an .ics calendar event for a single reservation.
 */
icalRouter.get("/reservation/:id.ics", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id || "";
    const reservationId = rawId.replace(/\.ics$/i, "");
    const token = String(req.query.token || "");

    if (!verifyReservationToken(reservationId, token)) {
      res.status(403).send("Neispravan sigurnosni token za kalendarski zapis.");
      return;
    }

    const result = await generateSingleReservationIcs(reservationId);
    if (!result) {
      res.status(404).send("Rezervacija ili zakazani termin nije pronađen.");
      return;
    }

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Cache-Control", "no-cache");
    res.status(200).send(result.content);
  } catch (err) {
    console.error("[iCal] Failed to generate single reservation .ics:", err);
    res.status(500).send("Greška pri generiranju .ics datoteke.");
  }
});

/**
 * GET /api/calendar/feed.ics?userId=...&scope=user|operator&craneId=all|<uuid>&token=...
 * Live iCalendar subscription feed for Google Calendar, Apple Calendar, and Outlook.
 */
icalRouter.get("/feed.ics", async (req: Request, res: Response) => {
  try {
    const userId = String(req.query.userId || "");
    const scope = (req.query.scope === "operator" ? "operator" : "user") as "user" | "operator";
    const craneId = String(req.query.craneId || "all");
    const token = String(req.query.token || "");

    if (!userId || !verifyFeedToken(userId, scope, craneId, token)) {
      res.status(403).send("Neispravan pretplatni token za kalendar.");
      return;
    }

    const content =
      scope === "operator"
        ? await generateOperatorCalendarFeedIcs({ craneId })
        : await generateUserCalendarFeedIcs(userId);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="psd-spinut-${scope}-${craneId}.ics"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(content);
  } catch (err) {
    console.error("[iCal] Failed to generate calendar feed .ics:", err);
    res.status(500).send("Greška pri generiranju kalendarskog feeda.");
  }
});

export default icalRouter;
