import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  listCranes,
  getCraneById,
  createCrane,
  updateCrane,
  deleteCrane,
  createReservation,
  getReservationById,
  listReservationsByUser,
  listAllReservations,
  updateReservationStatus,
  getApprovedReservationsForCalendar,
  checkOverlap,
  createAuditEntry,
  listAuditLog,
  getUserById,
  getUserByEmail,
  createLocalUser,
  addToWaitingList,
  listWaitingListByUser,
  listAllWaiting,
  removeFromWaitingList,
  getAllSettings,
  updateSetting,
  listAllUsers,
  updateUserRole,
} from "./db";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./_core/notification";
import {
  sendReservationConfirmation,
  sendReservationRejection,
  sendWaitingListNotification,
} from "./_core/email";
import {
  sendReservationConfirmationSms,
  sendReservationRejectionSms,
} from "./_core/sms";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// ─── Helper: get JWT secret ──────────────────────────────────────────
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "marina-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

// ─── Helper: parse working hours ─────────────────────────────────────
function parseHHMM(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { h: h ?? 8, m: m ?? 0 };
}

// ─── Helper: slot validation ─────────────────────────────────────────
async function validateSlotAgainstSettings(
  startDate: Date,
  endDate: Date,
  sysSettings: Record<string, string>
) {
  const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
  const slotMin = Number(sysSettings.slotDurationMinutes ?? "60");
  const { h: wsH, m: wsM } = parseHHMM(sysSettings.workdayStart ?? "08:00");
  const { h: weH, m: weM } = parseHHMM(sysSettings.workdayEnd ?? "16:00");

  const startH = startDate.getHours() * 60 + startDate.getMinutes();
  const endH = endDate.getHours() * 60 + endDate.getMinutes();
  const workStart = wsH * 60 + wsM;
  const workEnd = weH * 60 + weM;

  if (startH < workStart || endH > workEnd) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Termini su dostupni između ${sysSettings.workdayStart} i ${sysSettings.workdayEnd}.`,
    });
  }

  // Duration must be a positive multiple of slot duration
  const durationMin = (endDate.getTime() - startDate.getTime()) / 60000;
  if (durationMin <= 0 || durationMin % slotMin !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Trajanje mora biti višekratnik od ${slotMin} minuta.`,
    });
  }

  return { bufferMin };
}

// ─── Main Router ──────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  // ─── Auth ────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        username: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email je već registriran." });
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const userId = await createLocalUser({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          username: input.username,
          phone: input.phone,
        });
        if (!userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const token = await new SignJWT({ sub: String(userId), role: "user" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("24h")
          .sign(getJwtSecret());
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 86400000 });
        return { success: true };
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Pogrešan email ili lozinka." });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Pogrešan email ili lozinka." });
        }
        const token = await new SignJWT({ sub: String(user.id), role: user.role })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("24h")
          .sign(getJwtSecret());
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 86400000 });
        return { success: true, role: user.role };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── User Management (Admin) ──────────────────────────────────────────
  user: router({
    list: adminProcedure.query(async () => {
      return listAllUsers();
    }),

    setRole: adminProcedure
      .input(z.object({ id: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        // Prevent self-demotion to avoid locking oneself out
        if (input.id === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ne možete sami sebi promijeniti rolu.",
          });
        }
        await updateUserRole(input.id, input.role);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "user_role_updated",
          entityType: "user",
          entityId: input.id,
          details: JSON.stringify({ role: input.role }),
        });
        return { success: true };
      }),
  }),

  // ─── Cranes ──────────────────────────────────────────────────────────
  crane: router({
    list: publicProcedure
      .input(z.object({ activeOnly: z.boolean().optional().default(true) }).optional())
      .query(async ({ input }) => listCranes(input?.activeOnly ?? true)),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const crane = await getCraneById(input.id);
        if (!crane) throw new TRPCError({ code: "NOT_FOUND", message: "Dizalica nije pronađena." });
        return crane;
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        capacity: z.string(),    // tonnes
        maxPoolWidth: z.string().optional(), // metres
        description: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createCrane(input as any);
        await createAuditEntry({ userId: ctx.user.id, action: "crane_created", entityType: "crane", entityId: id, details: JSON.stringify({ name: input.name }) });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        capacity: z.string().optional(),
        maxPoolWidth: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateCrane(id, data as any);
        await createAuditEntry({ userId: ctx.user.id, action: "crane_updated", entityType: "crane", entityId: id, details: JSON.stringify(data) });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCrane(input.id);
        await createAuditEntry({ userId: ctx.user.id, action: "crane_deactivated", entityType: "crane", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Reservations ─────────────────────────────────────────────────────
  reservation: router({
    create: protectedProcedure
      .input(z.object({
        craneId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
        // Vessel data
        vesselType: z.enum(["sailboat", "motorboat", "catamaran"]),
        vesselName: z.string().optional(),
        vesselLength: z.number().positive(),   // metres
        vesselWidth: z.number().positive(),    // metres
        vesselDraft: z.number().positive(),    // metres
        vesselWeight: z.number().positive(),   // tonnes
        // Operational
        liftPurpose: z.string().min(1),
        contactPhone: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.startDate >= input.endDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Kraj termina mora biti nakon početka." });
        }
        if (input.startDate < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termin mora biti u budućnosti." });
        }

        const crane = await getCraneById(input.craneId);
        if (!crane || !crane.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Dizalica nije pronađena." });
        }

        // Vessel dimension validation
        const craneCapacity = Number(crane.capacity);
        if (input.vesselWeight > craneCapacity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Težina plovila (${input.vesselWeight}t) prelazi kapacitet dizalice (${craneCapacity}t).`,
          });
        }
        if (crane.maxPoolWidth && input.vesselWidth > Number(crane.maxPoolWidth)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Širina plovila (${input.vesselWidth}m) prelazi širinu bazena (${crane.maxPoolWidth}m).`,
          });
        }

        // Slot + working-hours validation
        const sysSettings = await getAllSettings();
        const { bufferMin } = await validateSlotAgainstSettings(input.startDate, input.endDate, sysSettings);

        // Overlap check with buffer
        const effectiveEnd = new Date(input.endDate.getTime() + bufferMin * 60000);
        const hasOverlap = await checkOverlap(input.craneId, input.startDate, effectiveEnd);
        if (hasOverlap) {
          throw new TRPCError({ code: "CONFLICT", message: "Ovaj termin se preklapa s postojećom rezervacijom (uključujući tampon zonu)." });
        }

        const id = await createReservation({
          userId: ctx.user.id,
          craneId: input.craneId,
          startDate: input.startDate,
          endDate: input.endDate,
          status: "pending",
          vesselType: input.vesselType,
          vesselName: input.vesselName,
          vesselLength: String(input.vesselLength),
          vesselWidth: String(input.vesselWidth),
          vesselDraft: String(input.vesselDraft),
          vesselWeight: String(input.vesselWeight),
          liftPurpose: input.liftPurpose,
          contactPhone: input.contactPhone,
        });

        await createAuditEntry({ userId: ctx.user.id, action: "reservation_created", entityType: "reservation", entityId: id });

        // Notify admin
        await notifyOwner({
          title: "Novi zahtjev za rezervaciju",
          content: `Korisnik ${ctx.user.name || ctx.user.email || "Nepoznat"} zatražio ${crane.name} od ${input.startDate.toLocaleString("hr-HR")} do ${input.endDate.toLocaleString("hr-HR")}. Plovilo: ${input.vesselWeight}t, svrha: ${input.liftPurpose}`,
        }).catch(console.warn);

        return { id };
      }),

    myReservations: protectedProcedure.query(async ({ ctx }) => {
      const items = await listReservationsByUser(ctx.user.id);
      return Promise.all(items.map(async (r) => {
        const crane = await getCraneById(r.craneId);
        return { ...r, crane: crane ? { id: crane.id, name: crane.name, location: crane.location } : null };
      }));
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const crane = await getCraneById(reservation.craneId);
        const user = await getUserById(reservation.userId);
        return { ...reservation, crane, user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null };
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (reservation.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mogu se otkazati samo rezervacije na čekanju." });
        }
        await updateReservationStatus(input.id, "cancelled", ctx.user.id);
        await createAuditEntry({ userId: ctx.user.id, action: "reservation_cancelled", entityType: "reservation", entityId: input.id });
        return { success: true };
      }),

    // ── Admin ────────────────────────────────────────────────────────
    listAll: adminProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const items = await listAllReservations(input?.status);
        return Promise.all(items.map(async (r) => {
          const crane = await getCraneById(r.craneId);
          const user = await getUserById(r.userId);
          return { ...r, crane: crane ?? null, user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null };
        }));
      }),

    approve: adminProcedure
      .input(z.object({ id: z.number(), adminNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju se mogu odobriti." });

        const sysSettings = await getAllSettings();
        const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
        const effectiveEnd = new Date(reservation.endDate.getTime() + bufferMin * 60000);
        const hasOverlap = await checkOverlap(reservation.craneId, reservation.startDate, effectiveEnd, reservation.id);
        if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Drugi termin se preklapa s ovim." });

        await updateReservationStatus(input.id, "approved", ctx.user.id, input.adminNotes);
        await createAuditEntry({ userId: ctx.user.id, action: "reservation_approved", entityType: "reservation", entityId: input.id });

        // Notify user
        const user = await getUserById(reservation.userId);
        const crane = await getCraneById(reservation.craneId);
        if (user?.email && crane) {
          await sendReservationConfirmation({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            craneLocation: crane.location || crane.name,
            adminNotes: input.adminNotes,
          }).catch(console.warn);
        }
        if (user?.phone && crane) {
          await sendReservationConfirmationSms({
            phone: user.phone,
            craneName: crane.name,
            startDate: reservation.startDate,
            location: crane.location || crane.name,
          }).catch(console.warn);
        }

        return { success: true };
      }),

    reject: adminProcedure
      .input(z.object({ id: z.number(), adminNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju se mogu odbiti." });

        await updateReservationStatus(input.id, "rejected", ctx.user.id, input.adminNotes);
        await createAuditEntry({ userId: ctx.user.id, action: "reservation_rejected", entityType: "reservation", entityId: input.id });

        // Notify user
        const user = await getUserById(reservation.userId);
        const crane = await getCraneById(reservation.craneId);
        if (user?.email && crane) {
          await sendReservationRejection({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: reservation.startDate,
            reason: input.adminNotes,
          }).catch(console.warn);
        }
        if (user?.phone && crane) {
          await sendReservationRejectionSms({
            phone: user.phone,
            craneName: crane.name,
            reason: input.adminNotes,
          }).catch(console.warn);
        }

        return { success: true };
      }),

    // Admin: move/reschedule a reservation (drag-and-drop)
    reschedule: adminProcedure
      .input(z.object({ id: z.number(), startDate: z.date(), endDate: z.date() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        const sysSettings = await getAllSettings();
        const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
        const effectiveEnd = new Date(input.endDate.getTime() + bufferMin * 60000);
        const hasOverlap = await checkOverlap(reservation.craneId, input.startDate, effectiveEnd, input.id);
        if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Preslagani termin se preklapa." });

        // We update directly via db
        const { getDb } = await import("./db");
        const { reservations: res } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) await db.update(res).set({ startDate: input.startDate, endDate: input.endDate, updatedAt: new Date() }).where(eq(res.id, input.id));

        await createAuditEntry({ userId: ctx.user.id, action: "reservation_rescheduled", entityType: "reservation", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Public Calendar ───────────────────────────────────────────────────
  calendar: router({
    events: publicProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        craneId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const approved = await getApprovedReservationsForCalendar(input?.startDate, input?.endDate);
        const enriched = await Promise.all(approved.map(async (r) => {
          const crane = await getCraneById(r.craneId);
          return {
            id: r.id,
            craneId: r.craneId,
            craneName: crane?.name ?? "Nepoznata dizalica",
            craneLocation: crane?.location ?? "",
            startDate: r.startDate,
            endDate: r.endDate,
            vesselType: r.vesselType,
            liftPurpose: r.liftPurpose,
          };
        }));
        if (input?.craneId) {
          return enriched.filter((e) => e.craneId === input.craneId);
        }
        return enriched;
      }),

    availableSlots: publicProcedure
      .input(z.object({
        craneId: z.number(),
        date: z.string(), // YYYY-MM-DD
        slotCount: z.number().min(1).max(8),
      }))
      .query(async ({ input }) => {
        const sysSettings = await getAllSettings();
        const slotMin = Number(sysSettings.slotDurationMinutes ?? "60");
        const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
        const { h: wsH, m: wsM } = parseHHMM(sysSettings.workdayStart ?? "08:00");
        const { h: weH, m: weM } = parseHHMM(sysSettings.workdayEnd ?? "16:00");

        const dateObj = new Date(input.date);
        const dayStart = new Date(dateObj);
        dayStart.setHours(wsH, wsM, 0, 0);
        const dayEnd = new Date(dateObj);
        dayEnd.setHours(weH, weM, 0, 0);

        const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;
        const totalSlots = Math.floor(totalMinutes / slotMin);

        const availableStarts: Date[] = [];

        for (let i = 0; i <= totalSlots - input.slotCount; i++) {
          const slotStart = new Date(dayStart.getTime() + i * slotMin * 60000);
          const slotEnd = new Date(slotStart.getTime() + input.slotCount * slotMin * 60000);
          const effectiveEnd = new Date(slotEnd.getTime() + bufferMin * 60000);

          const overlap = await checkOverlap(input.craneId, slotStart, effectiveEnd);
          if (!overlap) availableStarts.push(slotStart);
        }

        return { availableStarts, slotDurationMinutes: slotMin };
      }),
  }),

  // ─── Waiting List ──────────────────────────────────────────────────────
  waitingList: router({
    join: protectedProcedure
      .input(z.object({
        craneId: z.number(),
        requestedDate: z.string(),
        slotCount: z.number().min(1).max(8),
        vesselData: z.record(z.string(), z.any()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await addToWaitingList({
          userId: ctx.user.id,
          craneId: input.craneId,
          requestedDate: input.requestedDate,
          slotCount: input.slotCount,
          vesselData: input.vesselData ?? null,
        });
        return { id };
      }),

    mine: protectedProcedure.query(async ({ ctx }) => {
      return listWaitingListByUser(ctx.user.id);
    }),

    leave: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await removeFromWaitingList(input.id, ctx.user.id);
        return { success: true };
      }),

    listAll: adminProcedure.query(async () => {
      const items = await listAllWaiting();
      return Promise.all(items.map(async (w) => {
        const user = await getUserById(w.userId);
        const crane = await getCraneById(w.craneId);
        return { ...w, user: user ? { name: user.name, email: user.email, phone: user.phone } : null, crane: crane ? { name: crane.name } : null };
      }));
    }),
  }),

  // ─── Settings (Admin) ─────────────────────────────────────────────────
  settings: router({
    get: publicProcedure.query(async () => getAllSettings()),

    update: adminProcedure
      .input(z.object({
        key: z.enum(["slotDurationMinutes", "bufferMinutes", "workdayStart", "workdayEnd"]),
        value: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateSetting(input.key, input.value);
        await createAuditEntry({ userId: ctx.user.id, action: "setting_updated", entityType: "setting", entityId: null, details: JSON.stringify(input) });
        return { success: true };
      }),
  }),

  // ─── Audit Log ────────────────────────────────────────────────────────
  audit: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(50) }).optional())
      .query(async ({ input }) => listAuditLog(input?.limit ?? 50)),
  }),
});

export type AppRouter = typeof appRouter;
