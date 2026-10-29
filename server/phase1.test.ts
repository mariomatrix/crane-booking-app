import "dotenv/config";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { QUEUES, startQueueService, stopQueueService, enqueueEmail, enqueueSms, scheduleOfferExpiration, isQueueRunning } from "./jobs/queue";
import postgres from "postgres";

describe("Phase 1: pg-boss & btree_gist Exclusion Constraint", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await stopQueueService();
    if (sql) {
      await sql.end();
    }
  });

  describe("btree_gist PostgreSQL Exclusion Constraint", () => {
    it("has no_crane_double_booking constraint present in postgres metadata", async () => {
      const constraints = await sql`
        SELECT conname, contype 
        FROM pg_constraint 
        WHERE conname = 'no_crane_double_booking'
      `;
      expect(constraints.length).toBe(1);
      expect(constraints[0].contype).toBe("x"); // 'x' = exclusion constraint
    });

    it("allows contiguous adjacent reservations with touching bounds [11:00, 12:00) and [12:00, 13:00)", async () => {
      const [crane] = await sql`SELECT id FROM cranes LIMIT 1`;
      const [user] = await sql`SELECT id FROM users LIMIT 1`;
      const [vessel] = await sql`SELECT id FROM vessels LIMIT 1`;

      if (!crane || !user || !vessel) {
        console.warn("Skipping boundary test: crane/user/vessel table empty.");
        return;
      }

      const resNumber1 = `ADJ${Date.now().toString().slice(-8)}1`;
      const resNumber2 = `ADJ${Date.now().toString().slice(-8)}2`;

      const t1 = "2029-01-10T11:00:00.000Z";
      const t2 = "2029-01-10T12:00:00.000Z";
      const t3 = "2029-01-10T13:00:00.000Z";

      try {
        // Insert first slot: 11:00 - 12:00
        const [r1] = await sql`
          INSERT INTO reservations (
            reservation_number, user_id, crane_id, vessel_id, status, scheduled_start, scheduled_end
          ) VALUES (
            ${resNumber1}, ${user.id}, ${crane.id}, ${vessel.id}, 'approved', ${t1}, ${t2}
          ) RETURNING id
        `;

        // Insert adjacent slot: 12:00 - 13:00 (must NOT conflict with 11:00 - 12:00)
        const [r2] = await sql`
          INSERT INTO reservations (
            reservation_number, user_id, crane_id, vessel_id, status, scheduled_start, scheduled_end
          ) VALUES (
            ${resNumber2}, ${user.id}, ${crane.id}, ${vessel.id}, 'approved', ${t2}, ${t3}
          ) RETURNING id
        `;

        expect(r1?.id).toBeDefined();
        expect(r2?.id).toBeDefined();

        // Clean up test rows
        await sql`DELETE FROM reservations WHERE id IN (${r1.id}, ${r2.id})`;
      } catch (err) {
        await sql`DELETE FROM reservations WHERE reservation_number IN (${resNumber1}, ${resNumber2})`;
        throw err;
      }
    });

    it("strictly blocks overlapping reservations on the same crane at database engine level", async () => {
      const [crane] = await sql`SELECT id FROM cranes LIMIT 1`;
      const [user] = await sql`SELECT id FROM users LIMIT 1`;
      const [vessel] = await sql`SELECT id FROM vessels LIMIT 1`;

      if (!crane || !user || !vessel) return;

      const resNumber1 = `OVL${Date.now().toString().slice(-8)}1`;
      const resNumber2 = `OVL${Date.now().toString().slice(-8)}2`;

      const t1 = "2029-02-15T10:00:00.000Z";
      const t2 = "2029-02-15T11:00:00.000Z";
      const tOverlap = "2029-02-15T10:30:00.000Z";
      const tEnd = "2029-02-15T11:30:00.000Z";

      let r1Id: string | null = null;
      try {
        const [r1] = await sql`
          INSERT INTO reservations (
            reservation_number, user_id, crane_id, vessel_id, status, scheduled_start, scheduled_end
          ) VALUES (
            ${resNumber1}, ${user.id}, ${crane.id}, ${vessel.id}, 'approved', ${t1}, ${t2}
          ) RETURNING id
        `;
        r1Id = r1.id;

        // Try inserting overlapping slot: 10:30 - 11:30 on same crane
        let errorCaught: any = null;
        try {
          await sql`
            INSERT INTO reservations (
              reservation_number, user_id, crane_id, vessel_id, status, scheduled_start, scheduled_end
            ) VALUES (
              ${resNumber2}, ${user.id}, ${crane.id}, ${vessel.id}, 'approved', ${tOverlap}, ${tEnd}
            )
          `;
        } catch (e: any) {
          errorCaught = e;
        }

        expect(errorCaught).toBeDefined();
        // Postgres error code 23P01 = exclusion_violation
        expect(errorCaught.code).toBe("23P01");
      } finally {
        if (r1Id) {
          await sql`DELETE FROM reservations WHERE id = ${r1Id}`;
        }
        await sql`DELETE FROM reservations WHERE reservation_number IN (${resNumber1}, ${resNumber2})`;
      }
    });
  });

  describe("pg-boss Queue Manager", () => {
    it("defines standard queue names", () => {
      expect(QUEUES.SEND_EMAIL).toBe("send-email");
      expect(QUEUES.SEND_SMS).toBe("send-sms");
      expect(QUEUES.WAITING_OFFER_EXPIRE).toBe("waiting-offer-expire");
      expect(QUEUES.RESERVATION_REMINDERS).toBe("reservation-reminders");
      expect(QUEUES.MSSQL_MEMBER_SYNC).toBe("mssql-member-sync");
    });

    it("starts queue service and registers schema & schedules", async () => {
      const boss = await startQueueService();
      expect(boss).not.toBeNull();
      expect(isQueueRunning()).toBe(true);
    }, 20000);

    it("enqueues an email job into pg-boss", async () => {
      const jobId = await enqueueEmail({
        to: "test-queue@spinut.hr",
        subject: "Test Red Poruka",
        html: "<p>Testiranje pg-boss reda poslova</p>",
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });

    it("enqueues an SMS job into pg-boss", async () => {
      const jobId = await enqueueSms({
        phone: "+385915055986",
        message: "Test pg-boss SMS poruka",
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });

    it("schedules offer expiration in the future", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const testOfferId = "00000000-0000-0000-0000-000000000099";

      const jobId = await scheduleOfferExpiration(testOfferId, futureDate);
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe("string");
    });
  });
});
