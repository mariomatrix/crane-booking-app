import { getDb } from "../db";
import { reservations, users, cranes } from "../../drizzle/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { sendReservationConfirmation, sendReservationRejection, sendWaitingListNotification } from "../_core/email";
import { sendReservationConfirmationSms, sendReservationRejectionSms, sendSms } from "../_core/sms";

export async function processReminders() {
    try {
        const db = await getDb();
        if (!db) return;

        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const windowEnd = new Date(twentyFourHoursFromNow.getTime() + 65 * 60 * 1000);

        const pending = await db.select({
            res: reservations,
            user: users,
            crane: cranes
        })
            .from(reservations)
            .innerJoin(users, eq(reservations.userId, users.id))
            .innerJoin(cranes, eq(reservations.craneId, cranes.id))
            .where(and(
                eq(reservations.status, "approved"),
                eq(reservations.reminderSent, false),
                gte(reservations.scheduledStart, twentyFourHoursFromNow),
                lt(reservations.scheduledStart, windowEnd)
            ));

        for (const { res, user, crane } of pending) {
            const dateStr = res.scheduledStart ? new Date(res.scheduledStart).toLocaleString('hr-HR') : '-';
            const msg = `PODSJETNIK: Vasa rezervacija ${res.reservationNumber} za ${crane.name} je sutra u ${dateStr}.`;

            // Use general SMS for reminders as there's no specific reminder core function
            if (user.phone) await sendSms(user.phone, msg);

            // Track as sent
            await db.update(reservations)
                .set({ reminderSent: true })
                .where(eq(reservations.id, res.id));
        }
    } catch (error) {
        console.error("Failed to process reminders:", error);
    }
}

/**
 * Triggered on manual admin status change
 */
export async function notifyStatusChange(reservationId: string) {
    const db = await getDb();
    if (!db) return;

    const [item] = await db.select({
        res: reservations,
        user: users,
        crane: cranes
    })
        .from(reservations)
        .innerJoin(users, eq(reservations.userId, users.id))
        .innerJoin(cranes, eq(reservations.craneId, cranes.id))
        .where(eq(reservations.id, reservationId));

    if (!item) return;

    const { res, user, crane } = item;

    if (res.status === "approved" && user.email) {
        await sendReservationConfirmation({
            to: user.email,
            userName: user.name || user.firstName || "Korisnik",
            craneName: crane.name,
            startDate: res.scheduledStart ?? new Date(),
            endDate: res.scheduledEnd ?? new Date(),
            craneLocation: crane.location || "-",
            adminNotes: res.adminNote || undefined,
            lang: "hr"
        });
        if (user.phone) {
            await sendReservationConfirmationSms({
                phone: user.phone,
                craneName: crane.name,
                startDate: res.scheduledStart ?? new Date(),
                location: crane.location || "-",
                lang: "hr"
            });
        }
    } else if (res.status === "rejected" && user.email) {
        await sendReservationRejection({
            to: user.email,
            userName: user.name || user.firstName || "Korisnik",
            craneName: crane.name,
            startDate: res.scheduledStart ?? new Date(),
            reason: res.adminNote || undefined,
            lang: "hr"
        });
        if (user.phone) {
            await sendReservationRejectionSms({
                phone: user.phone,
                craneName: crane.name,
                reason: res.adminNote || undefined,
                lang: "hr"
            });
        }
    }
}

export async function notifyWaitingList(craneId: string, dateStr: string) {
    const db = await getDb();
    if (!db) return;

    const { waitingList } = await import("../../drizzle/schema");
    const items = await db.select({
        w: waitingList,
        user: users,
        crane: cranes
    })
        .from(waitingList)
        .innerJoin(users, eq(waitingList.userId, users.id))
        .innerJoin(cranes, eq(waitingList.craneId, cranes.id))
        .where(and(
            eq(waitingList.craneId, craneId),
            eq(waitingList.requestedDate, dateStr),
            eq(waitingList.notified, false)
        ));

    for (const { w, user, crane } of items) {
        if (user.email) {
            await sendWaitingListNotification({
                to: user.email,
                userName: user.name || user.firstName || "Korisnik",
                craneName: crane.name,
                date: dateStr,
                lang: "hr"
            });
        }
        if (user.phone) {
            const msg = `MARINA: Termin za ${crane.name} dana ${dateStr} je ponovno dostupan. Rezervirajte online.`;
            await sendSms(user.phone, msg);
        }

        await db.update(waitingList)
            .set({ notified: true })
            .where(eq(waitingList.id, w.id));
    }
}

export async function processWaitingListExpiry() {
    try {
        const db = await getDb();
        if (!db) return;

        const { waitingList } = await import("../../drizzle/schema");

        // Find expired waiting list entries
        const expired = await db.select({
            w: waitingList,
            user: users,
        })
            .from(waitingList)
            .innerJoin(users, eq(waitingList.userId, users.id))
            .where(and(
                eq(waitingList.status, "waiting"),
                lt(waitingList.expiresAt, new Date())
            ));

        for (const { w, user } of expired) {
            // Mark as expired
            await db.update(waitingList)
                .set({ status: "expired" as any, updatedAt: new Date() })
                .where(eq(waitingList.id, w.id));

            // Notify user
            if (user.email) {
                const { sendWaitingListNotification } = await import("../_core/email");
                await sendWaitingListNotification({
                    to: user.email,
                    userName: user.name || user.firstName || "Korisnik",
                    craneName: "—",
                    date: w.requestedDate,
                    lang: "hr",
                }).catch(console.warn);
            }

            if (user.phone) {
                const { sendSms } = await import("../_core/sms");
                await sendSms(
                    user.phone,
                    `MARINA: Vaša ponuda na listi čekanja za ${w.requestedDate} je istekla. Molimo zakažite novi termin.`
                ).catch(console.warn);
            }
        }

        if (expired.length > 0) {
            console.log(`[WaitingList] Processed ${expired.length} expired entries`);
        }
    } catch (error) {
        console.error("Failed to process waiting list expiry:", error);
    }
}

export function startNotificationCron() {
    console.log("Notification service started (reminders hourly, waiting list every 30min)");
    // Reminders: every hour
    processReminders();
    setInterval(processReminders, 60 * 60 * 1000);
    // Waiting list expiry: every 30 minutes
    processWaitingListExpiry();
    setInterval(processWaitingListExpiry, 30 * 60 * 1000);
}
