import { router, protectedProcedure, operatorProcedure } from "./_core/trpc";
import { z } from "zod";
import { landFlowService } from "./services/landFlow.service";

export const landFlowRouter = router({
    getDailyBalance: protectedProcedure
        .input(
            z.object({
                dateStr: z.string(),
                craneId: z.string().uuid().optional(),
            })
        )
        .query(async ({ input }) => {
            return await landFlowService.getDailyBalance(input.dateStr, input.craneId);
        }),

    getFlowMatrix: protectedProcedure
        .input(
            z.object({
                dateStr: z.string(),
                craneId: z.string().uuid().optional(),
                zoneId: z.string().uuid().optional(),
            })
        )
        .query(async ({ input }) => {
            return await landFlowService.getFlowMatrix(input.dateStr, input.craneId, input.zoneId);
        }),

    getSpotsByZone: protectedProcedure
        .input(
            z.object({
                zoneId: z.string().uuid(),
            })
        )
        .query(async ({ input }) => {
            return await landFlowService.getSpotsByZone(input.zoneId);
        }),

    getAffinities: protectedProcedure
        .query(async () => {
            return await landFlowService.getAllAffinities();
        }),

    recommendSpots: protectedProcedure
        .input(
            z.object({
                reservationId: z.string().uuid(),
                dateStr: z.string(),
            })
        )
        .query(async ({ input }) => {
            return await landFlowService.recommendSpots(input.reservationId, input.dateStr);
        }),

    upsertAffinity: operatorProcedure
        .input(
            z.object({
                craneId: z.string().uuid(),
                zoneId: z.string().uuid(),
                affinityScore: z.number().int().min(0).max(100),
                extraTransportMinutes: z.number().int().min(0),
                isPrimary: z.boolean(),
                isBlocked: z.boolean(),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            return await landFlowService.upsertAffinity(input);
        }),

    allocateSpot: operatorProcedure
        .input(
            z.object({
                spotId: z.string().uuid(),
                reservationId: z.string().uuid(),
                overrideReason: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return await landFlowService.allocateSpot({
                ...input,
                userId: ctx.user.id,
            });
        }),

    linkTurnaround: operatorProcedure
        .input(
            z.object({
                spotId: z.string().uuid(),
                releaseReservationId: z.string().uuid(),
                arrivalReservationId: z.string().uuid(),
                bufferMinutes: z.number().int().min(0).default(15),
                confirmImmediately: z.boolean().default(false),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return await landFlowService.linkTurnaround({
                ...input,
                userId: ctx.user.id,
            });
        }),

    confirmTurnaround: operatorProcedure
        .input(
            z.object({
                turnaroundLinkId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return await landFlowService.confirmTurnaround(input.turnaroundLinkId, ctx.user.id);
        }),

    cancelTurnaround: operatorProcedure
        .input(
            z.object({
                turnaroundLinkId: z.string().uuid(),
                reason: z.string().min(3),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return await landFlowService.cancelTurnaround(input.turnaroundLinkId, input.reason, ctx.user.id);
        }),
});
