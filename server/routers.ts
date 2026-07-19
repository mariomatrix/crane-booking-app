import { COOKIE_NAME, REFRESH_COOKIE_NAME, ACCESS_TOKEN_EXPIRY_MS, REFRESH_TOKEN_EXPIRY_MS } from "@shared/const";
import { getSessionCookieOptions, getRefreshCookieOptions } from "./_core/cookies";
import { getJwtSecret, getRefreshSecret } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, operatorProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { isValidOib } from "../shared/oib";
import { reportsRouter } from "./reports.router";
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
  listLandZones,
  getLandZoneCapacity,
  createLandZone,
  updateLandZone,
  deleteLandZone,
  listActiveOccupancies,
  listOccupancyHistory,
  createLandOccupancy,
  completeLandOccupancy,
  getActiveOccupancyByVessel,
  listLandWaitingList,
  addLandWaitingListEntry,
  updateLandWaitingListStatus,
  reorderWaitingList,
  logCraneOperation,
  listCraneOps,
  getCraneStats,
} from "./db";
import { TRPCError } from "@trpc/server";
import {
  sendReservationConfirmation,
  sendReservationRejection,
  sendWaitingListNotification,
  sendPasswordResetEmail,
  sendEmailVerification,
  sendUserInvitation,
  sendNewMessageNotification,
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
  landWaitingList,
  landOccupancies,
  landZones,
  vessels,
} from "../drizzle/schema";
import { and, eq, gte, isNull, or, lte, desc, asc, sql, ne } from "drizzle-orm";
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
        oib: z.string().length(11).refine(isValidOib, { message: "OIB nije ispravan." }),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email je već registriran." });
        }
        // Check OIB uniqueness
        const db = await getDb();
        if (db) {
          const oibExists = await db.select({ id: users.id }).from(users).where(eq(users.oib, input.oib)).limit(1);
          if (oibExists.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Korisnik s tim OIB-om već postoji." });
          }
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const userId = await createLocalUser({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          username: input.username,
          phone: input.phone,
          oib: input.oib,
        });
        if (!userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Issue access + refresh token pair
        await issueTokenPair(String(userId), "user", ctx);

        // Send verification email
        const verifyToken = await createEmailVerificationToken(String(userId));
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:5173";
        const verifyUrl = `${baseUrl}/auth?verifyToken=${verifyToken}`;
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

        const resetUrl = `${process.env.PUBLIC_URL || "http://localhost:5173"}/auth?token=${token}`;
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
          .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
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
        const verifyUrl = `${baseUrl}/auth?verifyToken=${verifyToken}`;
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

    listByUser: operatorProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        return listVesselsByUser(input.userId);
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
        weightTons: z.number().positive().optional(),
        registration: z.string().optional(),
        ownerId: z.string().uuid().optional(),
      }))
      .mutation(async ({ input, ctx }: any) => {
        const targetOwnerId = (input.ownerId && (ctx.user.role === "admin" || ctx.user.role === "operator"))
          ? input.ownerId
          : ctx.user.id;

        const id = await createVessel({
          ...input,
          ownerId: targetOwnerId,
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
        weightTons: z.number().positive().optional(),
        registration: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }: any) => {
        const { id, ...data } = input;
        const vessel = await getVesselById(id);
        if (!vessel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plovilo nije pronađeno." });
        }

        const isAuthorized = ctx.user.role === "admin" || ctx.user.role === "operator" || vessel.ownerId === ctx.user.id;
        if (!isAuthorized) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Nemate ovlasti za izmjenu ovog plovila." });
        }

        await updateVessel(id, vessel.ownerId, data as any);
        await createAuditEntry({ actorId: ctx.user.id, action: "vessel_updated", entityType: "vessel", entityId: id });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const vessel = await getVesselById(input.id);
        if (!vessel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plovilo nije pronađeno." });
        }

        const isAuthorized = ctx.user.role === "admin" || ctx.user.role === "operator" || vessel.ownerId === ctx.user.id;
        if (!isAuthorized) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Nemate ovlasti za brisanje ovog plovila." });
        }

        await deleteVessel(input.id, vessel.ownerId);
        await createAuditEntry({ actorId: ctx.user.id, action: "vessel_deleted", entityType: "vessel", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── User Management (Admin) ──────────────────────────────────────────
  user: router({
    list: operatorProcedure
      .input(z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(100),
        search: z.string().optional(),
        role: z.string().optional(),
        status: z.string().optional(),
      }).optional().default({ page: 1, pageSize: 100 }))
      .query(async ({ input }) => {
        const { page, pageSize, search, role, status } = input;
        const offset = (page - 1) * pageSize;
        return listAllUsers(pageSize, offset, search, role, status);
      }),

    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        oib: z.string().length(11).refine(isValidOib, { message: "OIB nije ispravan." }),
        role: z.enum(["user", "operator", "admin"]).default("user"),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email je već registriran." });
        }

        // Check OIB uniqueness
        const db = await getDb();
        if (db) {
          const oibExists = await db.select({ id: users.id }).from(users).where(eq(users.oib, input.oib)).limit(1);
          if (oibExists.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Korisnik s tim OIB-om već postoji." });
          }
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
          oib: input.oib,
          mustChangePassword: true,
        });

        if (!userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Update role if not default "user"
        if (input.role !== "user") {
          await updateUserRole(String(userId), input.role);
        }

        // Send invitation email
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:5173";
        const loginUrl = `${baseUrl}/auth`;

        const emailSent = await sendUserInvitation({
          to: input.email,
          userName: input.firstName,
          tempPassword,
          loginUrl,
        });

        if (!emailSent) {
          console.warn(`[Email] Failed to send invitation to ${input.email}`);
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_created_admin",
          entityType: "user",
          entityId: String(userId),
          payload: { email: input.email, role: input.role },
        });

        return { success: true, tempPassword, userId: String(userId) };
      }),

    importCsv: adminProcedure
      .input(z.object({ csvContent: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { csvContent } = input;
        const lines = csvContent.split(/\r?\n/);
        if (lines.length < 2) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "CSV datoteka je prazna." });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });
        }

        const defaultPassword = "Spinut1234!";
        const defaultPasswordHash = await bcrypt.hash(defaultPassword, 10);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let vesselCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const cols: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
              const char = line[j];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                cols.push(current);
                current = '';
              } else {
                current += char;
              }
            }
            cols.push(current);
            const cleanCols = cols.map(c => c.trim().replace(/^"|"$/g, ''));

            if (cleanCols.length < 2) {
              skippedCount++;
              continue;
            }

            const id = cleanCols[0];
            const fullName = cleanCols[1];
            const rawEmail = cleanCols[2];
            const phone = cleanCols[3];

            let oib: string | null = null;
            let vesselName: string | null = null;
            let vesselRegistration: string | null = null;

            // Dynamically detect column layout (up to 7 columns)
            if (cleanCols.length >= 7) {
              oib = cleanCols[4] || null;
              vesselName = cleanCols[5] || null;
              vesselRegistration = cleanCols[6] || null;
            } else if (cleanCols.length === 6) {
              const col4 = cleanCols[4];
              // Heuristic check: is 5th column an 11-digit OIB?
              if (col4 && /^\d{11}$/.test(col4)) {
                oib = col4;
                vesselName = cleanCols[5] || null;
              } else {
                vesselName = col4 || null;
                vesselRegistration = cleanCols[5] || null;
              }
            } else {
              vesselName = cleanCols[4] || null;
            }

            if (!id || !fullName) {
              skippedCount++;
              continue;
            }

            const nameParts = fullName.split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";

            let email = rawEmail.split(/[\s,;]+/)[0]?.trim();
            if (!email || !email.includes("@")) {
              const cleanId = id.toLowerCase().replace(/[^a-z0-9]/g, "");
              email = `clan_${cleanId}@psd-spinut.hr`;
            } else {
              email = email.toLowerCase();
            }

            // OIB validation
            const cleanOib = oib ? oib.trim() : null;
            const validOib = cleanOib && isValidOib(cleanOib) ? cleanOib : null;

            let existingUser: any = null;

            // 1. Try matching by valid OIB first
            if (validOib) {
              const byOib = await db.select().from(users).where(eq(users.oib, validOib)).limit(1);
              if (byOib.length > 0) {
                existingUser = byOib[0];
              }
            }

            // 2. Fallback to matching by Email
            if (!existingUser) {
              const byEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
              if (byEmail.length > 0) {
                existingUser = byEmail[0];
              }
            }

            let userId: string;

            if (existingUser) {
              userId = existingUser.id;
              
              // Handle email change safety if matched by OIB
              let finalEmail = email;
              if (existingUser.email !== email) {
                const emailConflict = await db.select().from(users).where(eq(users.email, email)).limit(1);
                if (emailConflict.length > 0) {
                  finalEmail = existingUser.email; // Fallback to avoid constraint error
                }
              }

              await db.update(users).set({
                name: fullName,
                firstName,
                lastName,
                email: finalEmail,
                phone: phone || existingUser.phone,
                oib: validOib || existingUser.oib,
                emailVerifiedAt: existingUser.emailVerifiedAt || new Date(),
                updatedAt: new Date(),
              }).where(eq(users.id, userId));
            } else {
              // Create new user
              const newUserRows = await db.insert(users).values({
                email,
                passwordHash: defaultPasswordHash,
                name: fullName,
                firstName,
                lastName,
                phone: phone || null,
                oib: validOib || null,
                role: "user",
                userStatus: "active",
                emailVerifiedAt: new Date(),
                mustChangePassword: true,
              }).returning({ id: users.id });
              userId = newUserRows[0].id;
              successCount++;
            }

            // 3. Process vessel (supports multiple vessels per user)
            if (vesselName || vesselRegistration) {
              const finalVesselName = vesselName || vesselRegistration || "Plovilo";
              const finalVesselReg = vesselRegistration || vesselName || null;

              const existingVessels = await db.select().from(vessels).where(eq(vessels.ownerId, userId));
              const hasVessel = existingVessels.some(v => 
                (vesselName && v.name.toLowerCase() === vesselName.toLowerCase()) ||
                (vesselRegistration && v.registration && v.registration.toLowerCase() === vesselRegistration.toLowerCase())
              );

              if (!hasVessel) {
                await db.insert(vessels).values({
                  ownerId: userId,
                  name: finalVesselName,
                  type: "ostalo",
                  registration: finalVesselReg,
                });
                vesselCount++;
              }
            }
          } catch (err: any) {
            console.error("Failed to import user on line " + (i + 1), err);
            errorCount++;
          }
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "users_imported_csv",
          entityType: "user",
          entityId: ctx.user.id,
          payload: { successCount, skippedCount, errorCount, vesselCount },
        });

        return {
          success: true,
          successCount,
          skippedCount,
          errorCount,
          vesselCount,
        };
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
        oib: z.string().length(11).refine(isValidOib, { message: "OIB nije ispravan." }).optional(),
        role: z.enum(["user", "operator", "admin"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateUser: updateUserDb, updateUserRole } = await import("./db");
        const { id, role, oib, ...data } = input;

        // Check OIB uniqueness if being updated
        if (oib) {
          const db = await getDb();
          if (db) {
            const oibExists = await db.select({ id: users.id }).from(users)
              .where(and(eq(users.oib, oib), ne(users.id, id)))
              .limit(1);
            if (oibExists.length > 0) {
              throw new TRPCError({ code: "CONFLICT", message: "Korisnik s tim OIB-om već postoji." });
            }
          }
        }

        if (Object.keys(data).length > 0 || oib) {
          await updateUserDb(id, { ...data, ...(oib ? { oib } : {}) });
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
          payload: oib ? { oib_updated: true } : undefined,
        });
        return { success: true };
      }),

    verifyEmail: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(users)
          .set({ emailVerifiedAt: new Date(), userStatus: "active", updatedAt: new Date() })
          .where(eq(users.id, input.id));

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "user_email_verified_admin",
          entityType: "user",
          entityId: input.id,
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
          .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
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

    getCard: protectedProcedure
      .input(z.object({ userId: z.string().uuid().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const isStaff = ctx.user.role === "admin" || ctx.user.role === "operator";
        const targetId = (isStaff && input?.userId) ? input.userId : ctx.user.id;

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Get user profile
        const [userRecord] = await db.select().from(users).where(eq(users.id, targetId));
        if (!userRecord) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

        // Get reservations with crane info
        const userReservations = await db
          .select({
            id: reservations.id,
            reservationNumber: reservations.reservationNumber,
            status: reservations.status,
            requestedDate: reservations.requestedDate,
            requestedTimeSlot: reservations.requestedTimeSlot,
            scheduledStart: reservations.scheduledStart,
            scheduledEnd: reservations.scheduledEnd,
            durationMin: reservations.durationMin,
            vesselName: reservations.vesselName,
            vesselType: reservations.vesselType,
            vesselWeightTons: reservations.vesselWeightTons,
            userNote: reservations.userNote,
            adminNote: reservations.adminNote,
            craneId: reservations.craneId,
            createdAt: reservations.createdAt,
            craneName: cranes.name,
            craneLocation: cranes.location,
          })
          .from(reservations)
          .leftJoin(cranes, eq(reservations.craneId, cranes.id))
          .where(eq(reservations.userId, targetId))
          .orderBy(sql`${reservations.createdAt} desc`);

        // Get vessels
        const userVessels = await listVesselsByUser(targetId);

        // Calculate stats
        const stats = {
          total: userReservations.length,
          pending: userReservations.filter(r => r.status === "pending").length,
          approved: userReservations.filter(r => r.status === "approved").length,
          completed: userReservations.filter(r => r.status === "completed").length,
          rejected: userReservations.filter(r => r.status === "rejected").length,
          cancelled: userReservations.filter(r => r.status === "cancelled").length,
        };

        return {
          user: {
            id: userRecord.id,
            name: userRecord.name,
            firstName: userRecord.firstName,
            lastName: userRecord.lastName,
            email: userRecord.email,
            phone: userRecord.phone,
            role: userRecord.role,
            createdAt: userRecord.createdAt,
            lastSignedIn: userRecord.lastSignedIn,
          },
          stats,
          reservations: userReservations,
          vessels: userVessels,
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
        maxCapacityKN: z.number().positive(),
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
        maxCapacityKN: z.number().positive().optional(),
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
        userId: z.string().uuid().optional(), // For admins creating on behalf of a user
        isAutoApprove: z.boolean().optional(),
        craneId: z.string().uuid().optional(),
        scheduledStart: z.date().optional(),
        durationMin: z.number().int().positive().optional(),
        // Service type — required in v2.0
        serviceTypeId: z.string().uuid(),
        // Requested time — user preference (no crane assignment at this stage)
        requestedDate: z.string().min(1), // YYYY-MM-DD
        requestedTimeSlot: z.enum(["jutro", "poslijepodne", "po_dogovoru"]).default("po_dogovoru"),
        userNote: z.string().max(1000).optional(),
        // Vessel data
        vesselId: z.string().uuid().optional(),
        vesselType: z.enum(["jedrilica", "motorni", "katamaran", "ostalo"]),
        vesselRegistration: z.string().optional(),
        vesselLengthM: z.number().positive().optional(),
        vesselBeamM: z.number().positive().optional(),
        vesselDraftM: z.number().positive().optional(),
        vesselWeightTons: z.number().nonnegative().optional(),
        // Contact
        contactPhone: z.string().min(6),
        // Land zone
        landZoneId: z.string().uuid().optional(),
        overrideCapacityCheck: z.boolean().optional(),
        status: z.enum(["pending", "waitlisted"]).optional(),
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

        // Capacity check for lift_from_sea
        if (serviceType.operationCategory === "lift_from_sea" && input.landZoneId) {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

          // Check if there is an active waiting list queue for this zone
          const existingQueue = await db
            .select({ count: sql<number>`count(*)` })
            .from(landWaitingList)
            .where(and(
              eq(landWaitingList.preferredZoneId, input.landZoneId),
              or(eq(landWaitingList.status, "waiting"), eq(landWaitingList.status, "offered"))
            ));
          const queueCount = Number(existingQueue[0]?.count ?? 0);

          if (queueCount > 0 && !input.overrideCapacityCheck && input.status !== "waitlisted") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Upozorenje: Na listi čekanja za ovu zonu već čeka ${queueCount} klijenata. Želite li nastaviti i preskočiti listu čekanja? Potvrdite override za nastavak.`,
            });
          }

          const cap = await getLandZoneCapacity(input.landZoneId);
          if (cap.isOver80 && !input.overrideCapacityCheck && input.status !== "waitlisted") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Zona ${cap.name} (${cap.code}) je popunjena ${cap.percentFull}% (${cap.activeSpots}/${cap.totalSpots} mjesta). Molimo potvrdite override ako želite nastaviti.`,
            });
          }
        }

        // 3. Build vessel snapshot
        let vesselSnapshot: Record<string, any> = {
          vesselType: input.vesselType,
          vesselRegistration: input.vesselRegistration,
          vesselLengthM: input.vesselLengthM ? String(input.vesselLengthM) : undefined,
          vesselBeamM: input.vesselBeamM ? String(input.vesselBeamM) : undefined,
          vesselDraftM: input.vesselDraftM ? String(input.vesselDraftM) : undefined,
          vesselWeightTons: input.vesselWeightTons ?? 0,
          contactPhone: input.contactPhone,
          liftPurpose: null,  // v2: no liftPurpose, use userNote
        };

        // If existing vessel, pull snapshot from DB
        if (input.vesselId) {
          const vessel = await getVesselById(input.vesselId);
          if (vessel) {
            vesselSnapshot = {
              vesselType: vessel.type,
              vesselRegistration: vessel.registration,
              vesselLengthM: vessel.lengthM ?? undefined,
              vesselBeamM: vessel.beamM ?? undefined,
              vesselDraftM: vessel.draftM ?? undefined,
              vesselWeightTons: vessel.weightTons ?? 0,
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

        const targetUserId = (ctx.user.role === 'admin' || ctx.user.role === 'operator') && input.userId
          ? input.userId
          : ctx.user.id;

        const targetUser = await getUserById(targetUserId);
        if (!targetUser) throw new TRPCError({ code: "BAD_REQUEST", message: "Korisnik nije pronađen." });

        let finalStatus = input.status === "waitlisted" ? "waitlisted" : "pending";
        let finalCraneId = undefined;
        let finalScheduledStart = undefined;
        let finalScheduledEnd = undefined;
        let finalDurationMin = undefined;
        let finalApprovedBy = undefined;
        let finalApprovedAt = undefined;
        let autoApproveCrane = null;

        if (finalStatus !== "waitlisted" && input.isAutoApprove && (ctx.user.role === 'admin' || ctx.user.role === 'operator')) {
          if (!input.craneId || !input.scheduledStart || !input.durationMin) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nedostaju podaci za automatsko odobrenje." });
          }
          autoApproveCrane = await getCraneById(input.craneId);
          if (!autoApproveCrane || autoApproveCrane.craneStatus !== "active") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Odabrana dizalica nije aktivna." });
          }

          finalScheduledEnd = new Date(input.scheduledStart.getTime() + input.durationMin * 60000);

          if (vesselSnapshot.vesselWeightTons && (Number(vesselSnapshot.vesselWeightTons) * 10) > Number(autoApproveCrane.maxCapacityKN)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Težina plovila (${vesselSnapshot.vesselWeightTons} t) prelazi kapacitet dizalice (${autoApproveCrane.maxCapacityKN} kN).`,
            });
          }

          const hasOverlap = await checkOverlap(input.craneId, input.scheduledStart, finalScheduledEnd);
          if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Drugi termin se preklapa s ovim." });

          finalStatus = "approved";
          finalCraneId = input.craneId;
          finalScheduledStart = input.scheduledStart;
          finalDurationMin = input.durationMin;
          finalApprovedBy = ctx.user.id;
          finalApprovedAt = new Date();
        }

        const { reservations: resTable } = await import("../drizzle/schema");
        const created = await db.insert(resTable).values({
          userId: targetUserId,
          vesselId: input.vesselId,
          serviceTypeId: input.serviceTypeId,
          requestedDate: input.requestedDate,
          requestedTimeSlot: input.requestedTimeSlot,
          status: finalStatus as any,
          reservationNumber,
          craneId: finalCraneId,
          scheduledStart: finalScheduledStart,
          scheduledEnd: finalScheduledEnd,
          durationMin: finalDurationMin,
          approvedBy: finalApprovedBy,
          approvedAt: finalApprovedAt,
          vesselType: vesselSnapshot.vesselType,
          vesselRegistration: vesselSnapshot.vesselRegistration,
          vesselLengthM: vesselSnapshot.vesselLengthM,
          vesselBeamM: vesselSnapshot.vesselBeamM,
          vesselDraftM: vesselSnapshot.vesselDraftM,
          vesselWeightTons: vesselSnapshot.vesselWeightTons,
          contactPhone: input.contactPhone,
          userNote: input.userNote,
          landZoneId: input.landZoneId,
        }).returning({ id: resTable.id });

        const resId = created[0]?.id;
        if (!resId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (finalStatus === "waitlisted") {
          let nextPos = 1;
          if (input.landZoneId) {
            const maxPosRes = await db
              .select({ maxPos: sql<number>`max(position)` })
              .from(landWaitingList)
              .where(eq(landWaitingList.preferredZoneId, input.landZoneId));
            nextPos = (Number(maxPosRes[0]?.maxPos) || 0) + 1;
          } else {
            const maxPosRes = await db
              .select({ maxPos: sql<number>`max(position)` })
              .from(landWaitingList);
            nextPos = (Number(maxPosRes[0]?.maxPos) || 0) + 1;
          }

          await db.insert(landWaitingList).values({
            userId: targetUserId,
            vesselId: input.vesselId,
            preferredZoneId: input.landZoneId,
            position: nextPos,
            status: "waiting",
            reservationId: resId,
            note: input.userNote,
          });

          await createAuditEntry({
            actorId: ctx.user.id,
            action: "land_waiting_added_auto",
            entityType: "land_waiting_list",
            entityId: resId,
            payload: { zoneId: input.landZoneId },
          });
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_created",
          entityType: "reservation",
          entityId: resId,
          payload: { serviceTypeId: input.serviceTypeId, requestedDate: input.requestedDate },
        });

        // Send confirmation email to user
        const { sendReservationReceived, sendReservationConfirmation } = await import("./_core/email");

        if (finalStatus === "approved" && autoApproveCrane && finalScheduledStart && finalScheduledEnd) {
          sendReservationConfirmation({
            to: targetUser.email,
            userName: targetUser.name || targetUser.firstName || targetUser.email,
            craneName: autoApproveCrane.name,
            startDate: finalScheduledStart,
            endDate: finalScheduledEnd,
            craneLocation: autoApproveCrane.location || autoApproveCrane.name,
            vesselRegistration: vesselSnapshot.vesselRegistration || undefined,
            vesselType: vesselSnapshot.vesselType || undefined,
            vesselWeightTons: vesselSnapshot.vesselWeightTons || undefined,
            userNote: input.userNote || undefined,
          }).catch(console.warn);
        } else {
          sendReservationReceived({
            to: targetUser.email,
            userName: targetUser.name || targetUser.firstName || targetUser.email,
            reservationNumber,
            requestedDate: input.requestedDate,
            vesselRegistration: vesselSnapshot.vesselRegistration || undefined,
            vesselType: vesselSnapshot.vesselType || undefined,
            vesselWeightTons: vesselSnapshot.vesselWeightTons || undefined,
            contactPhone: input.contactPhone,
            userNote: input.userNote || undefined,
            lang: "hr"
          }).catch(console.warn);
        }

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

        let landZone = null;
        if (reservation.landZoneId) {
          const db = await getDb();
          if (db) {
            const [lz] = await db.select().from(landZones).where(eq(landZones.id, reservation.landZoneId)).limit(1);
            if (lz) landZone = { id: lz.id, name: lz.name, code: lz.code };
          }
        }

        let activeLandOccupancy = null;
        if (reservation.vesselId) {
          const occ = await getActiveOccupancyByVessel(reservation.vesselId);
          if (occ) {
            const db = await getDb();
            let occZone = null;
            if (db) {
              const [lz] = await db.select().from(landZones).where(eq(landZones.id, occ.zoneId)).limit(1);
              if (lz) occZone = { id: lz.id, name: lz.name, code: lz.code };
            }
            activeLandOccupancy = {
              ...occ,
              zone: occZone,
            };
          }
        }

        return {
          ...reservation,
          crane,
          user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
          landZone,
          activeLandOccupancy,
        };
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
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional().default({ page: 1, pageSize: 50 }))
      .query(async ({ input, ctx }) => {
        const { page, pageSize, ...filters } = input;
        const offset = (page - 1) * pageSize;
        const db = await getDb();
        if (!db) return { data: [], total: 0 };

        const conditions = [];
        if (filters.status && filters.status.length > 0) {
          const statusOrs = filters.status.map(s => eq(reservations.status, s as any));
          conditions.push(or(...statusOrs));
        }
        if (filters.userId) conditions.push(eq(reservations.userId, filters.userId));
        if (filters.vesselId) conditions.push(eq(reservations.vesselId, filters.vesselId));

        // Date range filtering - check both confirmed schedule and requested date (for pending)
        if (filters.scheduledStart && filters.scheduledEnd) {
          const startStr = filters.scheduledStart.toISOString().split('T')[0];
          const endStr = filters.scheduledEnd.toISOString().split('T')[0];
          conditions.push(
            or(
              and(gte(reservations.scheduledStart, filters.scheduledStart), lte(reservations.scheduledStart, filters.scheduledEnd)),
              and(gte(reservations.requestedDate, startStr), lte(reservations.requestedDate, endStr))
            )
          );
        } else {
          if (filters.scheduledStart) conditions.push(gte(reservations.scheduledStart, filters.scheduledStart));
          if (filters.scheduledEnd) conditions.push(lte(reservations.scheduledEnd, filters.scheduledEnd));
        }

        const countQuery = db.select({ count: sql<number>`count(*)` }).from(reservations);
        if (conditions.length > 0) {
          countQuery.where(and(...conditions));
        }
        const [countRow] = await countQuery;

        // Subquery for unread message counts to avoid N+1
        const unreadCountSubquery = db
          .select({
            reservationId: messages.reservationId,
            count: sql<number>`count(*)::int`.as('count')
          })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(and(eq(messages.isRead, false), eq(users.role, "user")))
          .groupBy(messages.reservationId)
          .as('unread_counts');

        // Single optimized query with JOINs to eliminate N+1 problem
        const items = await db
          .select({
            reservation: reservations,
            user: {
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            },
            crane: {
              id: cranes.id,
              name: cranes.name,
              location: cranes.location,
            },
            serviceType: {
              id: serviceTypes.id,
              name: serviceTypes.name,
            },
            approver: {
              id: sql<string>`approver_users.id`,
              name: sql<string>`approver_users.name`,
            },
            landZone: {
              id: landZones.id,
              name: landZones.name,
              code: landZones.code,
            },
            unreadCount: sql<number>`COALESCE(${unreadCountSubquery.count}, 0)`
          })
          .from(reservations)
          .leftJoin(users, eq(reservations.userId, users.id))
          .leftJoin(cranes, eq(reservations.craneId, cranes.id))
          .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
          .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
          .leftJoin(sql`${users} as approver_users`, eq(reservations.approvedBy, sql`approver_users.id`))
          .leftJoin(unreadCountSubquery, eq(reservations.id, unreadCountSubquery.reservationId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(reservations.createdAt))
          .limit(pageSize)
          .offset(offset);

        const data = items.map((row) => ({
            ...row.reservation,
            crane: row.crane?.id ? row.crane : null,
            user: row.user?.id ? row.user : null,
            serviceType: row.serviceType?.id ? row.serviceType : null,
            approver: row.approver?.id ? row.approver : null,
            landZone: row.landZone?.id ? row.landZone : null,
            unreadCount: row.unreadCount
        }));

        return { data, total: Number(countRow.count) };
      }),

    approve: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        craneId: z.string().uuid(),
        scheduledStart: z.date(),
        durationMin: z.number().int().positive().default(60),
        adminNote: z.string().optional(),
        ignoreNoSpace: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending" && reservation.status !== "waitlisted") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Samo rezervacije na čekanju ili na listi čekanja se mogu odobriti." });
        }

        // Check dry berth capacity if it is a haul-out (Dizanje iz mora)
        const serviceType = reservation.serviceTypeId ? await getServiceTypeById(reservation.serviceTypeId) : null;
        const isLiftFromSea = serviceType?.operationCategory === "lift_from_sea";
        if (isLiftFromSea && reservation.landZoneId) {
          const db = await getDb();
          if (db) {
            // Check if there is an active waiting list queue for this zone that contains other entries
            const existingQueue = await db
              .select({ count: sql<number>`count(*)` })
              .from(landWaitingList)
              .where(and(
                eq(landWaitingList.preferredZoneId, reservation.landZoneId),
                or(eq(landWaitingList.status, "waiting"), eq(landWaitingList.status, "offered")),
                ne(landWaitingList.reservationId, input.id)
              ));
            const queueCount = Number(existingQueue[0]?.count ?? 0);

            if (queueCount > 0 && !input.ignoreNoSpace) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Upozorenje: Na listi čekanja za ovu zonu već čeka ${queueCount} drugih klijenata. Potvrdite ignoriranje limita ako želite preskočiti listu.`,
              });
            }

            const cap = await getLandZoneCapacity(reservation.landZoneId);
            if (cap.isOver80 && !input.ignoreNoSpace) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `Zona ${cap.name} (${cap.code}) je popunjena ${cap.percentFull}% (${cap.activeSpots}/${cap.totalSpots} mjesta). Potvrdite ignoriranje limita za nastavak.`,
              });
            }
          }
        }

        // Validate crane
        const crane = await getCraneById(input.craneId);
        if (!crane || crane.craneStatus !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Odabrana dizalica nije aktivna." });
        }

        // Compute scheduled end
        const scheduledEnd = new Date(input.scheduledStart.getTime() + input.durationMin * 60000);

        // Validate weight vs crane capacity
        if (reservation.vesselWeightTons && (Number(reservation.vesselWeightTons) * 10) > Number(crane.maxCapacityKN)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Težina plovila (${reservation.vesselWeightTons} t) prelazi kapacitet dizalice (${crane.maxCapacityKN} kN).`,
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

          // Update linked waiting list entry to assigned
          await db.update(landWaitingList)
            .set({
              status: "assigned",
              updatedAt: new Date()
            })
            .where(eq(landWaitingList.reservationId, input.id));
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
            vesselRegistration: reservation.vesselRegistration || undefined,
            vesselType: reservation.vesselType || undefined,
            vesselWeightTons: reservation.vesselWeightTons || undefined,
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
      .input(z.object({
        id: z.string().uuid(),
        zoneId: z.string().uuid().optional(),
        spotNumber: z.number().int().positive().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Samo odobrene rezervacije se mogu označiti kao završene." });
        }

        const serviceType = reservation.serviceTypeId ? await getServiceTypeById(reservation.serviceTypeId) : null;
        const isLiftFromSea = serviceType?.operationCategory === "lift_from_sea";
        const isLowerToSea = serviceType?.operationCategory === "lower_to_sea";

        // 1. Dry Berth (Kopnene zone) logic
        if (isLiftFromSea && reservation.vesselId && reservation.userId) {
          // Haul out: place boat on dry berth
          let targetZoneId = input.zoneId || reservation.landZoneId;
          if (!targetZoneId) {
            // Find first zone with available capacity
            const zones = await listLandZones();
            const freeZone = zones.find(z => z.activeSpots < z.totalSpots && z.isActive);
            if (freeZone) {
              targetZoneId = freeZone.id;
            } else if (zones.length > 0) {
              targetZoneId = zones[0].id;
            }
          }
          if (targetZoneId) {
            await createLandOccupancy({
              vesselId: reservation.vesselId,
              userId: reservation.userId,
              zoneId: targetZoneId,
              spotNumber: input.spotNumber,
              reservationId: reservation.id,
              liftedAt: new Date(),
              createdBy: ctx.user.id,
              note: input.note,
            });
          }
        } else if (isLowerToSea && reservation.vesselId) {
          // Launch: remove boat from dry berth
          const activeOccupancy = await getActiveOccupancyByVessel(reservation.vesselId);
          if (activeOccupancy) {
            await completeLandOccupancy(activeOccupancy.id, reservation.id, new Date());
          }
        }

        // 2. Log crane operation
        if (reservation.craneId) {
          const startTime = reservation.scheduledStart ? new Date(reservation.scheduledStart) : new Date();
          const endTime = new Date();
          const durationMinutes = reservation.durationMin ?? Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
          await logCraneOperation({
            craneId: reservation.craneId,
            reservationId: reservation.id,
            operationType: isLiftFromSea ? "lift" : isLowerToSea ? "lower" : "move",
            startTime,
            endTime,
            durationMinutes,
            operatorId: ctx.user.id,
            note: input.note,
          });
        }

        // 3. Mark reservation completed
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
          payload: { zoneId: input.zoneId, spotNumber: input.spotNumber }
        });

        return { success: true };
      }),

    // Revert reservation to pending
    revertToPending: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "approved" && reservation.status !== "cancelled" && reservation.status !== "rejected") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Samo odobrene ili otkazane/odbijene rezervacije se mogu vratiti na obradu." });
        }

        const db = await getDb();
        if (db) {
          const { reservations: resTable } = await import("../drizzle/schema");
          await db.update(resTable).set({
            status: "pending",
            craneId: null, // Clear crane assignment so it can be re-assigned
            scheduledStart: null,
            scheduledEnd: null,
            approvedBy: null,
            approvedAt: null,
            updatedAt: new Date(),
          }).where(eq(resTable.id, input.id));
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_reverted_to_pending",
          entityType: "reservation",
          entityId: input.id,
        });

        const { notifyStatusChange } = await import("./services/notifications");
        notifyStatusChange(input.id).catch(console.error);

        return { success: true };
      }),

    updateLandZone: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        landZoneId: z.string().uuid().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

        await db.update(reservations)
          .set({ landZoneId: input.landZoneId, updatedAt: new Date() })
          .where(eq(reservations.id, input.id));

        // Update corresponding active land occupancy if it exists
        const { landOccupancies } = await import("../drizzle/schema");
        const active = await db.select().from(landOccupancies)
          .where(and(eq(landOccupancies.reservationId, input.id), isNull(landOccupancies.returnedAt)))
          .limit(1);
        if (active.length > 0 && input.landZoneId) {
          await db.update(landOccupancies)
            .set({ zoneId: input.landZoneId, updatedAt: new Date() })
            .where(eq(landOccupancies.id, active[0].id));
        }

        await createAuditEntry({
          actorId: ctx.user.id,
          action: "reservation_land_zone_updated",
          entityType: "reservation",
          entityId: input.id,
          payload: { landZoneId: input.landZoneId },
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
              const { sendNewMessageNotification } = await import("./_core/email");
              await sendNewMessageNotification({
                to: owner.email,
                userName: owner.name || owner.firstName || "Korisnik",
                reservationNumber: reservation.reservationNumber || "",
                messageBody: input.body,
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
        operationCategory: z.enum(["lift_from_sea", "lower_to_sea", "move", "maintenance", "other"]).default("other"),
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
        operationCategory: z.enum(["lift_from_sea", "lower_to_sea", "move", "maintenance", "other"]).optional(),
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
    events: operatorProcedure
      .input(z.object({
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        craneId: z.string().uuid().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [];
        conditions.push(or(eq(reservations.status, "approved"), eq(reservations.status, "pending")));

        if (input?.scheduledStart && input?.scheduledEnd) {
          const startStr = input.scheduledStart.toISOString().split('T')[0];
          const endStr = input.scheduledEnd.toISOString().split('T')[0];
          conditions.push(
            or(
              and(gte(reservations.scheduledStart, input.scheduledStart), lte(reservations.scheduledStart, input.scheduledEnd)),
              and(gte(reservations.requestedDate, startStr), lte(reservations.requestedDate, endStr))
            )
          );
        } else {
          if (input?.scheduledStart) conditions.push(gte(reservations.scheduledStart, input.scheduledStart));
          if (input?.scheduledEnd) conditions.push(lte(reservations.scheduledEnd, input.scheduledEnd));
        }

        if (input?.craneId) conditions.push(eq(reservations.craneId, input.craneId));

        const items = await db
          .select({
            reservation: reservations,
            crane: {
              id: cranes.id,
              name: cranes.name,
              location: cranes.location
            }
          })
          .from(reservations)
          .leftJoin(cranes, eq(reservations.craneId, cranes.id))
          .where(and(...conditions));

        const isAdminOrOperator = ctx.user?.role === 'admin' || ctx.user?.role === 'operator';

        return items.map((row) => {
          const r = row.reservation;
          const isOwner = ctx.user?.id === r.userId;
          const showDetails = isAdminOrOperator || isOwner;

          return {
            id: r.id,
            craneId: r.craneId,
            craneName: row.crane?.name ?? "Nepoznata dizalica",
            craneLocation: row.crane?.location ?? "",
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
        });
      }),

    availableSlots: operatorProcedure
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

    listAll: adminProcedure
      .input(z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      }).optional().default({ page: 1, pageSize: 50 }))
      .query(async ({ input }) => {
        const { page, pageSize } = input;
        const offset = (page - 1) * pageSize;
        const { data: items, total } = await listAllWaiting(pageSize, offset);
        const data = await Promise.all(items.map(async (w) => {
          const user = await getUserById(w.userId);
          const crane = w.craneId ? await getCraneById(w.craneId) : null;
          return { ...w, user: user ? { name: user.name, email: user.email, phone: user.phone } : null, crane: crane ? { name: crane.name } : null };
        }));
        return { data, total };
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
          vesselWeightTons: String(vesselData.weightTons || 0),
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
        key: z.enum(["slotDurationMinutes", "bufferMinutes", "workdayStart", "workdayEnd", "marinaName", "marinaLogo"]),
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
          vesselWeightTons: "0",
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

        let startDate = new Date("2000-01-01"); // "all" fallback
        if (input.range !== "all") {
          startDate = new Date();
          const days = parseInt(input.range.replace("d", ""), 10);
          startDate.setDate(startDate.getDate() - days);
        }

        // ─── Single query: reservations LEFT JOIN users ──────────────────
        // Eliminates the previous N+1 getUserById loop.
        // All reservation rows are enriched with userName in one DB round-trip.
        const allRes = await db
          .select({
            id: reservations.id,
            craneId: reservations.craneId,
            userId: reservations.userId,
            userName: sql<string>`COALESCE(${users.name}, ${users.email}, 'Unknown')`,
            status: reservations.status,
            isMaintenance: reservations.isMaintenance,
            scheduledStart: reservations.scheduledStart,
            scheduledEnd: reservations.scheduledEnd,
            cancelReason: reservations.cancelReason,
            serviceTypeId: reservations.serviceTypeId,
          })
          .from(reservations)
          .leftJoin(users, eq(reservations.userId, users.id))
          .where(gte(reservations.scheduledStart, startDate));

        const allCranes = await db.select().from(cranes);
        const allServiceTypes = await db.select().from(serviceTypes);

        // 1. Crane Statistics
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
            cancelledCount: cancelled.length,
          };
        });

        // 2. User Statistics (Top 5) — built from in-memory joined data, zero extra queries
        const userResCounts: Record<string, { count: number; name: string }> = {};
        for (const r of allRes) {
          if (r.status === "approved" && !r.isMaintenance) {
            if (!userResCounts[r.userId]) {
              userResCounts[r.userId] = { count: 0, name: r.userName };
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

  // ─── Land Zones (Kopnene zone) ────────────────────────────────────────
  landZone: router({
    list: operatorProcedure
      .query(async () => {
        return listLandZones();
      }),

    checkCapacity: operatorProcedure
      .input(z.object({ zoneId: z.string().uuid() }))
      .query(async ({ input }) => {
        return getLandZoneCapacity(input.zoneId);
      }),

    getActiveOccupancy: operatorProcedure
      .input(z.object({ vesselId: z.string().uuid() }))
      .query(async ({ input }) => {
        const occ = await getActiveOccupancyByVessel(input.vesselId);
        if (!occ) return null;
        const db = await getDb();
        if (db) {
          const [lz] = await db.select().from(landZones).where(eq(landZones.id, occ.zoneId)).limit(1);
          return {
            ...occ,
            zone: lz ? { id: lz.id, name: lz.name, code: lz.code } : null,
          };
        }
        return { ...occ, zone: null };
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        code: z.string().min(1).max(10),
        totalSpots: z.number().int().positive(),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createLandZone(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_zone_created", entityType: "land_zone", entityId: id });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        code: z.string().min(1).max(10).optional(),
        totalSpots: z.number().int().positive().optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateLandZone(id, data);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_zone_updated", entityType: "land_zone", entityId: id });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await deleteLandZone(input.id);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_zone_deleted", entityType: "land_zone", entityId: input.id });
        return { success: true };
      }),
  }),

  // ─── Land Occupancies (Boravak na kopnu) ──────────────────────────────────
  landOccupancy: router({
    listActive: operatorProcedure
      .input(z.object({
        zoneId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
      }).optional())
      .query(async ({ input }) => {
        return listActiveOccupancies(input);
      }),

    create: operatorProcedure
      .input(z.object({
        vesselId: z.string().uuid(),
        userId: z.string().uuid(),
        zoneId: z.string().uuid(),
        spotNumber: z.number().int().positive().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createLandOccupancy({
          ...input,
          liftedAt: new Date(),
          createdBy: ctx.user.id,
        });
        await createAuditEntry({ actorId: ctx.user.id, action: "land_occupancy_created", entityType: "land_occupancy", entityId: id });
        return { id };
      }),

    complete: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        returnReservationId: z.string().uuid().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await completeLandOccupancy(input.id, input.returnReservationId);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_occupancy_completed", entityType: "land_occupancy", entityId: input.id });
        return { success: true };
      }),

    history: operatorProcedure
      .input(z.object({
        zoneId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }).optional().default({ page: 1, pageSize: 50 }))
      .query(async ({ input }) => {
        const { page, pageSize, ...filters } = input;
        const offset = (page - 1) * pageSize;
        return listOccupancyHistory({
          ...filters,
          limit: pageSize,
          offset,
        });
      }),
  }),

  // ─── Land Waiting List (Lista čekanja za kopno) ─────────────────────────
  landWaiting: router({
    listAll: operatorProcedure
      .query(async () => {
        return listLandWaitingList();
      }),

    getMyStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) return null;

        const entry = await db
          .select({
            id: landWaitingList.id,
            position: landWaitingList.position,
            status: landWaitingList.status,
            createdAt: landWaitingList.createdAt,
            preferredZoneName: landZones.name,
          })
          .from(landWaitingList)
          .leftJoin(landZones, eq(landWaitingList.preferredZoneId, landZones.id))
          .where(and(
            eq(landWaitingList.userId, ctx.user.id),
            or(eq(landWaitingList.status, "waiting"), eq(landWaitingList.status, "offered"), eq(landWaitingList.status, "declined"))
          ))
          .limit(1);

        if (entry.length === 0) return null;
        return entry[0];
      }),

    add: operatorProcedure
      .input(z.object({
        userId: z.string().uuid(),
        vesselId: z.string().uuid().optional(),
        preferredZoneId: z.string().uuid().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await addLandWaitingListEntry(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_added", entityType: "land_waiting_list", entityId: id });
        return { id };
      }),

    offer: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const waitlistEntry = await db
          .select({
            id: landWaitingList.id,
            userId: landWaitingList.userId,
            userName: users.name,
            userEmail: users.email,
            userPhone: users.phone,
            preferredZoneId: landWaitingList.preferredZoneId,
            zoneName: landZones.name,
          })
          .from(landWaitingList)
          .innerJoin(users, eq(landWaitingList.userId, users.id))
          .leftJoin(landZones, eq(landWaitingList.preferredZoneId, landZones.id))
          .where(eq(landWaitingList.id, input.id))
          .limit(1);

        if (waitlistEntry.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        const row = waitlistEntry[0];

        await updateLandWaitingListStatus(input.id, "offered", { offeredAt: new Date() });
        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_offered", entityType: "land_waiting_list", entityId: input.id });

        // Send notifications asynchronously
        if (row.userEmail) {
          const { sendLandSpotAvailable } = await import("./_core/email");
          sendLandSpotAvailable({
            to: row.userEmail,
            userName: row.userName || row.userEmail,
            zoneName: row.zoneName || "Slobodna zona",
          }).catch(console.error);
        }

        if (row.userPhone) {
          const { sendLandSpotAvailableSms } = await import("./_core/sms");
          sendLandSpotAvailableSms({
            phone: row.userPhone,
            zoneName: row.zoneName || "Slobodna zona",
          }).catch(console.error);
        }

        return { success: true };
      }),

    assignFromOffer: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        zoneId: z.string().uuid(),
        spotNumber: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const waitlistEntry = await db.select().from(landWaitingList).where(eq(landWaitingList.id, input.id)).limit(1);
        if (waitlistEntry.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = waitlistEntry[0];

        if (!entry.vesselId) throw new TRPCError({ code: "BAD_REQUEST", message: "Zahtjev na listi čekanja nema povezano plovilo." });

        const occupancyId = await createLandOccupancy({
          vesselId: entry.vesselId,
          userId: entry.userId,
          zoneId: input.zoneId,
          spotNumber: input.spotNumber,
          createdBy: ctx.user.id,
          liftedAt: new Date(),
        });

        await updateLandWaitingListStatus(input.id, "assigned", {
          assignedOccupancyId: occupancyId,
        });

        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_assigned", entityType: "land_waiting_list", entityId: input.id });
        return { success: true, occupancyId };
      }),

    declineOffer: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const waitlistEntry = await db.select().from(landWaitingList).where(eq(landWaitingList.id, input.id)).limit(1);
        if (waitlistEntry.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = waitlistEntry[0];

        await updateLandWaitingListStatus(input.id, "declined", {
          declinedAt: new Date(),
          declineCount: entry.declineCount + 1,
        });
        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_declined", entityType: "land_waiting_list", entityId: input.id });
        return { success: true };
      }),

    remove: operatorProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        await updateLandWaitingListStatus(input.id, "cancelled");
        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_removed", entityType: "land_waiting_list", entityId: input.id });
        return { success: true };
      }),

     reorder: operatorProcedure
      .input(z.array(z.string().uuid()))
      .mutation(async ({ input, ctx }) => {
        await reorderWaitingList(input);
        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_reordered", entityType: "land_waiting_list", payload: { ids: input } });
        return { success: true };
      }),

    directAssign: operatorProcedure
      .input(z.object({
        id: z.string().uuid(),
        craneId: z.string().uuid(),
        scheduledStart: z.date(),
        durationMin: z.number().int().positive().default(60),
        adminNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const waitlistEntry = await db
          .select().from(landWaitingList)
          .where(eq(landWaitingList.id, input.id))
          .limit(1);
        if (waitlistEntry.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        const entry = waitlistEntry[0];

        if (!entry.reservationId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ovaj unos na listi nema povezanu rezervaciju dizalice." });
        }

        const reservation = await getReservationById(entry.reservationId);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Povezana rezervacija nije pronađena." });

        // Validate crane
        const crane = await getCraneById(input.craneId);
        if (!crane || crane.craneStatus !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Odabrana dizalica nije aktivna." });
        }

        const scheduledEnd = new Date(input.scheduledStart.getTime() + input.durationMin * 60000);
        const hasOverlap = await checkOverlap(input.craneId, input.scheduledStart, scheduledEnd, entry.reservationId);
        if (hasOverlap) throw new TRPCError({ code: "CONFLICT", message: "Drugi termin se preklapa s ovim." });

        // Update reservation to approved
        await db.update(reservations).set({
          craneId: input.craneId,
          scheduledStart: input.scheduledStart,
          scheduledEnd,
          durationMin: input.durationMin,
          status: "approved",
          adminNote: input.adminNote || reservation.adminNote,
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(reservations.id, entry.reservationId));

        // Update waitlist entry to assigned
        await updateLandWaitingListStatus(input.id, "assigned");

        await createAuditEntry({ actorId: ctx.user.id, action: "land_waiting_assigned_direct", entityType: "land_waiting_list", entityId: input.id });

        // Send confirmation email
        const user = await getUserById(entry.userId);
        if (user?.email) {
          const { sendReservationConfirmation } = await import("./_core/email");
          sendReservationConfirmation({
            to: user.email,
            userName: user.name || user.email,
            craneName: crane.name,
            startDate: input.scheduledStart,
            endDate: scheduledEnd,
            craneLocation: crane.location || "",
            adminNotes: input.adminNote,
          }).catch(console.error);
        }

        return { success: true };
      }),

    listByZone: operatorProcedure
      .input(z.object({
        zoneId: z.string().uuid(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select({
            id: landWaitingList.id,
            userId: landWaitingList.userId,
            vesselId: landWaitingList.vesselId,
            preferredZoneId: landWaitingList.preferredZoneId,
            position: landWaitingList.position,
            status: landWaitingList.status,
            note: landWaitingList.note,
            adminNote: landWaitingList.adminNote,
            reservationId: landWaitingList.reservationId,
            createdAt: landWaitingList.createdAt,
            user: {
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
              oib: users.oib,
            },
            vessel: {
              id: vessels.id,
              name: vessels.name,
              type: vessels.type,
              registration: vessels.registration,
            },
          })
          .from(landWaitingList)
          .innerJoin(users, eq(landWaitingList.userId, users.id))
          .leftJoin(vessels, eq(landWaitingList.vesselId, vessels.id))
          .where(and(
            eq(landWaitingList.preferredZoneId, input.zoneId),
            or(eq(landWaitingList.status, "waiting"), eq(landWaitingList.status, "offered"), eq(landWaitingList.status, "declined"))
          ))
          .orderBy(asc(landWaitingList.position), asc(landWaitingList.createdAt));
      }),
  }),

  // ─── Crane Operations (Rad dizalica) ───────────────────────────────────
  craneOps: router({
    log: operatorProcedure
      .input(z.object({
        craneId: z.string().uuid(),
        reservationId: z.string().uuid().optional(),
        operationType: z.string(),
        startTime: z.date(),
        endTime: z.date(),
        durationMinutes: z.number().int().positive(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await logCraneOperation({
          ...input,
          operatorId: ctx.user.id,
        });
        await createAuditEntry({ actorId: ctx.user.id, action: "crane_operation_logged", entityType: "crane_operation_log", entityId: id });
        return { id };
      }),

    stats: adminProcedure
      .query(async () => {
        return getCraneStats();
      }),

    listByCrane: operatorProcedure
      .input(z.object({
        craneId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }).optional().default({ page: 1, pageSize: 50 }))
      .query(async ({ input }) => {
        const { page, pageSize, ...filters } = input;
        const offset = (page - 1) * pageSize;
        return listCraneOps({
          ...filters,
          limit: pageSize,
          offset,
        });
      }),
  }),

  // ─── Reports ───────────────────────────────────────────────────────────
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
