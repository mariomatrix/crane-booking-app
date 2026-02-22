import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, operatorProcedure, router } from "./_core/trpc";
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
  getReservationsForCalendar,
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
  softDeleteUser,
  listVesselsByUser,
  getVesselById,
  createVessel,
  updateVessel,
  deleteVessel,
  getWaitingListById,
  updateWaitingList,
  adminRemoveFromWaitingList,
  getDb,
} from "./db";
import { TRPCError } from "@trpc/server";
import {
  sendReservationConfirmation,
  sendReservationRejection,
  sendWaitingListNotification,
  sendPasswordResetEmail,
} from "./_core/email";
import { notifyStatusChange, notifyWaitingList } from "./services/notifications";
import { notifyOwner } from "./_core/notification";
import {
  users,
  passwordResets,
  reservations,
  waitingList,
  settings,
  cranes,
  auditLog,
  serviceTypes,
  messages,
  maintenanceBlocks,
  holidays,
  seasons,
} from "../drizzle/schema";
import { and, eq, gte, isNull, or, lte, desc } from "drizzle-orm";
import crypto from "crypto";
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

  // Phase 2: Strictly hourly slots (XX:00)
  if (startDate.getMinutes() !== 0 || startDate.getSeconds() !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Termini moraju početi točno na puni sat (npr. 08:00).",
    });
  }

  // Duration must be a multiple of 60
  const durationMin = (endDate.getTime() - startDate.getTime()) / 60000;
  if (durationMin <= 0 || durationMin % 60 !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Trajanje mora biti višekratnik od 60 minuta (1, 2 ili 3 sata).",
    });
  }

  return { bufferMin: 0 }; // No separate buffer in Phase 2
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
        phone: z.string().min(1),
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
      .mutation(async ({ input, ctx }: any) => {
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

    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user) return { success: true }; // Silent return for security

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.insert(passwordResets).values({
          userId: user.id,
          token,
          expiresAt,
        });

        const resetUrl = `${process.env.PUBLIC_URL || "http://localhost:5173"}/auth/reset-password?token=${token}`;
        await sendPasswordResetEmail({
          to: user.email!,
          userName: user.name || user.firstName || "Korisnik",
          resetUrl,
        });

        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({ token: z.string(), password: z.string().min(8) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [reset] = await db.select()
          .from(passwordResets)
          .where(and(eq(passwordResets.token, input.token), gte(passwordResets.expiresAt, new Date())))
          .limit(1);

        if (!reset) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Token je nevažeći ili je istekao." });
        }

        const passwordHash = await bcrypt.hash(input.password, 12);
        await db.update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, reset.userId));

        // Cleanup tokens for this user
        await db.delete(passwordResets).where(eq(passwordResets.userId, reset.userId));

        return { success: true };
      }),
  }),

  // ─── Vessels ──────────────────────────────────────────────────────────
  vessel: router({
    listMine: protectedProcedure.query(async ({ ctx }) => {
      return listVesselsByUser(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const vessel = await getVesselById(input.id);
        if (!vessel || vessel.ownerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plovilo nije pronađeno." });
        }
        return vessel;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.enum(["jedrilica", "motorni", "katamaran", "ostalo"]),
        lengthM: z.number().positive().optional(),
        beamM: z.number().positive().optional(),
        draftM: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
        registration: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }: any) => {
        const id = await createVessel({
          ...input,
          ownerId: ctx.user.id,
        } as any);
        await createAuditEntry({ actorId: ctx.user.id, action: "vessel_created", entityType: "vessel", entityId: id });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        type: z.enum(["jedrilica", "motorni", "katamaran", "ostalo"]).optional(),
        lengthM: z.number().positive().optional(),
        beamM: z.number().positive().optional(),
        draftM: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
        registration: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }: any) => {
        const { id, ...data } = input;
        await updateVessel(id, ctx.user.id, data as any);
        await createAuditEntry({ actorId: ctx.user.id, action: "vessel_updated", entityType: "vessel", entityId: id });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteVessel(input.id, ctx.user.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "vessel_deleted", entityType: "vessel", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── User Management (Admin) ──────────────────────────────────────────
  user: router({
    list: adminProcedure.query(async () => {
      return listAllUsers();
    }),

    setRole: adminProcedure
      .input(z.object({ id: z.string().uuid(), role: z.enum(["user", "operator", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ne možete sami sebi promijeniti rolu." });
        }
        await updateUserRole(input.id, input.role);
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_role_updated",
          entityType: "user",
          entityId: input.id,
          payload: { role: input.role },
        });
        return { success: true };
      }),

    updateMe: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateUser: updateUserDb } = await import("./db");
        await updateUserDb(ctx.user.id, input);
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "profile_updated",
          entityType: "user",
          entityId: ctx.user.id,
        });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        role: z.enum(["user", "operator", "admin"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateUser: updateUserDb, updateUserRole } = await import("./db");
        const { id, role, ...data } = input;

        if (Object.keys(data).length > 0) {
          await updateUserDb(id, data);
        }

        if (role) {
          if (id === ctx.user.id && role !== "admin") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ne možete sami sebi promijeniti rolu." });
          }
          await updateUserRole(id, role);
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_updated_admin",
          entityType: "user",
          entityId: id,
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ne možete obrisati sami sebe." });
        }
        await softDeleteUser(input.id);
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_deleted",
          entityType: "user",
          entityId: input.id,
        });
        return { success: true };
      }),

    resetPassword: adminProcedure
      .input(z.object({ id: z.string().uuid(), password: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const passwordHash = await bcrypt.hash(input.password, 12);
        await db.update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, input.id));

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_password_reset_admin",
          entityType: "user",
          entityId: input.id,
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
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const crane = await getCraneById(input.id);
        if (!crane) throw new TRPCError({ code: "NOT_FOUND", message: "Dizalica nije pronađena." });
        return crane;
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.enum(["travelift", "portalna", "mobilna", "ostalo"]).optional(),
        maxCapacityKg: z.number().positive(),
        maxPoolWidth: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createCrane(input as any);
        await createAuditEntry({ actorId: ctx.user.id, action: "crane_created", entityType: "crane", entityId: id });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        type: z.enum(["travelift", "portalna", "mobilna", "ostalo"]).optional(),
        maxCapacityKg: z.number().positive().optional(),
        maxPoolWidth: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        craneStatus: z.enum(["active", "inactive", "maintenance"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateCrane(id, data as any);
        await createAuditEntry({ actorId: ctx.user.id, action: "crane_updated", entityType: "crane", entityId: id });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCrane(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "crane_deactivated", entityType: "crane", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Reservations ─────────────────────────────────────────────────────
  reservation: router({
    create: protectedProcedure
      .input(z.object({
        craneId: z.string().uuid(),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        // Vessel data
        vesselId: z.string().uuid().optional(),
        vesselType: z.enum(["jedrilica", "motorni", "katamaran", "ostalo"]),
        vesselName: z.string().optional(),
        vesselLengthM: z.number().positive().optional(),
        vesselBeamM: z.number().positive().optional(),
        vesselDraftM: z.number().positive().optional(),
        vesselWeightKg: z.number().positive().optional(),
        // Operational
        liftPurpose: z.string().min(1),
        contactPhone: z.string().min(6),
        serviceTypeId: z.string().uuid().optional(),
        userNote: z.string().optional(),
        requestedDate: z.string().optional(),
        requestedTimeSlot: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Limit check: Max 3 active reservations
        const myActive = await listReservationsByUser(ctx.user.id);
        const activeCount = myActive.filter(r => r.status === "pending" || r.status === "approved").length;
        if (activeCount >= 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Imate maksimalni broj aktivnih rezervacija (3). Molimo pričekajte završetak ili otkažite postojeće.",
          });
        }

        if (input.scheduledStart >= input.scheduledEnd) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Kraj termina mora biti nakon početka." });
        }
        if (input.scheduledStart < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termin mora biti u budućnosti." });
        }

        const crane = await getCraneById(input.craneId);
        if (!crane || crane.craneStatus !== "active") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Dizalica nije pronađena ili nije aktivna." });
        }

        // Vessel weight validation
        if (input.vesselWeightKg && input.vesselWeightKg > crane.maxCapacityKg) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Težina plovila (${input.vesselWeightKg}kg) prelazi kapacitet dizalice (${crane.maxCapacityKg}kg).`,
          });
        }
        if (crane.maxPoolWidth && input.vesselBeamM && input.vesselBeamM > Number(crane.maxPoolWidth)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Širina plovila (${input.vesselBeamM}m) prelazi širinu bazena (${crane.maxPoolWidth}m).`,
          });
        }

        // Slot + working-hours validation
        const sysSettings = await getAllSettings();
        const { bufferMin } = await validateSlotAgainstSettings(input.scheduledStart, input.scheduledEnd, sysSettings);

        // Overlap check with buffer
        const effectiveEnd = new Date(input.scheduledEnd.getTime() + bufferMin * 60000);
        const hasOverlap = await checkOverlap(input.craneId, input.scheduledStart, effectiveEnd);
        if (hasOverlap) {
          throw new TRPCError({ code: "CONFLICT", message: "Ovaj termin se preklapa s postojećom rezervacijom (uključujući tampon zonu)." });
        }

        // Generate Reservation Number: REV-YY-XXXX
        const year = new Date().getFullYear().toString().slice(-2);
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const reservationNumber = `REV-${year}-${randomStr}`;

        const id = await createReservation({
          userId: ctx.user.id,
          craneId: input.craneId,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          status: "pending",
          reservationNumber,
          vesselId: input.vesselId,
          vesselType: input.vesselType,
          vesselName: input.vesselName,
          vesselLengthM: input.vesselLengthM ? String(input.vesselLengthM) : undefined,
          vesselBeamM: input.vesselBeamM ? String(input.vesselBeamM) : undefined,
          vesselDraftM: input.vesselDraftM ? String(input.vesselDraftM) : undefined,
          vesselWeightKg: input.vesselWeightKg,
          liftPurpose: input.liftPurpose,
          contactPhone: input.contactPhone,
          serviceTypeId: input.serviceTypeId,
          userNote: input.userNote,
          requestedDate: input.requestedDate,
          requestedTimeSlot: input.requestedTimeSlot,
        });

        await createAuditEntry({ actorId: ctx.user.id, action: "reservation_created", entityType: "reservation", entityId: id });

        // Notify admin
        await notifyOwner({
          title: "Novi zahtjev za rezervaciju",
          content: `Korisnik ${ctx.user.name || ctx.user.email || "Nepoznat"} zatražio ${crane.name} od ${input.scheduledStart.toLocaleString("hr-HR")} do ${input.scheduledEnd.toLocaleString("hr-HR")}. Plovilo: ${input.vesselWeightKg}kg, svrha: ${input.liftPurpose}`,
        }).catch(console.warn);

        return { id };
      }),

    myReservations: protectedProcedure.query(async ({ ctx }) => {
      const items = await listReservationsByUser(ctx.user.id);
      return Promise.all(items.map(async (r) => {
        const crane = r.craneId ? await getCraneById(r.craneId) : null;
        return { ...r, crane: crane ? { id: crane.id, name: crane.name, location: crane.location } : null };
      }));
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.userId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "operator") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const crane = reservation.craneId ? await getCraneById(reservation.craneId) : null;
        const user = await getUserById(reservation.userId);
        return { ...reservation, crane, user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null };
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.string().uuid(), reason: z.string().min(3) }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

        if (reservation.status !== "pending" && reservation.status !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mogu se otkazati samo rezervacije na čekanju ili odobrene rezervacije." });
        }

        await updateReservationStatus(input.id, "cancelled", undefined, undefined, input.reason, "user");
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_cancelled",
          entityType: "reservation",
          entityId: input.id,
          payload: { reason: input.reason },
        });

        if (reservation.status === "approved" && reservation.craneId) {
          const dateStr = reservation.scheduledStart ? new Date(reservation.scheduledStart).toISOString().split("T")[0] : "";
          notifyWaitingList(reservation.craneId, dateStr).catch(console.error);
        }

        return { success: true };
      }),

    // ── Admin ────────────────────────────────────────────────────────
    listAll: adminProcedure
      .input(z.object({
        status: z.array(z.string()).optional(),
        userId: z.string().uuid().optional(),
        vesselId: z.string().uuid().optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [];
        if (input?.status && input.status.length > 0) {
          const statusOrs = input.status.map(s => eq(reservations.status, s as any));
          conditions.push(or(...statusOrs));
        }
        if (input?.userId) conditions.push(eq(reservations.userId, input.userId));
        if (input?.vesselId) conditions.push(eq(reservations.vesselId, input.vesselId));
        if (input?.scheduledStart) conditions.push(gte(reservations.scheduledStart, input.scheduledStart));
        if (input?.scheduledEnd) conditions.push(lte(reservations.scheduledEnd, input.scheduledEnd));

        const query = db.select().from(reservations);
        if (conditions.length > 0) {
          query.where(and(...conditions));
        }
        const items = await query.orderBy(desc(reservations.createdAt));

        return Promise.all(items.map(async (r) => {
          const crane = r.craneId ? await getCraneById(r.craneId) : null;
          const user = await getUserById(r.userId);
          return { ...r, crane: crane ?? null, user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null };
        }));
      }),

    approve: adminProcedure
      .input(z.object({ id: z.string().uuid(), adminNote: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju se mogu odobriti." });

        if (reservation.craneId && reservation.scheduledStart && reservation.scheduledEnd) {
          const sysSettings = await getAllSettings();
          const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
          const effectiveEnd = new Date(new Date(reservation.scheduledEnd).getTime() + bufferMin * 60000);
          const hasOverlap = await checkOverlap(reservation.craneId, new Date(reservation.scheduledStart), effectiveEnd, reservation.id);
          if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Drugi termin se preklapa s ovim." });
        }

        await updateReservationStatus(input.id, "approved", ctx.user.id, input.adminNote);
        await createAuditEntry({ actorId: ctx.user.id, action: "reservation_approved", entityType: "reservation", entityId: input.id });

        // Notify user
        const user = await getUserById(reservation.userId);
        const crane = reservation.craneId ? await getCraneById(reservation.craneId) : null;
        if (user?.email && crane) {
          await sendReservationConfirmation({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: reservation.scheduledStart ? new Date(reservation.scheduledStart) : new Date(),
            endDate: reservation.scheduledEnd ? new Date(reservation.scheduledEnd) : new Date(),
            craneLocation: crane.location || crane.name,
            adminNotes: input.adminNote,
          }).catch(console.warn);
        }
        if (user?.phone && crane) {
          await sendReservationConfirmationSms({
            phone: user.phone,
            craneName: crane.name,
            startDate: reservation.scheduledStart ? new Date(reservation.scheduledStart) : new Date(),
            location: crane.location || crane.name,
          }).catch(console.warn);
        }

        return { success: true };
      }),

    reject: adminProcedure
      .input(z.object({ id: z.string().uuid(), adminNote: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju se mogu odbiti." });

        await updateReservationStatus(input.id, "rejected", ctx.user.id, input.adminNote);
        await createAuditEntry({ actorId: ctx.user.id, action: "reservation_rejected", entityType: "reservation", entityId: input.id });

        // Notify user
        const user = await getUserById(reservation.userId);
        const crane = reservation.craneId ? await getCraneById(reservation.craneId) : null;
        if (user?.email && crane) {
          await sendReservationRejection({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: reservation.scheduledStart ? new Date(reservation.scheduledStart) : new Date(),
            reason: input.adminNote,
          }).catch(console.warn);
        }
        if (user?.phone && crane) {
          await sendReservationRejectionSms({
            phone: user.phone,
            craneName: crane.name,
            reason: input.adminNote,
          }).catch(console.warn);
        }

        if (reservation.craneId) {
          const dateStr = reservation.scheduledStart ? new Date(reservation.scheduledStart).toISOString().split("T")[0] : "";
          notifyWaitingList(reservation.craneId, dateStr).catch(console.error);
        }

        return { success: true };
      }),

    // Admin: move/reschedule a reservation (drag-and-drop)
    reschedule: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        craneId: z.string().uuid().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

        const targetCraneId = input.craneId ?? reservation.craneId;

        const sysSettings = await getAllSettings();
        const bufferMin = Number(sysSettings.bufferMinutes ?? "15");
        const effectiveEnd = new Date(input.scheduledEnd.getTime() + bufferMin * 60000);

        if (targetCraneId) {
          const hasOverlap = await checkOverlap(targetCraneId, input.scheduledStart, effectiveEnd, input.id);
          if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Preslagani termin se preklapa." });
        }

        const db = await getDb();
        if (db) {
          await db.update(reservations).set({
            scheduledStart: input.scheduledStart,
            scheduledEnd: input.scheduledEnd,
            craneId: targetCraneId,
            updatedAt: new Date()
          }).where(eq(reservations.id, input.id));
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_rescheduled",
          entityType: "reservation",
          entityId: input.id,
          payload: { oldCraneId: reservation.craneId, newCraneId: targetCraneId, scheduledStart: input.scheduledStart },
        });
        return { success: true };
      }),
  }),

  // ─── Public Calendar ───────────────────────────────────────────────────
  calendar: router({
    events: publicProcedure
      .input(z.object({
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        craneId: z.string().uuid().optional(),
      }).optional())
      .query(async ({ input }) => {
        const items = await getReservationsForCalendar(input?.scheduledStart, input?.scheduledEnd, true);
        const enriched = await Promise.all(items.map(async (r) => {
          const crane = r.craneId ? await getCraneById(r.craneId) : null;
          return {
            id: r.id,
            craneId: r.craneId,
            craneName: crane?.name ?? "Nepoznata dizalica",
            craneLocation: crane?.location ?? "",
            scheduledStart: r.scheduledStart,
            scheduledEnd: r.scheduledEnd,
            vesselType: r.vesselType,
            liftPurpose: r.liftPurpose,
            status: r.status,
          };
        }));
        if (input?.craneId) {
          return enriched.filter((e) => e.craneId === input.craneId);
        }
        return enriched;
      }),

    availableSlots: publicProcedure
      .input(z.object({
        craneId: z.string().uuid(),
        date: z.string(), // YYYY-MM-DD
        durationMin: z.number().min(30).max(480).default(60),
      }))
      .query(async ({ input }) => {
        const sysSettings = await getAllSettings();
        const slotMin = input.durationMin;
        const bufferMin = 0;

        const dateObj = new Date(input.date);
        const { h: wsH, m: wsM } = parseHHMM(sysSettings.workdayStart ?? "08:00");
        const { h: weH, m: weM } = parseHHMM(sysSettings.workdayEnd ?? "16:00");

        const dayStartUTC = new Date(dateObj.getTime());
        dayStartUTC.setUTCHours(wsH, wsM, 0, 0);

        const dayEndUTC = new Date(dateObj.getTime());
        dayEndUTC.setUTCHours(weH, weM, 0, 0);

        const totalMinutes = (dayEndUTC.getTime() - dayStartUTC.getTime()) / 60000;
        const totalSlots = Math.floor(totalMinutes / slotMin);

        const availableStarts: Date[] = [];

        for (let i = 0; i < totalSlots; i++) {
          const slotStart = new Date(dayStartUTC.getTime() + i * slotMin * 60000);
          const slotEnd = new Date(slotStart.getTime() + slotMin * 60000);
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
        craneId: z.string().uuid(),
        requestedDate: z.string(),
        vesselData: z.record(z.string(), z.any()).optional(),
        serviceTypeId: z.string().uuid().optional(),
        userNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await addToWaitingList({
          userId: ctx.user.id,
          craneId: input.craneId,
          requestedDate: input.requestedDate,
          vesselData: input.vesselData ?? null,
          serviceTypeId: input.serviceTypeId,
        });
        return { id };
      }),

    mine: protectedProcedure.query(async ({ ctx }) => {
      return listWaitingListByUser(ctx.user.id);
    }),

    leave: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await removeFromWaitingList(input.id, ctx.user.id);
        return { success: true };
      }),

    listAll: adminProcedure.query(async () => {
      const items = await listAllWaiting();
      return Promise.all(items.map(async (w) => {
        const user = await getUserById(w.userId);
        const crane = w.craneId ? await getCraneById(w.craneId) : null;
        return { ...w, user: user ? { name: user.name, email: user.email, phone: user.phone } : null, crane: crane ? { name: crane.name } : null };
      }));
    }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        craneId: z.string().uuid().optional(),
        requestedDate: z.string().optional(),
        status: z.enum(["waiting", "notified", "converted", "expired"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const item = await getWaitingListById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        await updateWaitingList(input.id, {
          craneId: input.craneId,
          requestedDate: input.requestedDate,
        });

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "waiting_list_updated",
          entityType: "waiting_list",
          entityId: input.id,
        });
        return { success: true };
      }),

    toReservation: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        craneId: z.string().uuid().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const item = await getWaitingListById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        const targetCraneId = input.craneId ?? item.craneId ?? undefined;
        if (!targetCraneId) throw new TRPCError({ code: "BAD_REQUEST", message: "Dizalica nije navedena." });

        const hasOverlap = await checkOverlap(targetCraneId, input.scheduledStart, input.scheduledEnd);
        if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Termin je zauzet." });

        const vesselData = (item.vesselData as any) || {};

        const resId = await createReservation({
          userId: item.userId,
          craneId: targetCraneId,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          status: "approved",
          vesselName: vesselData.name || "Brod s liste čekanja",
          vesselType: vesselData.type || "motorni",
          vesselWeightKg: Number(vesselData.weightKg || 0),
          vesselLengthM: vesselData.lengthM ? String(vesselData.lengthM) : undefined,
          vesselBeamM: vesselData.beamM ? String(vesselData.beamM) : undefined,
          vesselDraftM: vesselData.draftM ? String(vesselData.draftM) : undefined,
          liftPurpose: "Lista čekanja",
          contactPhone: "N/A",
        });

        await adminRemoveFromWaitingList(input.id);

        notifyStatusChange(resId).catch(console.error);

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "waiting_list_converted",
          entityType: "reservation",
          entityId: resId,
          payload: { waitingListId: input.id },
        });

        return { id: resId };
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
        await createAuditEntry({ actorId: ctx.user.id, action: "setting_updated", entityType: "setting", payload: input });
        return { success: true };
      }),
  }),

  // ─── Maintenance (Admin Only) ──────────────────────────────────────────
  maintenance: router({
    create: adminProcedure
      .input(z.object({
        craneId: z.string().uuid(),
        scheduledStart: z.date(),
        scheduledEnd: z.date(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const hasOverlap = await checkOverlap(input.craneId, input.scheduledStart, input.scheduledEnd);
        if (hasOverlap) {
          throw new TRPCError({ code: "CONFLICT", message: "Termin se preklapa s postojećim rezervacijama." });
        }

        const id = await createReservation({
          userId: ctx.user.id,
          craneId: input.craneId,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          status: "approved",
          isMaintenance: true,
          liftPurpose: input.description || "Održavanje",
          contactPhone: "ADMIN",
          vesselType: "ostalo",
          vesselWeightKg: 0,
        });

        await createAuditEntry({ actorId: ctx.user.id, action: "maintenance_blocked", entityType: "reservation", entityId: id });
        return { id };
      }),
  }),

  // ─── Audit Log ────────────────────────────────────────────────────────
  audit: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(50) }).optional())
      .query(async ({ input }) => listAuditLog(input?.limit ?? 50)),
  }),

  // ─── Analytics (Admin Only) ──────────────────────────────────────────
  analytics: router({
    dashboard: adminProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // 1. Crane Utilization (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const allRes = await db.select().from(reservations).where(gte(reservations.scheduledStart, thirtyDaysAgo));
        const allCranes = await db.select().from(cranes);

        const craneStats = allCranes.map(c => {
          const craneRes = allRes.filter(r => r.craneId === c.id);
          const approved = craneRes.filter(r => r.status === "approved" && !r.isMaintenance);
          const maintenance = craneRes.filter(r => r.isMaintenance);
          const rejected = craneRes.filter(r => r.status === "rejected");
          const cancelled = craneRes.filter(r => r.status === "cancelled");

          const totalHoursApproved = approved.reduce((acc, r) => {
            if (!r.scheduledStart || !r.scheduledEnd) return acc;
            return acc + (new Date(r.scheduledEnd).getTime() - new Date(r.scheduledStart).getTime()) / 3600000;
          }, 0);
          const totalHoursMaint = maintenance.reduce((acc, r) => {
            if (!r.scheduledStart || !r.scheduledEnd) return acc;
            return acc + (new Date(r.scheduledEnd).getTime() - new Date(r.scheduledStart).getTime()) / 3600000;
          }, 0);

          return {
            craneId: c.id,
            craneName: c.name,
            utilization: totalHoursApproved,
            maintenanceHours: totalHoursMaint,
            rejectedCount: rejected.length,
            cancelledCount: cancelled.length
          };
        });

        // 2. User Statistics (Top 5)
        const userResCounts: Record<string, { count: number; name: string }> = {};
        for (const r of allRes) {
          if (r.status === "approved" && !r.isMaintenance) {
            if (!userResCounts[r.userId]) {
              const u = await getUserById(r.userId);
              userResCounts[r.userId] = { count: 0, name: u?.name || u?.email || "Unknown" };
            }
            userResCounts[r.userId].count++;
          }
        }
        const topUsers = Object.entries(userResCounts)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // 3. Cancellation Reasons
        const cancelReasons: Record<string, number> = {};
        allRes.filter(r => r.status === "cancelled" && r.cancelReason).forEach(r => {
          const reason = r.cancelReason || "Nije navedeno";
          cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
        });

        return {
          craneStats,
          topUsers,
          cancelReasons: Object.entries(cancelReasons).map(([name, value]) => ({ name, value }))
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
