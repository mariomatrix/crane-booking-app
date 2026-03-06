import { COOKIE_NAME, REFRESH_COOKIE_NAME, ACCESS_TOKEN_EXPIRY_MS, REFRESH_TOKEN_EXPIRY_MS } from "@shared/const";
import { getSessionCookieOptions, getRefreshCookieOptions } from "./_core/cookies";
import { getJwtSecret, getRefreshSecret } from "./_core/context";
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
  listServiceTypes,
  getServiceTypeById,
  createServiceType,
  updateServiceType,
  deleteServiceType,
  seedServiceTypes,
  createEmailVerificationToken,
  verifyEmailToken,
  sendMessage,
  listMessages,
  markMessagesRead,
  countUnreadMessages,
  getUnreadCountForReservation,
  createSeason,
  listSeasons,
  updateSeason,
  deleteSeason,
  getActiveSeason,
  createHoliday,
  listHolidays,
  deleteHoliday,
  isHoliday,
  seedCroatianHolidays,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "./db";
import { TRPCError } from "@trpc/server";
import {
  sendReservationConfirmation,
  sendReservationRejection,
  sendWaitingListNotification,
  sendPasswordResetEmail,
  sendEmailVerification,
  sendUserInvitation,
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

// ─── Helper: issue token pair ────────────────────────────────────────
async function issueTokenPair(userId: string, role: string, ctx: any) {
  const accessToken = await new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getJwtSecret());

  const refreshToken = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${REFRESH_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getRefreshSecret());

  const sessionOpts = getSessionCookieOptions(ctx.req);
  const refreshOpts = getRefreshCookieOptions(ctx.req);

  ctx.res.cookie(COOKIE_NAME, accessToken, { ...sessionOpts, maxAge: ACCESS_TOKEN_EXPIRY_MS });
  ctx.res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...refreshOpts, maxAge: REFRESH_TOKEN_EXPIRY_MS });
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

        // Issue access + refresh token pair
        await issueTokenPair(String(userId), "user", ctx);

        // Send verification email
        const verifyToken = await createEmailVerificationToken(String(userId));
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:5173";
        const verifyUrl = `${baseUrl}/auth/verify-email?token=${verifyToken}`;
        sendEmailVerification({
          to: input.email,
          userName: input.firstName,
          verifyUrl,
        }).catch(console.warn);

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

        // Issue access + refresh token pair
        await issueTokenPair(String(user.id), user.role, ctx);
        return { success: true, role: user.role };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const sessionOpts = getSessionCookieOptions(ctx.req);
      const refreshOpts = getRefreshCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...sessionOpts, maxAge: -1 });
      ctx.res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshOpts, maxAge: -1 });
      return { success: true } as const;
    }),

    refresh: publicProcedure.mutation(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie;
      if (!cookieHeader) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesija je istekla." });

      const { parse: parseCookies } = await import("cookie");
      const cookies = parseCookies(cookieHeader);
      const refreshToken = cookies[REFRESH_COOKIE_NAME];
      if (!refreshToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesija je istekla." });

      try {
        const { payload } = await jwtVerify(refreshToken, getRefreshSecret(), { algorithms: ["HS256"] });
        const userId = payload.sub as string;
        if (!userId) throw new Error("missing sub");

        const user = await getUserById(userId);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Korisnik nije pronađen." });

        // Issue a fresh pair
        await issueTokenPair(user.id, user.role, ctx);
        return { success: true };
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesija je istekla. Molimo prijavite se ponovo." });
      }
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

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const userId = await verifyEmailToken(input.token);
        if (!userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Link za verifikaciju je nevažeći ili je istekao." });
        }
        return { success: true };
      }),

    resendVerification: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.emailVerifiedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email je već verificiran." });
        }
        const verifyToken = await createEmailVerificationToken(ctx.user.id);
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:5173";
        const verifyUrl = `${baseUrl}/auth/verify-email?token=${verifyToken}`;
        await sendEmailVerification({
          to: ctx.user.email,
          userName: ctx.user.name || ctx.user.firstName || "Korisnik",
          verifyUrl,
        });
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
    list: operatorProcedure.query(async () => {
      return listAllUsers();
    }),

    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        role: z.enum(["user", "operator", "admin"]).default("user"),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email je već registriran." });
        }

        // Generate random 10 char password
        const tempPassword = crypto.randomBytes(5).toString("hex");
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const userId = await createLocalUser({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          mustChangePassword: true,
        });

        if (!userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Update role if not default "user"
        if (input.role !== "user") {
          await updateUserRole(String(userId), input.role);
        }

        // Send invitation email
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:5173";
        const loginUrl = `${baseUrl}/auth/login`;

        sendUserInvitation({
          to: input.email,
          userName: input.firstName,
          tempPassword,
          loginUrl,
        }).catch(console.warn);

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_created_admin",
          entityType: "user",
          entityId: String(userId),
          payload: { email: input.email, role: input.role },
        });

        return { success: true, tempPassword };
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

    changePassword: protectedProcedure
      .input(z.object({
        oldPassword: z.string().min(8),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        if (!user[0] || !user[0].passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Korisnik nije pronađen ili nema lozinku." });
        }

        const isValid = await bcrypt.compare(input.oldPassword, user[0].passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Trenutna lozinka nije ispravna." });
        }

        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await db.update(users)
          .set({
            passwordHash,
            mustChangePassword: false,
            updatedAt: new Date()
          })
          .where(eq(users.id, ctx.user.id));

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "password_changed",
          entityType: "user",
          entityId: ctx.user.id,
        });

        return { success: true };
      }),

    anonymize: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ne možete anonimizirati sami sebe." });
        }
        await softDeleteUser(input.id);
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_anonymized",
          entityType: "user",
          entityId: input.id,
        });
        return { success: true };
      }),

    exportData: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const userRecord = await getUserById(ctx.user.id);
        const userVessels = await listVesselsByUser(ctx.user.id);

        // Fetch user reservations
        const userReservations = await db.select().from(reservations).where(eq(reservations.userId, ctx.user.id));

        // Fetch waiting list entries
        const userWaitingList = await db.select().from(waitingList).where(eq(waitingList.userId, ctx.user.id));

        return {
          profile: userRecord,
          vessels: userVessels,
          reservations: userReservations,
          waitingList: userWaitingList,
          exportedAt: new Date().toISOString(),
        };
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

    create: operatorProcedure
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

    update: operatorProcedure
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

    delete: operatorProcedure
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
        // Service type — required in v2.0
        serviceTypeId: z.string().uuid(),
        // Requested time — user preference (no crane assignment at this stage)
        requestedDate: z.string().min(1), // YYYY-MM-DD
        requestedTimeSlot: z.enum(["jutro", "poslijepodne", "po_dogovoru"]).default("po_dogovoru"),
        userNote: z.string().max(1000).optional(),
        // Vessel data
        vesselId: z.string().uuid().optional(),
        vesselType: z.enum(["jedrilica", "motorni", "katamaran", "ostalo"]),
        vesselName: z.string().optional(),
        vesselLengthM: z.number().positive().optional(),
        vesselBeamM: z.number().positive().optional(),
        vesselDraftM: z.number().positive().optional(),
        vesselWeightKg: z.number().nonnegative().optional(),
        // Contact
        contactPhone: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        // 0. Email verification check
        if (!ctx.user.emailVerifiedAt) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Molimo potvrdite svoju email adresu prije kreiranja rezervacije.",
          });
        }

        // 1. Limit check: Max 3 active reservations
        const myActive = await listReservationsByUser(ctx.user.id);
        const activeCount = myActive.filter(r => r.status === "pending" || r.status === "approved").length;
        if (activeCount >= 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Imate maksimalni broj aktivnih rezervacija (3). Molimo pričekajte završetak ili otkažite postojeće.",
          });
        }

        // 2. Check date is not a holiday or outside season
        const dateIsHoliday = await isHoliday(input.requestedDate);
        if (dateIsHoliday) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Odabrani datum je praznik ili neradni dan.",
          });
        }

        const activeSeason = await getActiveSeason(input.requestedDate);
        if (!activeSeason) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Odabrani datum je izvan sezone rada. Molimo odaberite datum unutar aktivne sezone.",
          });
        }

        // 3. Validate service type exists
        const serviceType = await getServiceTypeById(input.serviceTypeId);
        if (!serviceType || !serviceType.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Odabrani tip operacije nije dostupan." });
        }

        // 3. Build vessel snapshot
        let vesselSnapshot: Record<string, any> = {
          vesselType: input.vesselType,
          vesselName: input.vesselName,
          vesselLengthM: input.vesselLengthM ? String(input.vesselLengthM) : undefined,
          vesselBeamM: input.vesselBeamM ? String(input.vesselBeamM) : undefined,
          vesselDraftM: input.vesselDraftM ? String(input.vesselDraftM) : undefined,
          vesselWeightKg: input.vesselWeightKg ?? 0,
          contactPhone: input.contactPhone,
          liftPurpose: null,  // v2: no liftPurpose, use userNote
        };

        // If existing vessel, pull snapshot from DB
        if (input.vesselId) {
          const vessel = await getVesselById(input.vesselId);
          if (vessel) {
            vesselSnapshot = {
              vesselType: vessel.type,
              vesselName: vessel.name,
              vesselLengthM: vessel.lengthM ?? undefined,
              vesselBeamM: vessel.beamM ?? undefined,
              vesselDraftM: vessel.draftM ?? undefined,
              vesselWeightKg: vessel.weightKg ?? 0,
              contactPhone: input.contactPhone,
              liftPurpose: null,
            };
          }
        }

        // 4. Generate reservation number
        const year = new Date().getFullYear().toString().slice(-2);
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const reservationNumber = `REZ-${year}-${randomStr}`;

        // 5. Create reservation (status: pending, no crane yet)
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

        const { reservations: resTable } = await import("../drizzle/schema");
        const created = await db.insert(resTable).values({
          userId: ctx.user.id,
          vesselId: input.vesselId,
          serviceTypeId: input.serviceTypeId,
          requestedDate: input.requestedDate,
          requestedTimeSlot: input.requestedTimeSlot,
          status: "pending",
          reservationNumber,
          vesselType: vesselSnapshot.vesselType,
          vesselName: vesselSnapshot.vesselName,
          vesselLengthM: vesselSnapshot.vesselLengthM,
          vesselBeamM: vesselSnapshot.vesselBeamM,
          vesselDraftM: vesselSnapshot.vesselDraftM,
          vesselWeightKg: vesselSnapshot.vesselWeightKg,
          contactPhone: input.contactPhone,
          userNote: input.userNote,
        }).returning({ id: resTable.id });

        const resId = created[0]?.id;
        if (!resId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_created",
          entityType: "reservation",
          entityId: resId,
          payload: { serviceTypeId: input.serviceTypeId, requestedDate: input.requestedDate },
        });

        // Send confirmation email to user
        const { sendReservationReceived } = await import("./_core/email");
        sendReservationReceived({
          to: ctx.user.email,
          userName: ctx.user.name || ctx.user.firstName || ctx.user.email,
          reservationNumber,
          requestedDate: input.requestedDate,
          vesselName: vesselSnapshot.vesselName || undefined,
          vesselType: vesselSnapshot.vesselType || undefined,
          vesselWeightKg: vesselSnapshot.vesselWeightKg || undefined,
          contactPhone: input.contactPhone,
          userNote: input.userNote || undefined,
          lang: "hr"
        }).catch(console.warn);

        return { id: resId, reservationNumber };
      }),

    myReservations: protectedProcedure.query(async ({ ctx }) => {
      const items = await listReservationsByUser(ctx.user.id);
      return Promise.all(items.map(async (r) => {
        const crane = r.craneId ? await getCraneById(r.craneId) : null;
        const unreadCount = await getUnreadCountForReservation(r.id, ctx.user.id, ctx.user.role);
        return {
          ...r,
          crane: crane ? { id: crane.id, name: crane.name, location: crane.location } : null,
          unreadCount
        };
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
      .query(async ({ input, ctx }) => {
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
          const approver = r.approvedBy ? await getUserById(r.approvedBy) : null;
          const unreadCount = await getUnreadCountForReservation(r.id, ctx.user.id, ctx.user.role);
          return {
            ...r,
            crane: crane ?? null,
            user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
            approver: approver ? { id: approver.id, name: approver.name } : null,
            unreadCount
          };
        }));
      }),

    approve: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        craneId: z.string().uuid(),
        scheduledStart: z.date(),
        durationMin: z.number().int().positive().default(60),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju se mogu odobriti." });

        // Validate crane
        const crane = await getCraneById(input.craneId);
        if (!crane || crane.craneStatus !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Odabrana dizalica nije aktivna." });
        }

        // Compute scheduled end
        const scheduledEnd = new Date(input.scheduledStart.getTime() + input.durationMin * 60000);

        // Validate weight vs crane capacity
        if (reservation.vesselWeightKg && Number(reservation.vesselWeightKg) > crane.maxCapacityKg) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Težina plovila (${reservation.vesselWeightKg}kg) prelazi kapacitet dizalice (${crane.maxCapacityKg}kg).`,
          });
        }

        // Overlap check
        const hasOverlap = await checkOverlap(input.craneId, input.scheduledStart, scheduledEnd, input.id);
        if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Drugi termin se preklapa s ovim." });

        // Update reservation
        const db = await getDb();
        if (db) {
          await db.update(reservations).set({
            craneId: input.craneId,
            scheduledStart: input.scheduledStart,
            scheduledEnd,
            durationMin: input.durationMin,
            status: "approved",
            adminNote: input.adminNote,
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(reservations.id, input.id));
        }

        await createAuditEntry({ actorId: ctx.user.id, action: "reservation_approved", entityType: "reservation", entityId: input.id });

        // Notify user
        const user = await getUserById(reservation.userId);
        if (user?.email) {
          await sendReservationConfirmation({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: input.scheduledStart,
            endDate: scheduledEnd,
            craneLocation: crane.location || crane.name,
            adminNotes: input.adminNote,
            vesselName: reservation.vesselName || undefined,
            vesselType: reservation.vesselType || undefined,
            vesselWeightKg: reservation.vesselWeightKg || undefined,
            userNote: reservation.userNote || undefined,
          }).catch(console.warn);
        }
        if (user?.phone) {
          await sendReservationConfirmationSms({
            phone: user.phone,
            craneName: crane.name,
            startDate: input.scheduledStart,
            location: crane.location || crane.name,
          }).catch(console.warn);
        }

        return { success: true };
      }),


    reject: operatorProcedure
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
    reschedule: operatorProcedure
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

        const { notifyStatusChange } = await import("./services/notifications");
        notifyStatusChange(input.id).catch(console.error);

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_rescheduled",
          entityType: "reservation",
          entityId: input.id,
          payload: { oldCraneId: reservation.craneId, newCraneId: targetCraneId, scheduledStart: input.scheduledStart },
        });
        return { success: true };
      }),

    // Mark reservation as completed
    complete: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Samo odobrene rezervacije se mogu označiti kao završene." });
        }
        const db = await getDb();
        if (db) {
          await db.update(reservations).set({
            status: "completed",
            completedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(reservations.id, input.id));
        }
        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_completed",
          entityType: "reservation",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // ─── Messages ───────────────────────────────────────────────────────────
  message: router({
    send: protectedProcedure
      .input(z.object({
        reservationId: z.string().uuid(),
        body: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify the user has access to this reservation
        const reservation = await getReservationById(input.reservationId);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

        const isStaff = ctx.user.role === "admin" || ctx.user.role === "operator";
        if (!isStaff && reservation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const msg = await sendMessage({
          reservationId: input.reservationId,
          senderId: ctx.user.id,
          body: input.body,
        });

        // Email notification to the other party
        try {
          if (isStaff) {
            // Staff sent message → notify user
            const owner = await getUserById(reservation.userId);
            if (owner?.email) {
              const { sendEmail } = await import("./_core/email");
              await (sendEmail as any)({
                to: owner.email,
                subject: `Nova poruka u vezi rezervacije — Marina Crane Booking`,
                html: `<h2>Pozdrav, ${owner.name || owner.firstName || "Korisnik"}!</h2>
                  <p>Imate novu poruku od osoblja marine u vezi vaše rezervacije <strong>${reservation.reservationNumber || ""}</strong>.</p>
                  <blockquote style="border-left:3px solid #2563eb;padding:8px 16px;margin:16px 0;color:#374151;">${input.body}</blockquote>
                  <p>Prijavite se na platformu za odgovor.</p>
                  <p style="color:#888;font-size:12px">Marina Crane Booking System</p>`,
              });
            }
          }
        } catch (e) {
          console.warn("[Messages] Email notification failed:", e);
        }

        return msg;
      }),

    list: protectedProcedure
      .input(z.object({ reservationId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.reservationId);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

        const isStaff = ctx.user.role === "admin" || ctx.user.role === "operator";
        if (!isStaff && reservation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Mark messages as read for the reader
        await markMessagesRead(input.reservationId, ctx.user.id);

        return listMessages(input.reservationId);
      }),

    markRead: protectedProcedure
      .input(z.object({ reservationId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await markMessagesRead(input.reservationId, ctx.user.id);
        return { success: true };
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const count = await countUnreadMessages(ctx.user.id, ctx.user.role);
        return { count };
      }),
  }),

  // ─── Service Types ─────────────────────────────────────────────────────
  serviceType: router({
    list: publicProcedure
      .input(z.object({ onlyActive: z.boolean().optional().default(true) }).optional())
      .query(async ({ input }) => listServiceTypes(input?.onlyActive ?? true)),

    listAll: adminProcedure
      .query(async () => listServiceTypes(false)),

    create: operatorProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        defaultDurationMin: z.number().int().positive().default(60),
        isActive: z.boolean().default(true),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const item = await createServiceType(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "service_type_created", entityType: "service_type", entityId: item?.id });
        return item;
      }),

    update: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        defaultDurationMin: z.number().int().positive().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const item = await updateServiceType(id, data);
        await createAuditEntry({ actorId: ctx.user.id, action: "service_type_updated", entityType: "service_type", entityId: id });
        return item;
      }),

    delete: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteServiceType(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "service_type_deleted", entityType: "service_type", entityId: input.id });
        return { success: true };
      }),

    seed: operatorProcedure
      .mutation(async () => {
        await seedServiceTypes();
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
      .query(async ({ input, ctx }) => {
        const items = await getReservationsForCalendar(input?.scheduledStart, input?.scheduledEnd, true);
        const enriched = await Promise.all(items.map(async (r) => {
          const crane = r.craneId ? await getCraneById(r.craneId) : null;

          const isAdminOrOperator = ctx.user?.role === 'admin' || ctx.user?.role === 'operator';
          const isOwner = ctx.user?.id === r.userId;
          const showDetails = isAdminOrOperator || isOwner;

          return {
            id: r.id,
            craneId: r.craneId,
            craneName: crane?.name ?? "Nepoznata dizalica",
            craneLocation: crane?.location ?? "",
            scheduledStart: r.scheduledStart,
            scheduledEnd: r.scheduledEnd,
            // Mask sensitive data for non-owners/non-admins
            vesselType: showDetails ? r.vesselType : (r.isMaintenance ? "Održavanje" : "Zauzeto"),
            liftPurpose: showDetails ? r.liftPurpose : undefined,
            status: r.status,
            userId: r.userId,
            isMaintenance: r.isMaintenance,
            isOwner,
          };
        }));

        const result = input?.craneId
          ? enriched.filter((e) => e.craneId === input.craneId)
          : enriched;

        return result;
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

  // ─── Seasons ───────────────────────────────────────────────────────────
  season: router({
    list: publicProcedure.query(async () => listSeasons()),

    create: operatorProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        startDate: z.string(), // YYYY-MM-DD
        endDate: z.string(),
        workingHours: z.record(z.string(), z.object({ from: z.string(), to: z.string() })),
      }))
      .mutation(async ({ input, ctx }) => {
        const season = await createSeason(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "season_created", entityType: "season", entityId: season.id });
        return season;
      }),

    update: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        workingHours: z.record(z.string(), z.object({ from: z.string(), to: z.string() })).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateSeason(id, data);
        await createAuditEntry({ actorId: ctx.user.id, action: "season_updated", entityType: "season", entityId: id });
        return { success: true };
      }),

    delete: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteSeason(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "season_deleted", entityType: "season", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Holidays ──────────────────────────────────────────────────────────
  holiday: router({
    list: publicProcedure.query(async () => listHolidays()),

    create: operatorProcedure
      .input(z.object({
        date: z.string(), // YYYY-MM-DD
        name: z.string().min(1).max(255),
        isRecurring: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const holiday = await createHoliday(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "holiday_created", entityType: "holiday", entityId: holiday.id });
        return holiday;
      }),

    delete: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteHoliday(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "holiday_deleted", entityType: "holiday", entityId: input.id });
        return { success: true };
      }),

    seed: operatorProcedure
      .mutation(async ({ ctx }) => {
        await seedCroatianHolidays();
        await createAuditEntry({ actorId: ctx.user.id, action: "holidays_seeded", entityType: "holiday" });
        return { success: true };
      }),

    // Public: check if a date is blocked
    checkDate: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        const holiday = await isHoliday(input.date);
        const season = await getActiveSeason(input.date);
        return {
          isBlocked: holiday || !season,
          isHoliday: holiday,
          isOutOfSeason: !season,
          season: season ? { name: season.name, workingHours: season.workingHours } : null,
        };
      }),
  }),

  // ─── API Keys (Admin Only) ─────────────────────────────────────────────
  apiKey: router({
    list: adminProcedure.query(async () => listApiKeys()),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        const crypto = await import("crypto");
        const rawKey = crypto.randomBytes(32).toString("hex");
        const key = await createApiKey({
          name: input.name,
          key: rawKey,
          createdBy: ctx.user.id,
        });
        await createAuditEntry({ actorId: ctx.user.id, action: "api_key_created", entityType: "api_key", entityId: key.id });
        return { id: key.id, key: rawKey, name: key.name }; // Return key only once
      }),

    revoke: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await revokeApiKey(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "api_key_revoked", entityType: "api_key", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Maintenance (Admin Only) ──────────────────────────────────────────
  maintenance: router({
    create: operatorProcedure
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
    dashboard: operatorProcedure
      .input(z.object({
        range: z.enum(["7d", "30d", "90d", "365d", "all"]).optional().default("30d")
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const now = new Date();
        let startDate = new Date("2000-01-01"); // "all" fallback
        if (input.range !== "all") {
          startDate = new Date();
          const days = parseInt(input.range.replace("d", ""), 10);
          startDate.setDate(startDate.getDate() - days);
        }

        const allRes = await db.select().from(reservations).where(gte(reservations.scheduledStart, startDate));
        const allCranes = await db.select().from(cranes);
        const allServiceTypes = await db.select().from(serviceTypes);

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

        // 4. Trend Stats (Daily operations count)
        const trendMap: Record<string, number> = {};
        allRes.filter(r => r.status === "approved" && r.scheduledStart).forEach(r => {
          const day = r.scheduledStart!.toISOString().split('T')[0];
          trendMap[day] = (trendMap[day] || 0) + 1;
        });
        const trendStats = Object.entries(trendMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));

        // 5. Service Type Stats
        const serviceTypeMap: Record<string, number> = {};
        allRes.filter(r => r.status === "approved").forEach(r => {
          if (r.serviceTypeId) {
            const serviceInfo = allServiceTypes.find(st => st.id === r.serviceTypeId);
            if (serviceInfo) {
              serviceTypeMap[serviceInfo.name] = (serviceTypeMap[serviceInfo.name] || 0) + 1;
            }
          } else if (r.isMaintenance) {
            serviceTypeMap["Održavanje"] = (serviceTypeMap["Održavanje"] || 0) + 1;
          } else {
            serviceTypeMap["Nepoznato"] = (serviceTypeMap["Nepoznato"] || 0) + 1;
          }
        });
        const serviceTypeStats = Object.entries(serviceTypeMap).map(([name, value]) => ({ name, value }));

        return {
          craneStats,
          topUsers,
          cancelReasons: Object.entries(cancelReasons).map(([name, value]) => ({ name, value })),
          trendStats,
          serviceTypeStats,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
