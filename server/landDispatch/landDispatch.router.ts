import { router, protectedProcedure, operatorProcedure } from "../_core/trpc";
import { z } from "zod";
import { landDispatchService } from "./landDispatch.service";
import { getDb } from "../db";
import { craneZoneAffinities, cranes, landZones } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const landDispatchRouter = router({
  getDailyOverview: protectedProcedure
    .input(z.object({ dateStr: z.string() }))
    .query(async ({ input }) => {
      return await landDispatchService.getDailyDispatchOverview(input.dateStr);
    }),

  getSlotRecommendations: protectedProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        dateStr: z.string(),
        preferredZoneId: z.string().uuid().optional().nullable(),
      })
    )
    .query(async ({ input }) => {
      return await landDispatchService.getSlotRecommendations({
        reservationId: input.reservationId,
        dateStr: input.dateStr,
        preferredZoneId: input.preferredZoneId,
      });
    }),

  assignReservation: operatorProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        craneId: z.string().uuid(),
        landZoneId: z.string().uuid(),
        scheduledStartIso: z.string(),
        scheduledEndIso: z.string(),
        teamOverride: z.boolean().optional(),
        teamOverrideReason: z.string().optional(),
        rotationalPredecessorId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await landDispatchService.assignReservation({
        ...input,
        adminUserId: ctx.user?.id,
      });
    }),

  concludeOperation: operatorProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        status: z.enum(["completed", "not_performed"]),
        actualZoneId: z.string().uuid().optional(),
        notPerformedReason: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await landDispatchService.concludeOperation({
        ...input,
        operatorUserId: ctx.user?.id,
      });
    }),

  batchConcludeDay: operatorProcedure
    .input(z.object({ dateStr: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return await landDispatchService.batchConcludeDay(input.dateStr, ctx.user?.id);
    }),

  changeLandZone: operatorProcedure
    .input(
      z.object({
        vesselId: z.string().uuid(),
        newZoneId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await landDispatchService.changeLandZone(input);
    }),

  createWorkStoppage: operatorProcedure
    .input(
      z.object({
        scope: z.enum(["all_cranes", "single_crane", "single_zone"]),
        craneId: z.string().uuid().optional().nullable(),
        zoneId: z.string().uuid().optional().nullable(),
        startsAtIso: z.string(),
        endsAtIso: z.string().optional().nullable(),
        reason: z.string(),
        note: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await landDispatchService.createWorkStoppage({
        ...input,
        createdBy: ctx.user?.id,
      });
    }),

  cancelWorkStoppage: operatorProcedure
    .input(z.object({ stoppageId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return await landDispatchService.cancelWorkStoppage(input.stoppageId);
    }),

  createWaitingOffer: operatorProcedure
    .input(
      z.object({
        waitingListId: z.string().uuid(),
        zoneId: z.string().uuid(),
        craneId: z.string().uuid(),
        offeredStartIso: z.string(),
        offeredEndIso: z.string(),
        expiresInHours: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await landDispatchService.createWaitingOffer({
        ...input,
        createdBy: ctx.user?.id,
      });
    }),

  respondToWaitingOffer: operatorProcedure
    .input(
      z.object({
        offerId: z.string().uuid(),
        accept: z.boolean(),
        declineReason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await landDispatchService.respondToWaitingOffer(input);
    }),

  getAffinitiesMatrix: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const rows = await db
      .select({
        id: craneZoneAffinities.id,
        craneId: craneZoneAffinities.craneId,
        craneName: cranes.name,
        zoneId: craneZoneAffinities.zoneId,
        zoneCode: landZones.code,
        zoneName: landZones.name,
        affinityScore: craneZoneAffinities.affinityScore,
        penaltySlots: craneZoneAffinities.penaltySlots,
        priority: craneZoneAffinities.priority,
        isPrimary: craneZoneAffinities.isPrimary,
        isAllowed: craneZoneAffinities.isAllowed,
        isBlocked: craneZoneAffinities.isBlocked,
        isActive: craneZoneAffinities.isActive,
        notes: craneZoneAffinities.notes,
      })
      .from(craneZoneAffinities)
      .leftJoin(cranes, eq(craneZoneAffinities.craneId, cranes.id))
      .leftJoin(landZones, eq(craneZoneAffinities.zoneId, landZones.id));

    return rows;
  }),

  updateAffinity: operatorProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        craneId: z.string().uuid(),
        zoneId: z.string().uuid(),
        affinityScore: z.number().int().min(0).max(100),
        penaltySlots: z.number().int().min(0).default(0),
        priority: z.number().int().default(1),
        isPrimary: z.boolean().default(false),
        isAllowed: z.boolean().default(true),
        isBlocked: z.boolean().default(false),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      if (input.isPrimary) {
        // If primary, ensure other cranes for this zone are not primary
        await db
          .update(craneZoneAffinities)
          .set({ isPrimary: false })
          .where(eq(craneZoneAffinities.zoneId, input.zoneId));
      }

      const [existing] = await db
        .select()
        .from(craneZoneAffinities)
        .where(
          and(
            eq(craneZoneAffinities.craneId, input.craneId),
            eq(craneZoneAffinities.zoneId, input.zoneId)
          )
        );

      if (existing) {
        const [updated] = await db
          .update(craneZoneAffinities)
          .set({
            affinityScore: input.affinityScore,
            penaltySlots: input.penaltySlots,
            priority: input.priority,
            isPrimary: input.isPrimary,
            isAllowed: input.isAllowed,
            isBlocked: input.isBlocked,
            notes: input.notes,
            updatedAt: new Date(),
          })
          .where(eq(craneZoneAffinities.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(craneZoneAffinities)
          .values({
            craneId: input.craneId,
            zoneId: input.zoneId,
            affinityScore: input.affinityScore,
            penaltySlots: input.penaltySlots,
            priority: input.priority,
            isPrimary: input.isPrimary,
            isAllowed: input.isAllowed,
            isBlocked: input.isBlocked,
            notes: input.notes,
          })
          .returning();
        return created;
      }
    }),
});
