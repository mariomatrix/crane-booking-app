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
} from "./db";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./_core/notification";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Crane Procedures ──────────────────────────────────────────────
  crane: router({
    list: publicProcedure
      .input(z.object({ activeOnly: z.boolean().optional().default(true) }).optional())
      .query(async ({ input }) => {
        return listCranes(input?.activeOnly ?? true);
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const crane = await getCraneById(input.id);
        if (!crane) throw new TRPCError({ code: "NOT_FOUND", message: "Crane not found" });
        return crane;
      }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          type: z.enum(["tower", "mobile", "crawler", "overhead", "telescopic", "loader", "other"]),
          capacity: z.string(),
          capacityUnit: z.string().default("tons"),
          description: z.string().optional(),
          imageUrl: z.string().optional(),
          location: z.string().optional(),
          minDuration: z.number().optional(),
          maxDuration: z.number().optional(),
          dailyRate: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await createCrane(input);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "crane_created",
          entityType: "crane",
          entityId: id,
          details: JSON.stringify({ name: input.name }),
        });
        return { id };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          type: z.enum(["tower", "mobile", "crawler", "overhead", "telescopic", "loader", "other"]).optional(),
          capacity: z.string().optional(),
          capacityUnit: z.string().optional(),
          description: z.string().optional(),
          imageUrl: z.string().optional(),
          location: z.string().optional(),
          isActive: z.boolean().optional(),
          minDuration: z.number().optional(),
          maxDuration: z.number().optional(),
          dailyRate: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await updateCrane(id, data);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "crane_updated",
          entityType: "crane",
          entityId: id,
          details: JSON.stringify(data),
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCrane(input.id);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "crane_deactivated",
          entityType: "crane",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // ─── Reservation Procedures ────────────────────────────────────────
  reservation: router({
    create: protectedProcedure
      .input(
        z.object({
          craneId: z.number(),
          startDate: z.date(),
          endDate: z.date(),
          projectLocation: z.string().optional(),
          projectDescription: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Validate dates
        if (input.startDate >= input.endDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date" });
        }
        if (input.startDate < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must be in the future" });
        }
        // Check crane exists
        const crane = await getCraneById(input.craneId);
        if (!crane || !crane.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Crane not found or inactive" });
        }
        // Check overlap
        const hasOverlap = await checkOverlap(input.craneId, input.startDate, input.endDate);
        if (hasOverlap) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This crane is already booked for the selected dates",
          });
        }
        const id = await createReservation({
          ...input,
          userId: ctx.user.id,
          status: "pending",
        });
        await createAuditEntry({
          userId: ctx.user.id,
          action: "reservation_created",
          entityType: "reservation",
          entityId: id,
          details: JSON.stringify({ craneId: input.craneId, startDate: input.startDate, endDate: input.endDate }),
        });
        // Notify admin
        await notifyOwner({
          title: "New Reservation Request",
          content: `User ${ctx.user.name || ctx.user.email || "Unknown"} requested crane "${crane.name}" from ${input.startDate.toLocaleDateString()} to ${input.endDate.toLocaleDateString()}. Project: ${input.projectLocation || "N/A"}`,
        });
        return { id };
      }),

    myReservations: protectedProcedure.query(async ({ ctx }) => {
      const items = await listReservationsByUser(ctx.user.id);
      // Enrich with crane info
      const enriched = await Promise.all(
        items.map(async (r) => {
          const crane = await getCraneById(r.craneId);
          return { ...r, crane: crane ? { id: crane.id, name: crane.name, type: crane.type } : null };
        })
      );
      return enriched;
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Reservation not found" });
        // Only allow owner or admin to view
        if (reservation.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const crane = await getCraneById(reservation.craneId);
        const user = await getUserById(reservation.userId);
        return {
          ...reservation,
          crane: crane ? { id: crane.id, name: crane.name, type: crane.type } : null,
          user: user ? { id: user.id, name: user.name, email: user.email, organization: user.organization } : null,
        };
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (reservation.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending reservations can be cancelled" });
        }
        await updateReservationStatus(input.id, "cancelled", ctx.user.id);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "reservation_cancelled",
          entityType: "reservation",
          entityId: input.id,
        });
        return { success: true };
      }),

    // ─── Admin Reservation Management ────────────────────────────────
    listAll: adminProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const items = await listAllReservations(input?.status);
        const enriched = await Promise.all(
          items.map(async (r) => {
            const crane = await getCraneById(r.craneId);
            const user = await getUserById(r.userId);
            return {
              ...r,
              crane: crane ? { id: crane.id, name: crane.name, type: crane.type } : null,
              user: user ? { id: user.id, name: user.name, email: user.email, organization: user.organization } : null,
            };
          })
        );
        return enriched;
      }),

    approve: adminProcedure
      .input(z.object({ id: z.number(), adminNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending reservations can be approved" });
        }
        // Re-check overlap before approving
        const hasOverlap = await checkOverlap(reservation.craneId, reservation.startDate, reservation.endDate, reservation.id);
        if (hasOverlap) {
          throw new TRPCError({ code: "CONFLICT", message: "Another reservation overlaps with this time period" });
        }
        await updateReservationStatus(input.id, "approved", ctx.user.id, input.adminNotes);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "reservation_approved",
          entityType: "reservation",
          entityId: input.id,
        });
        return { success: true };
      }),

    reject: adminProcedure
      .input(z.object({ id: z.number(), adminNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const reservation = await getReservationById(input.id);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        if (reservation.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending reservations can be rejected" });
        }
        await updateReservationStatus(input.id, "rejected", ctx.user.id, input.adminNotes);
        await createAuditEntry({
          userId: ctx.user.id,
          action: "reservation_rejected",
          entityType: "reservation",
          entityId: input.id,
        });
        return { success: true };
      }),
  }),

  // ─── Public Calendar ───────────────────────────────────────────────
  calendar: router({
    events: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          craneType: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const approved = await getApprovedReservationsForCalendar(input?.startDate, input?.endDate);
        // Enrich with crane info and filter by type if needed
        const enriched = await Promise.all(
          approved.map(async (r) => {
            const crane = await getCraneById(r.craneId);
            return {
              id: r.id,
              craneId: r.craneId,
              craneName: crane?.name ?? "Unknown",
              craneType: crane?.type ?? "other",
              startDate: r.startDate,
              endDate: r.endDate,
              projectLocation: r.projectLocation,
            };
          })
        );
        if (input?.craneType && input.craneType !== "all") {
          return enriched.filter((e) => e.craneType === input.craneType);
        }
        return enriched;
      }),
  }),

  // ─── Audit Log (Admin) ────────────────────────────────────────────
  audit: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(50) }).optional())
      .query(async ({ input }) => {
        return listAuditLog(input?.limit ?? 50);
      }),
  }),
});

export type AppRouter = typeof appRouter;
