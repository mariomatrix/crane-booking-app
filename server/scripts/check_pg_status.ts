import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { count, eq } from "drizzle-orm";
import { users, vessels, berths, berthAssignments, syncRuns, syncConflicts } from "../../drizzle/schema";

async function diag() {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const db = drizzle(client);

    const [userCnt] = await db.select({ c: count() }).from(users);
    const [vesselCnt] = await db.select({ c: count() }).from(vessels);
    const [berthCnt] = await db.select({ c: count() }).from(berths);
    const [assignCnt] = await db.select({ c: count() }).from(berthAssignments);
    const [conflictCnt] = await db.select({ c: count() }).from(syncConflicts);

    console.log("=== POSTGRES STATUS ===");
    console.log("Users:", userCnt.c);
    console.log("Vessels:", vesselCnt.c);
    console.log("Berths:", berthCnt.c);
    console.log("Berth Assignments:", assignCnt.c);
    console.log("Sync Conflicts:", conflictCnt.c);

    const sampleAssignments = await db
        .select({
            berthCode: berths.code,
            vesselName: vessels.name,
            vesselReg: vessels.registration,
            userName: users.name,
        })
        .from(berthAssignments)
        .innerJoin(berths, eq(berths.id, berthAssignments.berthId))
        .innerJoin(vessels, eq(vessels.id, berthAssignments.vesselId))
        .innerJoin(users, eq(users.id, berthAssignments.userId))
        .limit(10);

    console.log("\n=== SAMPLE BERTH ASSIGNMENTS IN POSTGRES ===");
    console.log(sampleAssignments);

    await client.end();
}
diag();
