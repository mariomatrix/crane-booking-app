import { router, protectedProcedure, operatorProcedure } from "../_core/trpc";
import { z } from "zod";
import { SchedulerOptimizationService } from "./schedulerService";

const schedulerService = new SchedulerOptimizationService();

export const optimizationRouter = router({
  /**
   * Izračunava matematički optimalan dnevni raspored pomoću HiGHS solvera
   */
  optimizeDailySchedule: protectedProcedure
    .input(
      z.object({
        dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format datuma mora biti YYYY-MM-DD"),
        requestIds: z.array(z.string().uuid()).optional(),
        maxConcurrentTeams: z.number().int().min(1).max(5).default(2),
      })
    )
    .query(async ({ input }) => {
      return await schedulerService.optimizeDailySchedule(input);
    }),

  /**
   * Primjenjuje odabrani optimalni raspored na stvarne rezervacije u bazi
   */
  applyOptimizedSchedule: operatorProcedure
    .input(
      z.object({
        dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        assignments: z.array(
          z.object({
            requestId: z.string().uuid(),
            reservationNumber: z.string().optional(),
            vesselName: z.string(),
            craneId: z.string().uuid(),
            craneName: z.string(),
            zoneId: z.string().uuid().optional(),
            zoneCode: z.string().optional(),
            zoneName: z.string().optional(),
            slotIndex: z.number().int(),
            startTime: z.string(),
            endTime: z.string(),
            durationMin: z.number().int(),
            affinityScore: z.number(),
            extraTransportMinutes: z.number(),
            matchQuality: z.enum(["optimal", "acceptable", "suboptimal"]),
            explanation: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await schedulerService.applyOptimizedSchedule({
        ...input,
        adminUserId: ctx.user?.id,
      });
    }),

  /**
   * Pojedinačna preporuka idealnog slota za određeni zahtjev
   */
  recommendBestSlot: protectedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        targetDateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      return await schedulerService.recommendBestSlotForRequest(input);
    }),
});
