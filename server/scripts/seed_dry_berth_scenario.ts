import "dotenv/config";
import { getDb, getUserByEmail, createLocalUser, updateUser, updateUserRole } from "../db";
import bcrypt from "bcryptjs";
import {
    users,
    vessels,
    cranes,
    operatorCranes,
    landZones,
    landOccupancies,
    landWaitingList,
    reservations,
    serviceTypes,
    workOrders
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";

async function seedScenario() {
    console.log("=== Setting up Dry Berth & Waiting List Scenario ===");
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const db = await getDb();
    if (!db) {
        console.error("DB connection error");
        process.exit(1);
    }

    const testPasswordHash = await bcrypt.hash("TestLozinka123!", 12);

    // 1. Ensure Operator exists
    let operator = await getUserByEmail("operater@test.local");
    if (!operator) {
        const opId = await createLocalUser({
            email: "operater@test.local",
            firstName: "Operater",
            lastName: "Dizalice",
            passwordHash: testPasswordHash,
        });
        await updateUserRole(opId, "operator");
        operator = await getUserByEmail("operater@test.local");
    }
    // Set PIN 1234 for operator
    await db.update(users).set({ pinCode: "1234", emailVerifiedAt: new Date() }).where(eq(users.id, operator!.id));

    // 2. Ensure User A (Ivan Horvat) exists
    let userA = await getUserByEmail("clan@test.local");
    if (!userA) {
        const uId = await createLocalUser({
            email: "clan@test.local",
            firstName: "Ivan",
            lastName: "Horvat",
            passwordHash: testPasswordHash,
        });
        await updateUserRole(uId, "user");
        userA = await getUserByEmail("clan@test.local");
    }

    // 3. Ensure User B (Marko Maric) exists
    let userB = await getUserByEmail("marko@test.local");
    if (!userB) {
        const uId = await createLocalUser({
            email: "marko@test.local",
            firstName: "Marko",
            lastName: "Maric",
            passwordHash: testPasswordHash,
        });
        await updateUserRole(uId, "user");
        userB = await getUserByEmail("marko@test.local");
    }
    await db.update(users).set({ phone: "+385911234567", emailVerifiedAt: new Date() }).where(eq(users.id, userB!.id));

    // 4. Ensure Crane exists and is assigned to Operator
    let [crane] = await db.select().from(cranes).limit(1);
    if (!crane) {
        const [newCrane] = await db.insert(cranes).values({
            name: "Gantry Dizalica 1 - Špinut",
            craneStatus: "active",
            type: "travelift",
            maxCapacityKN: 150,
            maxPoolWidth: "4.50",
            location: "Bazen A",
            description: "Glavna dizalica za izvlačenje i spuštanje brodova",
        }).returning();
        crane = newCrane;
    }

    // Assign crane to operator
    const existingOpCrane = await db.select().from(operatorCranes).where(
        and(eq(operatorCranes.userId, operator!.id), eq(operatorCranes.craneId, crane.id))
    );
    if (existingOpCrane.length === 0) {
        await db.insert(operatorCranes).values({
            userId: operator!.id,
            craneId: crane.id,
        });
    }

    // 5. Ensure Service Types exist
    let [lowerService] = await db.select().from(serviceTypes).where(eq(serviceTypes.operationCategory, "lower_to_sea")).limit(1);
    if (!lowerService) {
        const [newSt] = await db.insert(serviceTypes).values({
            name: "Spuštanje u more",
            description: "Spuštanje plovila sa suhog veza u more",
            defaultDurationMin: 60,
            operationCategory: "lower_to_sea",
            isActive: true,
            sortOrder: 1,
        }).returning();
        lowerService = newSt;
    }

    let [liftService] = await db.select().from(serviceTypes).where(eq(serviceTypes.operationCategory, "lift_from_sea")).limit(1);
    if (!liftService) {
        const [newSt] = await db.insert(serviceTypes).values({
            name: "Vađenje iz mora",
            description: "Vađenje plovila iz mora na suhi vez",
            defaultDurationMin: 60,
            operationCategory: "lift_from_sea",
            isActive: true,
            sortOrder: 2,
        }).returning();
        liftService = newSt;
    }

    // 6. Ensure Vessels exist
    // Vessel A: Morska Vila (User A)
    let [vesselA] = await db.select().from(vessels).where(eq(vessels.ownerId, userA!.id)).limit(1);
    if (!vesselA) {
        const [newV] = await db.insert(vessels).values({
            ownerId: userA!.id,
            name: "Morska Vila",
            registration: "ST-1234-MV",
            lengthM: "8.50",
            beamM: "2.80",
            draftM: "1.40",
            weightTons: "3.20",
            type: "jedrilica",
        }).returning();
        vesselA = newV;
    }

    // Vessel B: Nautilus (User B)
    let [vesselB] = await db.select().from(vessels).where(eq(vessels.ownerId, userB!.id)).limit(1);
    if (!vesselB) {
        const [newV] = await db.insert(vessels).values({
            ownerId: userB!.id,
            name: "Nautilus",
            registration: "ST-5678-NT",
            lengthM: "9.20",
            beamM: "3.10",
            draftM: "1.60",
            weightTons: "4.50",
            type: "motorni",
        }).returning();
        vesselB = newV;
    }

    // Vessel X: Adria 1
    let [vesselX] = await db.select().from(vessels).where(eq(vessels.registration, "ST-9999-AD")).limit(1);
    if (!vesselX) {
        const [newV] = await db.insert(vessels).values({
            ownerId: userB!.id,
            name: "Adria 1",
            registration: "ST-9999-AD",
            lengthM: "7.00",
            beamM: "2.50",
            draftM: "1.10",
            weightTons: "2.40",
            type: "motorni",
        }).returning();
        vesselX = newV;
    }

    // 7. Ensure Land Zone "Arla 1" has totalSpots = 2
    let [zone] = await db.select().from(landZones).where(eq(landZones.code, "A1")).limit(1);
    if (!zone) {
        const [newZ] = await db.insert(landZones).values({
            name: "Arla 1",
            code: "A1",
            totalSpots: 2,
            manualOccupiedSpots: 0,
            description: "Testna zona Arla 1 - kapacitet 2 mjesta",
            isActive: true,
            sortOrder: 1,
        }).returning();
        zone = newZ;
    } else {
        await db.update(landZones).set({ totalSpots: 2, manualOccupiedSpots: 0 }).where(eq(landZones.id, zone.id));
    }

    // 8. Reset occupancies for Arla 1 and create 2 active occupancies (Spot 1 and Spot 2)
    await db.delete(landOccupancies).where(eq(landOccupancies.zoneId, zone.id));

    // Occupancy 1: Vessel X on Spot 1
    await db.insert(landOccupancies).values({
        vesselId: vesselX.id,
        userId: userB!.id,
        zoneId: zone.id,
        spotNumber: 1,
        liftedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000), // 10 days ago
        note: "Redovni zimski vez - Adria 1",
        createdBy: operator!.id,
    });

    // Occupancy 2: Vessel B (Nautilus) on Spot 2 (This is the one that will be lowered to free spot 2!)
    const [occ2] = await db.insert(landOccupancies).values({
        vesselId: vesselB.id,
        userId: userB!.id,
        zoneId: zone.id,
        spotNumber: 2,
        liftedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), // 5 days ago
        note: "Smješteno na mjesto 2 - čeka spuštanje",
        createdBy: operator!.id,
    }).returning();

    // 9. Create Scheduled Lower Reservation for Vessel B (Nautilus)
    const today = new Date();
    const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0);
    const endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0);
    const dateStr = today.toISOString().split("T")[0];

    // Delete old test reservations and work orders for Nautilus
    await db.delete(workOrders).where(eq(workOrders.vesselId, vesselB.id));
    await db.delete(reservations).where(eq(reservations.vesselId, vesselB.id));

    const [resB] = await db.insert(reservations).values({
        reservationNumber: `RES-${Date.now().toString().slice(-6)}`,
        userId: userB!.id,
        vesselId: vesselB.id,
        craneId: crane.id,
        serviceTypeId: lowerService.id,
        landZoneId: zone.id,
        requestedDate: dateStr,
        requestedTimeSlot: "09:00",
        scheduledStart: startTime,
        scheduledEnd: endTime,
        durationMin: 60,
        status: "approved",
        vesselName: vesselB.name,
        vesselType: vesselB.type,
        vesselLengthM: vesselB.lengthM,
        vesselBeamM: vesselB.beamM,
        vesselWeightTons: vesselB.weightTons,
        vesselRegistration: vesselB.registration,
        userNote: "Dogovoreno spuštanje u more i oslobađanje mjesta br. 2",
    }).returning();

    // Create active Work Order for Res B
    await db.delete(workOrders).where(eq(workOrders.reservationId, resB.id));
    await db.insert(workOrders).values({
        orderNumber: `RN-${Date.now().toString().slice(-6)}`,
        reservationId: resB.id,
        userId: userB!.id,
        vesselId: vesselB.id,
        craneId: crane.id,
        operatorId: operator!.id,
        status: "in_progress",
        clientType: "member",
        isStatutoryCovered: true,
        quotaOperationType: "lower",
        vesselLengthM: vesselB.lengthM,
        startedAt: startTime,
    });

    // 10. Place User A (Ivan Horvat / Morska Vila) on land_waiting_list
    await db.delete(landWaitingList).where(eq(landWaitingList.userId, userA!.id));
    await db.insert(landWaitingList).values({
        userId: userA!.id,
        vesselId: vesselA.id,
        preferredZoneId: zone.id,
        position: 1,
        status: "waiting",
        note: "Želi vađenje na suhi vez u Arla 1. Zona je popunjena (2/2) - upisan na listu čekanja.",
    });

    console.log("=== SCENARIO SEED COMPLETED SUCCESSFULLY ===");
    console.log(`- Land Zone 'Arla 1' capacity: 2/2 occupied (100% full)`);
    console.log(`- Spot 1: Occupied by Adria 1`);
    console.log(`- Spot 2: Occupied by Nautilus (Marko Maric)`);
    console.log(`- Scheduled Task for Operator: Spuštanje u more for Nautilus (RN in progress)`);
    console.log(`- Waiting list #1: Ivan Horvat (Morska Vila) waiting for Arla 1 spot`);

    await client.end();
    process.exit(0);
}

seedScenario().catch(err => {
    console.error("Seed error:", err);
    process.exit(1);
});
