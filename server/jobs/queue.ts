import { PgBoss, type SendOptions } from "pg-boss";
import { getDb } from "../db";
import { waitingOffers, landWaitingList, users, vessels, landZones } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { sendEmail, type EmailPayload } from "../_core/email";
import { sendSms } from "../_core/sms";
import {
    processReminders,
    processWaitingListExpiry,
    startNotificationCron,
    stopNotificationCron,
    isFallbackCronRunning,
} from "../services/notifications";
import { triggerScheduledSync } from "../memberSync/scheduler";

export const QUEUES = {
    SEND_EMAIL: "send-email",
    SEND_SMS: "send-sms",
    WAITING_OFFER_EXPIRE: "waiting-offer-expire",
    RESERVATION_REMINDERS: "reservation-reminders",
    WAITING_LIST_EXPIRY: "waiting-list-expiry",
    MSSQL_MEMBER_SYNC: "mssql-member-sync",
} as const;

export interface EmailJobData extends EmailPayload {
    from?: string;
}

export interface SmsJobData {
    phone: string;
    message: string;
}

export interface WaitingOfferExpireJobData {
    offerId: string;
}

export type QueueRuntimeMode = "pg-boss" | "degraded-fallback" | "stopped";

export interface QueueHealthStatus {
    mode: QueueRuntimeMode;
    isRunning: boolean;
    fallbackActive: boolean;
    lastError: string | null;
    startedAt: string | null;
}

let bossInstance: PgBoss | null = null;
let isStarted = false;
let lastStartupError: string | null = null;
let startedAtIso: string | null = null;

export function getBoss(): PgBoss | null {
    return bossInstance;
}

export function isQueueRunning(): boolean {
    return isStarted && bossInstance !== null;
}

export function getQueueHealthStatus(): QueueHealthStatus {
    const running = isQueueRunning();
    const fallback = isFallbackCronRunning();
    const mode: QueueRuntimeMode = running
        ? "pg-boss"
        : fallback
        ? "degraded-fallback"
        : "stopped";

    return {
        mode,
        isRunning: running,
        fallbackActive: fallback,
        lastError: lastStartupError,
        startedAt: startedAtIso,
    };
}

/**
 * Pokreće pg-boss instancu i registrira radnike i periodičke rasporede.
 * U slučaju greške pri inicijalizaciji čisti djelomično stanje, bilježi grešku
 * i automatski aktivira degradirani fallback timer režim (osim ako je eksplicitno isključeno).
 */
export async function startQueueService(options?: {
    connectionString?: string;
    enableFallbackOnError?: boolean;
}): Promise<PgBoss | null> {
    if (isStarted && bossInstance) {
        return bossInstance;
    }

    const enableFallback = options?.enableFallbackOnError ?? true;
    const connectionString = options?.connectionString ?? process.env.DATABASE_URL;

    if (!connectionString) {
        lastStartupError = "DATABASE_URL missing";
        console.warn("[Queue][ALERT] DATABASE_URL nije postavljen — pg-boss se ne može pokrenuti.");
        if (enableFallback) {
            startNotificationCron();
        }
        return null;
    }

    let candidateBoss: PgBoss | null = null;
    try {
        console.log("[Queue] Inicijalizacija pg-boss servisa...");
        candidateBoss = new PgBoss({
            connectionString,
            application_name: "crane_booking_pg_boss",
            schema: "pgboss",
        });

        candidateBoss.on("error", (error) => {
            console.error("[Queue] pg-boss greška:", error);
        });

        await candidateBoss.start();
        console.log("[Queue] pg-boss servis uspješno pokrenut (shema: pgboss).");

        // ─── 0. Eksplicitno kreiranje svih redova (zahtjev pg-boss v12) ───
        const queueNames = Object.values(QUEUES);
        for (const q of queueNames) {
            try {
                await candidateBoss.createQueue(q);
            } catch (e: any) {
                // Već postoji
            }
        }

        // ─── 1. Registracija radnika za e-mailove s automatskim retryjem ───
        await candidateBoss.work<EmailJobData>(QUEUES.SEND_EMAIL, async (jobs) => {
            for (const job of jobs) {
                const { to, subject, html } = job.data;
                const ok = await sendEmail({ to, subject, html });
                if (!ok) {
                    throw new Error(`Slanje e-maila na ${to} nije uspjelo`);
                }
            }
        });

        // ─── 2. Registracija radnika za SMS poruke ───
        await candidateBoss.work<SmsJobData>(QUEUES.SEND_SMS, async (jobs) => {
            for (const job of jobs) {
                const { phone, message } = job.data;
                const ok = await sendSms(phone, message);
                if (!ok) {
                    throw new Error(`Slanje SMS-a na ${phone} nije uspjelo`);
                }
            }
        });

        // ─── 3. Istek ponude na listi čekanja (točno u sekundu isteka) ───
        await candidateBoss.work<WaitingOfferExpireJobData>(QUEUES.WAITING_OFFER_EXPIRE, async (jobs) => {
            const db = await getDb();
            if (!db) return;

            for (const job of jobs) {
                const { offerId } = job.data;
                const now = new Date();

                const [offer] = await db
                    .select({
                        offer: waitingOffers,
                        waitingEntry: landWaitingList,
                        user: users,
                        vessel: vessels,
                        zone: landZones,
                    })
                    .from(waitingOffers)
                    .innerJoin(landWaitingList, eq(waitingOffers.waitingListId, landWaitingList.id))
                    .innerJoin(users, eq(landWaitingList.userId, users.id))
                    .innerJoin(vessels, eq(waitingOffers.vesselId, vessels.id))
                    .innerJoin(landZones, eq(waitingOffers.zoneId, landZones.id))
                    .where(
                        and(
                            eq(waitingOffers.id, offerId),
                            eq(waitingOffers.status, "pending"),
                            lte(waitingOffers.expiresAt, now)
                        )
                    );

                if (offer) {
                    await db
                        .update(waitingOffers)
                        .set({
                            status: "expired",
                            declineReason: "Automatski isteklo - korisnik nije prihvatio u roku",
                            updatedAt: now,
                        })
                        .where(eq(waitingOffers.id, offerId));

                    console.log(`[Queue] Ponuda na listi čekanja ${offerId} je istekla.`);

                    if (offer.user.email) {
                        await enqueueEmail({
                            to: offer.user.email,
                            subject: "Istekla ponuda za suhi vez - PŠD Špinut",
                            html: `
                                <p>Poštovani ${offer.user.name || offer.user.firstName || ""},</p>
                                <p>Vaša ponuda za termin na suhom vezu u zoni <strong>${offer.zone.name}</strong> za plovilo <strong>${offer.vessel.name}</strong> je istekla jer nije potvrđena na vrijeme.</p>
                            `,
                        });
                    }

                    if (offer.user.phone) {
                        await enqueueSms({
                            phone: offer.user.phone,
                            message: `MARINA: Vaša ponuda za suhi vez (${offer.zone.name}) za plovilo ${offer.vessel.name} je istekla.`,
                        });
                    }
                }
            }
        });

        // ─── 4. Cron: Podsjetnici za rezervacije (svaki sat) ───
        await candidateBoss.work(QUEUES.RESERVATION_REMINDERS, async () => {
            await processReminders();
        });

        // ─── 5. Cron: Provjera isteka starih prijava na listi čekanja (svakih 15 min) ───
        await candidateBoss.work(QUEUES.WAITING_LIST_EXPIRY, async () => {
            await processWaitingListExpiry();
        });

        // ─── 6. Cron: MSSQL sinkronizacija članova (svakih 30 min s mutexom) ───
        await candidateBoss.work(QUEUES.MSSQL_MEMBER_SYNC, async () => {
            await triggerScheduledSync("boss-cron");
        });

        // ─── Registracija ponavljajućih cron poslova u bazi ───
        await candidateBoss.schedule(QUEUES.RESERVATION_REMINDERS, "0 * * * *", null, {
            singletonKey: "schedule-reservation-reminders",
        });

        await candidateBoss.schedule(QUEUES.WAITING_LIST_EXPIRY, "*/15 * * * *", null, {
            singletonKey: "schedule-waiting-list-expiry",
        });

        await candidateBoss.schedule(QUEUES.MSSQL_MEMBER_SYNC, "*/30 * * * *", null, {
            singletonKey: "schedule-mssql-member-sync",
        });

        console.log("[Queue] Svi pg-boss cron rasporedi uspješno registrirani u bazi.");

        // Svi koraci su uspjeli — postavi aktivno stanje i isključi eventualni fallback
        stopNotificationCron();
        bossInstance = candidateBoss;
        isStarted = true;
        lastStartupError = null;
        startedAtIso = new Date().toISOString();

        return bossInstance;
    } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        lastStartupError = errMsg;
        isStarted = false;
        bossInstance = null;

        if (candidateBoss) {
            try {
                await candidateBoss.stop({ graceful: false, timeout: 1000 });
            } catch {
                // Ignore cleanup error on failed instance
            }
        }

        console.error(
            `[Queue][ALERT] Neuspješno pokretanje pg-boss servisa (${errMsg}). Sustav prelazi u DEGRADIRANI FALLBACK način rada.`
        );
        if (enableFallback) {
            startNotificationCron();
        }
        return null;
    }
}

/**
 * Zaustavlja pg-boss servis i eventualne fallback tajmere
 */
export async function stopQueueService(): Promise<void> {
    stopNotificationCron();
    if (bossInstance && isStarted) {
        console.log("[Queue] Zaustavljanje pg-boss servisa...");
        try {
            await bossInstance.stop({ graceful: true, timeout: 5000 });
            console.log("[Queue] pg-boss servis uspješno zaustavljen.");
        } catch (err) {
            console.warn("[Queue] Greška pri zaustavljanju pg-boss:", err);
        } finally {
            bossInstance = null;
            isStarted = false;
        }
    } else {
        bossInstance = null;
        isStarted = false;
    }
}

/**
 * Dodaje e-mail u red čekanja s retry mehanizmom (3 pokušaja, eksponencijalni backoff)
 */
export async function enqueueEmail(
    data: EmailJobData,
    options?: Partial<SendOptions>
): Promise<string | null> {
    if (bossInstance && isStarted) {
        try {
            const jobId = await bossInstance.send(QUEUES.SEND_EMAIL, data, {
                retryLimit: 3,
                retryBackoff: true,
                expireInSeconds: 3600,
                ...options,
            });
            return jobId;
        } catch (err) {
            console.warn("[Queue] Neuspješno dodavanje e-maila u red, šaljem izravno:", err);
        }
    }
    const ok = await sendEmail(data);
    return ok ? "direct-sent" : null;
}

/**
 * Dodaje SMS u red čekanja s retry mehanizmom (3 pokušaja, eksponencijalni backoff)
 */
export async function enqueueSms(
    data: SmsJobData,
    options?: Partial<SendOptions>
): Promise<string | null> {
    if (bossInstance && isStarted) {
        try {
            const jobId = await bossInstance.send(QUEUES.SEND_SMS, data, {
                retryLimit: 3,
                retryBackoff: true,
                expireInSeconds: 3600,
                ...options,
            });
            return jobId;
        } catch (err) {
            console.warn("[Queue] Neuspješno dodavanje SMS-a u red, šaljem izravno:", err);
        }
    }
    const ok = await sendSms(data.phone, data.message);
    return ok ? "direct-sent" : null;
}

/**
 * Zakazuje automatski istek ponude na listi čekanja točno u vrijeme `expiresAt`
 */
export async function scheduleOfferExpiration(
    offerId: string,
    expiresAt: Date
): Promise<string | null> {
    if (bossInstance && isStarted) {
        try {
            const jobId = await bossInstance.send(
                QUEUES.WAITING_OFFER_EXPIRE,
                { offerId },
                {
                    startAfter: expiresAt,
                    singletonKey: `offer-expire-${offerId}`,
                    retryLimit: 2,
                    retryBackoff: true,
                }
            );
            return jobId;
        } catch (err) {
            console.error(`[Queue] Neuspješno zakazivanje isteka ponude ${offerId}:`, err);
        }
    }

    // Fallback: osiguraj da su fallback tajmeri aktivni i zakaži in-memory okidač za expiresAt
    startNotificationCron();
    const delayMs = Math.max(1000, Math.min(expiresAt.getTime() - Date.now(), 2_147_483_647));
    const t = setTimeout(() => {
        processWaitingListExpiry().catch(console.error);
    }, delayMs);
    if (t.unref) t.unref();
    return "fallback-scheduled";
}

/**
 * Pokreće jednokratnu asinkronu sinkronizaciju članova u pozadini
 */
export async function triggerAsyncMemberSync(): Promise<string | null> {
    if (bossInstance && isStarted) {
        try {
            const jobId = await bossInstance.send(QUEUES.MSSQL_MEMBER_SYNC, {}, {
                singletonKey: "manual-mssql-sync",
                retryLimit: 1,
            });
            return jobId;
        } catch (err) {
            console.error("[Queue] Neuspješno dodavanje sinkronizacije u red:", err);
        }
    }
    const res = await triggerScheduledSync("direct-manual");
    return res ? "direct-sync-completed" : null;
}
