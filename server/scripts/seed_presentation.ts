import "dotenv/config";
import { getDb } from "../db";
import { 
    users, cranes, vessels, landZones, reservations, workOrders, 
    operatorCranes, serviceTypes, piers, berths 
} from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import * as bcrypt from "bcryptjs";

async function seedPresentation() {
    const db = await getDb();
    if (!db) {
        console.error("No DB connection.");
        return;
    }

    console.log("Seeding presentation data...");

    // 1. Create a dummy operator and some dummy users
    const passwordHash = await bcrypt.hash("lozinka123", 10);
    
    console.log("Creating users...");
    const [operator] = await db.insert(users).values({
        email: "operator@spinut.hr",
        firstName: "Ivan",
        lastName: "Operater",
        role: "operator",
        passwordHash,
        phone: "0912345678",
        mustChangePassword: false,
    }).onConflictDoUpdate({
        target: users.email,
        set: { firstName: "Ivan" }
    }).returning();

    const [member1] = await db.insert(users).values({
        email: "pero.peric@example.com",
        firstName: "Pero",
        lastName: "Perić",
        role: "user",
        passwordHash,
        phone: "0987654321",
        oib: "12345678901",
        mustChangePassword: false,
    }).onConflictDoUpdate({
        target: users.email,
        set: { firstName: "Pero" }
    }).returning();

    const [member2] = await db.insert(users).values({
        email: "ana.anic@example.com",
        firstName: "Ana",
        lastName: "Anić",
        role: "user",
        passwordHash,
        phone: "0991234567",
        oib: "98765432109",
        mustChangePassword: false,
    }).onConflictDoUpdate({
        target: users.email,
        set: { firstName: "Ana" }
    }).returning();

    // 2. Create Cranes
    console.log("Creating cranes...");
    const [crane1] = await db.insert(cranes).values({
        name: "Travelift 50T",
        type: "travelift",
        maxCapacityKN: 500,
        maxPoolWidth: "6.50",
        craneStatus: "active",
    }).returning();

    const [crane2] = await db.insert(cranes).values({
        name: "Stacionarna dizalica 5T",
        type: "portalna",
        maxCapacityKN: 50,
        craneStatus: "active",
    }).returning();

    // Assign operator to cranes
    await db.insert(operatorCranes).values([
        { userId: operator.id, craneId: crane1.id },
        { userId: operator.id, craneId: crane2.id }
    ]).onConflictDoNothing();

    // 3. Create Land Zones
    console.log("Creating land zones...");
    const [zoneA] = await db.insert(landZones).values({
        name: "Zona A - Radni plato",
        code: "ZON-A",
        totalSpots: 20,
    }).onConflictDoUpdate({
        target: landZones.code,
        set: { name: "Zona A - Radni plato" }
    }).returning();

    // 4. Create Vessels
    console.log("Creating vessels...");
    const [vessel1] = await db.insert(vessels).values({
        ownerId: member1.id,
        name: "Bura",
        type: "jedrilica",
        lengthM: "12.5",
        beamM: "4.2",
        draftM: "2.1",
        weightTons: "8.5",
        registration: "ST-1234",
    }).onConflictDoUpdate({
        target: vessels.registration,
        set: { name: "Bura" }
    }).returning();

    const [vessel2] = await db.insert(vessels).values({
        ownerId: member2.id,
        name: "Maestral",
        type: "motorni",
        lengthM: "8.5",
        beamM: "2.8",
        draftM: "0.9",
        weightTons: "3.2",
        registration: "ST-9876",
    }).onConflictDoUpdate({
        target: vessels.registration,
        set: { name: "Maestral" }
    }).returning();

    // 5. Get Service Types
    const services = await db.select().from(serviceTypes);
    const liftService = services.find(s => s.operationCategory === "lift_from_sea") || services[0];
    const lowerService = services.find(s => s.operationCategory === "lower_to_sea") || services[0];
    const washService = services.find(s => s.name.toLowerCase().includes("pranje")) || services[0];

    // 6. Create Reservations
    console.log("Creating reservations...");
    
    // Future approved reservation (tomorrow morning)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    const endTomorrow = new Date(tomorrow);
    endTomorrow.setHours(10, 0, 0, 0);

    await db.insert(reservations).values({
        reservationNumber: "RES-2026-001",
        userId: member1.id,
        vesselId: vessel1.id,
        serviceTypeId: liftService.id,
        craneId: crane1.id,
        status: "approved",
        scheduledStart: tomorrow,
        scheduledEnd: endTomorrow,
        durationMin: 60,
        vesselName: vessel1.name,
        vesselType: vessel1.type,
        vesselLengthM: vessel1.lengthM,
        landZoneId: zoneA.id,
        userNote: "Godišnji servis",
    }).onConflictDoNothing();

    // Future pending reservation
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(11, 0, 0, 0);

    await db.insert(reservations).values({
        reservationNumber: "RES-2026-002",
        userId: member2.id,
        vesselId: vessel2.id,
        serviceTypeId: lowerService.id,
        status: "pending",
        requestedDate: dayAfter.toISOString().split("T")[0],
        requestedTimeSlot: "jutro",
        durationMin: 45,
        vesselName: vessel2.name,
        vesselType: vessel2.type,
        vesselLengthM: vessel2.lengthM,
        userNote: "Spuštanje nakon popravka",
    }).onConflictDoNothing();

    // Past completed reservation with a work order
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(14, 0, 0, 0);
    
    const endYesterday = new Date(yesterday);
    endYesterday.setHours(15, 0, 0, 0);

    const [completedRes] = await db.insert(reservations).values({
        reservationNumber: "RES-2026-003",
        userId: member2.id,
        vesselId: vessel2.id,
        serviceTypeId: washService.id,
        craneId: crane2.id,
        status: "completed",
        scheduledStart: yesterday,
        scheduledEnd: endYesterday,
        durationMin: 60,
        vesselName: vessel2.name,
        vesselLengthM: vessel2.lengthM,
        completedAt: endYesterday,
    }).onConflictDoNothing().returning();

    if (completedRes) {
        console.log("Creating work orders...");
        await db.insert(workOrders).values({
            orderNumber: "RN-2026-001",
            reservationId: completedRes.id,
            userId: member2.id,
            vesselId: vessel2.id,
            craneId: crane2.id,
            operatorId: operator.id,
            status: "completed",
            startedAt: yesterday,
            completedAt: endYesterday,
            clientType: "member",
            operatorNotes: "Oprano sve po dogovoru.",
        }).onConflictDoNothing();
    }

    console.log("Presentation data seeded successfully!");
}

seedPresentation().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("Error seeding data:", err);
    process.exit(1);
});
