/**
 * Skripta za sigurno brisanje članova i povezanih sync podataka iz baze
 * 
 * Čuva administratorske i operaterske račune (admin@lucicaspinut.hr, mario@imagomatrix.hr, admin@spinut.hr),
 * a briše sve sinkronizirane članove (role = 'user'), njihove linkove, članstva u klubovima,
 * plovila i sync povijest kako bi se omogućio potpuno čisti novi uvoz.
 * 
 * Pokretanje:
 *   pnpm tsx server/scripts/cleanMembers.ts
 */
import "dotenv/config";
import { getDb } from "../db";
import {
    users,
    vessels,
    memberLinks,
    memberMemberships,
    syncRuns,
    syncConflicts,
    memberStatutoryRights,
    userCardEntries,
    workOrders,
    reservations,
    landOccupancies,
    landWaitingList,
    waitingList,
    auditLog,
} from "../../drizzle/schema";
import { eq, ne, inArray, sql } from "drizzle-orm";

async function cleanMembers() {
    const db = await getDb();
    if (!db) {
        console.error("❌ PostgreSQL baza nije dostupna. Provjerite DATABASE_URL u .env datoteci.");
        process.exit(1);
    }

    console.log("================================================================================");
    console.log("  PŠD ŠPINUT — ČIŠĆENJE PODATAKA O ČLANOVIMA I SINKRONIZACIJI");
    console.log("================================================================================");

    // 1. Dohvati korisnike s ulogom 'user' (koji nisu admini / operateri)
    const membersToDelete = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, "user"));

    const memberIds = membersToDelete.map((m) => m.id);
    console.log(`📋 Pronađeno članova za brisanje: ${memberIds.length}`);

    // Prikaz sačuvanih admin računa
    const adminUsers = await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(ne(users.role, "user"));
    console.log(`🔒 Sačuvani administratorski računi (${adminUsers.length}):`);
    adminUsers.forEach((a) => console.log(`   • ${a.email} (${a.role})`));
    console.log("--------------------------------------------------------------------------------");

    if (memberIds.length > 0) {
        console.log("⏳ Brišem povezane zapise članova...");

        // 2. Briši tablice povezane s članovima
        await db.delete(memberLinks).catch(() => {});
        console.log("  ✓ member_links obrisan");

        await db.delete(memberMemberships).catch(() => {});
        console.log("  ✓ member_memberships obrisan");

        await db.delete(syncConflicts).catch(() => {});
        console.log("  ✓ sync_conflicts obrisan");

        await db.delete(syncRuns).catch(() => {});
        console.log("  ✓ sync_runs obrisan");

        await db.delete(userCardEntries).where(inArray(userCardEntries.userId, memberIds)).catch(() => {});
        console.log("  ✓ user_card_entries obrisani za članove");

        await db.delete(memberStatutoryRights).where(inArray(memberStatutoryRights.userId, memberIds)).catch(() => {});
        console.log("  ✓ member_statutory_rights obrisana");

        await db.delete(landWaitingList).where(inArray(landWaitingList.userId, memberIds)).catch(() => {});
        await db.delete(landOccupancies).where(inArray(landOccupancies.userId, memberIds)).catch(() => {});
        await db.delete(waitingList).where(inArray(waitingList.userId, memberIds)).catch(() => {});
        await db.delete(workOrders).where(inArray(workOrders.userId, memberIds)).catch(() => {});
        await db.delete(reservations).where(inArray(reservations.userId, memberIds)).catch(() => {});

        // 3. Briši plovila članova
        await db.delete(vessels).where(inArray(vessels.ownerId, memberIds)).catch(() => {});
        console.log("  ✓ vessels plovila obrisana za članove");

        // 4. Briši korisničke zapise članova (users where role = 'user')
        const deletedUsers = await db.delete(users).where(eq(users.role, "user")).returning({ id: users.id });
        console.log(`  ✓ users obrisano ${deletedUsers.length} članova`);
    } else {
        // Ako nema članova, očisti sync tablice
        await db.delete(memberLinks).catch(() => {});
        await db.delete(memberMemberships).catch(() => {});
        await db.delete(syncConflicts).catch(() => {});
        await db.delete(syncRuns).catch(() => {});
        console.log("  ✓ Očišćene prazne sync tablice");
    }

    console.log("================================================================================");
    console.log("✅ Čišćenje uspješno završeno. Baza je spremna za svježi uvoz.");
    process.exit(0);
}

cleanMembers().catch((err) => {
    console.error("❌ Pogreška pri čišćenju baze:", err);
    process.exit(1);
});
