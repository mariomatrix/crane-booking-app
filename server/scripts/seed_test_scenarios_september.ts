import "dotenv/config";
import { getDb } from "../db";
import {
    users,
    cranes,
    vessels,
    landZones,
    reservations,
    workOrders,
    serviceTypes,
    resources,
    workOrderResources,
    craneOperationLog,
    landOccupancies,
    auditLog,
} from "../../drizzle/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import * as bcrypt from "bcryptjs";

async function seedSeptemberScenarios() {
    const db = await getDb();
    if (!db) {
        console.error("Greška: Baza podataka nije dostupna.");
        process.exit(1);
    }

    console.log("🚀 Pokrećem unos testnih operacija za 17. - 21.09.2026...");

    // 1. Dohvat ili kreiranje dizalica
    let dbCranes = await db.select().from(cranes).where(eq(cranes.craneStatus, "active"));
    if (dbCranes.length === 0) {
        console.log("Kreiram početne dizalice...");
        const [c1] = await db.insert(cranes).values({
            name: "TRAVEL LIFT 40 T",
            type: "travelift",
            maxCapacityKN: 400,
            maxPoolWidth: "6.50",
            craneStatus: "active",
        }).returning();
        const [c2] = await db.insert(cranes).values({
            name: "STACIONARNA DIZALICA 9 T",
            type: "portalna",
            maxCapacityKN: 90,
            craneStatus: "active",
        }).returning();
        dbCranes = [c1, c2];
    }

    const travelLift = dbCranes.find(c => c.type === "travelift" || c.name.toLowerCase().includes("travel")) || dbCranes[0];
    const smallCrane = dbCranes.find(c => c.id !== travelLift.id) || dbCranes[0];

    console.log(`Dizalice: [${travelLift.name}] i [${smallCrane.name}]`);

    // 2. Dohvat ili kreiranje tipova usluga
    let dbServiceTypes = await db.select().from(serviceTypes);
    let liftService = dbServiceTypes.find(st => st.operationCategory === "lift_from_sea");
    let lowerService = dbServiceTypes.find(st => st.operationCategory === "lower_to_sea");

    if (!liftService) {
        const [st1] = await db.insert(serviceTypes).values({
            name: "Vađenje iz mora",
            operationCategory: "lift_from_sea",
            defaultDurationMin: 60,
            isActive: true,
        }).returning();
        liftService = st1;
    }
    if (!lowerService) {
        const [st2] = await db.insert(serviceTypes).values({
            name: "Spuštanje u more",
            operationCategory: "lower_to_sea",
            defaultDurationMin: 30,
            isActive: true,
        }).returning();
        lowerService = st2;
    }

    // 3. Dohvat ili kreiranje zona kopna
    let dbZones = await db.select().from(landZones);
    let zoneA = dbZones.find(z => z.code === "ZON-A" || z.code === "A");
    let zoneB = dbZones.find(z => z.code === "ZON-B" || z.code === "B");

    if (!zoneA) {
        const [za] = await db.insert(landZones).values({
            name: "Zona A - Radni plato",
            code: "ZON-A",
            totalSpots: 30,
        }).returning();
        zoneA = za;
    }
    if (!zoneB) {
        const [zb] = await db.insert(landZones).values({
            name: "Zona B - Zapadni plato",
            code: "ZON-B",
            totalSpots: 25,
        }).returning();
        zoneB = zb;
    }

    // 4. Dohvat operatera za kreiranje zapisa
    const [operatorUser] = await db.select().from(users).where(inArray(users.role, ["operator", "admin"])).limit(1);
    const opUserId = operatorUser ? operatorUser.id : "8a6042db-bb2b-42b7-a3f2-8924b130cf61";

    // 5. Kreiranje testnih korisnika i plovila
    const passwordHash = await bcrypt.hash("Lozinka123!", 10);
    const testClientsData = [
        { email: "ante.bilic@spinut-test.hr", name: "Ante Bilić", oib: "11223344551", phone: "0911122334", clientCategory: "member", vesselName: "Morska Zvijezda", reg: "ST-1022-MZ", len: "9.20", beam: "3.10", tons: "4.50", type: "motorni" },
        { email: "duje.maras@spinut-test.hr", name: "Duje Maras", oib: "22334455662", phone: "0982233445", clientCategory: "member", vesselName: "Galeb", reg: "ST-4521-GA", len: "6.50", beam: "2.30", tons: "1.80", type: "motorni" },
        { email: "nautika.servis@b2b-test.hr", name: "Nautika Servis d.o.o.", oib: "33445566773", phone: "0953344556", clientCategory: "commercial", vesselName: "Blue Horizon", reg: "ST-9988-BH", len: "12.00", beam: "4.10", tons: "8.50", type: "motorni" },
        { email: "petar.juric@spinut-test.hr", name: "Petar Jurić", oib: "44556677884", phone: "0924455667", clientCategory: "member", vesselName: "Barba", reg: "ST-3312-BA", len: "7.20", beam: "2.60", tons: "2.40", type: "jedrilica" },
        { email: "marija.kovac@spinut-test.hr", name: "Marija Kovač", oib: "55667788995", phone: "0975566778", clientCategory: "member", vesselName: "Adria", reg: "ST-7711-AD", len: "10.40", beam: "3.50", tons: "6.20", type: "jedrilica" },
        { email: "stipe.radic@spinut-test.hr", name: "Stipe Radić", oib: "66778899006", phone: "0916677889", clientCategory: "member", vesselName: "Dupin", reg: "ST-2244-DU", len: "8.80", beam: "2.95", tons: "3.80", type: "motorni" },
        { email: "luka.saric@spinut-test.hr", name: "Luka Šarić", oib: "77889900117", phone: "0987788990", clientCategory: "member", vesselName: "Plavi Val", reg: "ST-8822-PV", len: "11.20", beam: "3.80", tons: "7.80", type: "motorni" },
        { email: "filip.babic@spinut-test.hr", name: "Filip Babić", oib: "88990011228", phone: "0998899001", clientCategory: "member", vesselName: "Maestral", reg: "ST-5566-MA", len: "5.80", beam: "2.15", tons: "1.20", type: "motorni" },
        { email: "charter.split@b2b-test.hr", name: "Yacht Charter Split d.o.o.", oib: "99001122339", phone: "0959900112", clientCategory: "commercial", vesselName: "Poseidon", reg: "ST-6600-PO", len: "13.50", beam: "4.30", tons: "11.00", type: "motorni" },
        { email: "josip.vidovic@spinut-test.hr", name: "Josip Vidović", oib: "12312312312", phone: "0911231231", clientCategory: "member", vesselName: "Jadran", reg: "ST-1199-JA", len: "6.80", beam: "2.40", tons: "2.10", type: "motorni" },
        { email: "goran.tomic@spinut-test.hr", name: "Goran Tomić", oib: "23423423423", phone: "0982342342", clientCategory: "member", vesselName: "Sirena", reg: "ST-3388-SI", len: "9.50", beam: "3.20", tons: "4.90", type: "jedrilica" },
        { email: "zoran.delic@spinut-test.hr", name: "Zoran Delić", oib: "34534534534", phone: "0993453453", clientCategory: "member", vesselName: "Val", reg: "ST-4400-VA", len: "10.00", beam: "3.40", tons: "5.50", type: "motorni" },
        { email: "dragan.vukas@spinut-test.hr", name: "Dragan Vukas", oib: "45645645645", phone: "0924564564", clientCategory: "member", vesselName: "Bonaca", reg: "ST-7799-BO", len: "8.50", beam: "2.85", tons: "3.60", type: "motorni" },
        { email: "marko.peric@spinut-test.hr", name: "Marko Perić", oib: "56756756756", phone: "0915675675", clientCategory: "member", vesselName: "Skradin", reg: "ST-9911-SK", len: "6.20", beam: "2.20", tons: "1.50", type: "motorni" },
    ];

    const clientMap: Record<string, { user: any; vessel: any }> = {};

    for (const c of testClientsData) {
        let [u] = await db.select().from(users).where(eq(users.email, c.email));
        if (!u) {
            [u] = await db.insert(users).values({
                email: c.email,
                name: c.name,
                oib: c.oib,
                phone: c.phone,
                role: "user",
                clientCategory: c.clientCategory as any,
                passwordHash,
                userStatus: "active",
                emailVerifiedAt: new Date(),
            }).returning();
        }

        let [v] = await db.select().from(vessels).where(eq(vessels.registration, c.reg));
        if (!v) {
            [v] = await db.insert(vessels).values({
                ownerId: u.id,
                name: c.vesselName,
                registration: c.reg,
                lengthM: c.len,
                beamM: c.beam,
                weightTons: c.tons,
                type: c.type as any,
            }).returning();
        }

        clientMap[c.email] = { user: u, vessel: v };
    }

    console.log(`✅ Uspješno pripremljeno ${Object.keys(clientMap).length} korisnika i plovila.`);

    // 6. Dohvat resursa (npr. perač, struja)
    const dbResources = await db.select().from(resources);
    const washerResource = dbResources.find(r => r.name.toLowerCase().includes("perač") || r.code === "PERAC") || dbResources[0];

    // Očisti postojeće rezervacije za interval 17. - 21.09.2026. kako se ne bi gomilali duplikati pri ponovnom pokretanju
    const testDates = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"];
    
    // Dohvati stare rezervacije za brisanje povezanih zapisa
    const oldRes = await db.select({ id: reservations.id }).from(reservations).where(
        sql`to_char(scheduled_start AT TIME ZONE 'Europe/Zagreb', 'YYYY-MM-DD') IN ('2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21')`
    );
    const oldResIds = oldRes.map(r => r.id);
    if (oldResIds.length > 0) {
        console.log(`Čistim ${oldResIds.length} prethodnih testnih zapisa...`);
        await db.delete(workOrderResources).where(sql`work_order_id IN (SELECT id FROM work_orders WHERE reservation_id IN (${sql.join(oldResIds.map(id => sql`${id}`), sql`, `)}))`);
        await db.delete(workOrders).where(inArray(workOrders.reservationId, oldResIds));
        await db.delete(craneOperationLog).where(inArray(craneOperationLog.reservationId, oldResIds));
        await db.delete(landOccupancies).where(inArray(landOccupancies.reservationId, oldResIds));
        await db.delete(reservations).where(inArray(reservations.id, oldResIds));
    }

    // 7. Definiranje scenarija za svaki dan
    interface ScenarioDef {
        dateStr: string;
        startTimeStr: string;
        endTimeStr: string;
        durationMin: number;
        crane: any;
        clientEmail: string;
        service: any;
        landZone?: any;
        spotNumber?: number;
        status: "approved" | "completed";
        workOrder?: {
            orderNumber: string;
            status: "in_progress" | "completed";
            actualDurationMin?: number;
            operatorNotes?: string;
            completedAt?: string;
            resources?: { resourceId: string; quantity: number }[];
        };
        adminNote?: string;
    }

    const scenarios: ScenarioDef[] = [
        // ==================== ČETVRTAK, 17.09.2026. ====================
        {
            dateStr: "2026-09-17",
            startTimeStr: "2026-09-17T08:00:00+02:00",
            endTimeStr: "2026-09-17T09:00:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "ante.bilic@spinut-test.hr",
            service: liftService,
            landZone: zoneA,
            spotNumber: 5,
            status: "completed",
            workOrder: {
                orderNumber: "RN-2026-00012",
                status: "completed",
                actualDurationMin: 50,
                completedAt: "2026-09-17T08:50:00+02:00",
                operatorNotes: "Plovilo uspješno izvađeno, trup opran pod visokim pritiskom i pripremljen za nanošenje koperina. Smješteno na postolje u Zonu A.",
                resources: washerResource ? [{ resourceId: washerResource.id, quantity: 1 }] : [],
            },
            adminNote: "Član zatražio pranje i smještaj na radni plato",
        },
        {
            dateStr: "2026-09-17",
            startTimeStr: "2026-09-17T10:00:00+02:00",
            endTimeStr: "2026-09-17T10:30:00+02:00",
            durationMin: 30,
            crane: smallCrane,
            clientEmail: "duje.maras@spinut-test.hr",
            service: lowerService,
            status: "approved",
            workOrder: {
                orderNumber: "RN-2026-00013",
                status: "in_progress",
                operatorNotes: "Brodica dovezeno na traileru, postavljeni pasovi, u tijeku spuštanje u more.",
            },
            adminNote: "Spuštanje s prikolice",
        },
        {
            dateStr: "2026-09-17",
            startTimeStr: "2026-09-17T12:00:00+02:00",
            endTimeStr: "2026-09-17T13:00:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "nautika.servis@b2b-test.hr",
            service: liftService,
            status: "approved",
            adminNote: "Vanjski B2B klijent - ugovoren pregled osovine i ležaja, čeka potvrdu dolaska servisera.",
        },

        // ==================== PETAK, 18.09.2026. ====================
        {
            dateStr: "2026-09-18",
            startTimeStr: "2026-09-18T07:30:00+02:00",
            endTimeStr: "2026-09-18T08:15:00+02:00",
            durationMin: 45,
            crane: smallCrane,
            clientEmail: "petar.juric@spinut-test.hr",
            service: lowerService,
            status: "completed",
            workOrder: {
                orderNumber: "RN-2026-00014",
                status: "completed",
                actualDurationMin: 40,
                completedAt: "2026-09-18T08:10:00+02:00",
                operatorNotes: "Plovilo spušteno u more nakon zimovanja na suhom vezu. Motor upalio iz prve, vez u moru zauzet, suhi vez oslobođen.",
            },
        },
        {
            dateStr: "2026-09-18",
            startTimeStr: "2026-09-18T09:00:00+02:00",
            endTimeStr: "2026-09-18T10:00:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "marija.kovac@spinut-test.hr",
            service: liftService,
            landZone: zoneB,
            spotNumber: 8,
            status: "approved",
            adminNote: "Godišnje vađenje i zamjena cink protektora, smještaj u Zonu B.",
        },
        {
            dateStr: "2026-09-18",
            startTimeStr: "2026-09-18T11:00:00+02:00",
            endTimeStr: "2026-09-18T12:00:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "stipe.radic@spinut-test.hr",
            service: liftService,
            status: "approved",
            workOrder: {
                orderNumber: "RN-2026-00015",
                status: "in_progress",
                operatorNotes: "Trup obrastao algama, u tijeku visokotlačno pranje i priprema postolja.",
            },
        },

        // ==================== SUBOTA, 19.09.2026. ====================
        {
            dateStr: "2026-09-19",
            startTimeStr: "2026-09-19T08:00:00+02:00",
            endTimeStr: "2026-09-19T09:30:00+02:00",
            durationMin: 90,
            crane: travelLift,
            clientEmail: "luka.saric@spinut-test.hr",
            service: liftService,
            landZone: zoneA,
            spotNumber: 12,
            status: "completed",
            workOrder: {
                orderNumber: "RN-2026-00016",
                status: "completed",
                actualDurationMin: 70,
                completedAt: "2026-09-19T09:10:00+02:00",
                operatorNotes: "Vađenje jahte proteklo uredno. Trup neoštećen, smješteno u Zonu A uz sjevernu ogradu na osigurano postolje.",
            },
            adminNote: "Vlasnik zatražio postavljanje dodatnih potpornja",
        },
        {
            dateStr: "2026-09-19",
            startTimeStr: "2026-09-19T10:30:00+02:00",
            endTimeStr: "2026-09-19T11:00:00+02:00",
            durationMin: 30,
            crane: smallCrane,
            clientEmail: "filip.babic@spinut-test.hr",
            service: lowerService,
            status: "approved",
            adminNote: "Spuštanje gumenjaka za vikend vožnju.",
        },
        {
            dateStr: "2026-09-19",
            startTimeStr: "2026-09-19T12:00:00+02:00",
            endTimeStr: "2026-09-19T13:30:00+02:00",
            durationMin: 90,
            crane: travelLift,
            clientEmail: "charter.split@b2b-test.hr",
            service: liftService,
            status: "approved",
            adminNote: "Charter plovilo - redovan među-sezonski pregled trupa prije ponovnog najma.",
        },

        // ==================== NEDJELJA, 20.09.2026. ====================
        {
            dateStr: "2026-09-20",
            startTimeStr: "2026-09-20T09:00:00+02:00",
            endTimeStr: "2026-09-20T10:00:00+02:00",
            durationMin: 60,
            crane: smallCrane,
            clientEmail: "josip.vidovic@spinut-test.hr",
            service: liftService,
            status: "approved",
            adminNote: "Hitno vađenje zbog sumnje na prodor mora kroz manžetnu osovine.",
        },
        {
            dateStr: "2026-09-20",
            startTimeStr: "2026-09-20T10:30:00+02:00",
            endTimeStr: "2026-09-20T11:30:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "goran.tomic@spinut-test.hr",
            service: lowerService,
            status: "approved",
            adminNote: "Porinuće jedrilice nakon servisa kormila.",
        },

        // ==================== PONEDJELJAK, 21.09.2026. ====================
        {
            dateStr: "2026-09-21",
            startTimeStr: "2026-09-21T07:00:00+02:00",
            endTimeStr: "2026-09-21T08:00:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "zoran.delic@spinut-test.hr",
            service: liftService,
            status: "approved",
            adminNote: "Prvi jutarnji termin - član donosi materijal za antifauling.",
        },
        {
            dateStr: "2026-09-21",
            startTimeStr: "2026-09-21T08:30:00+02:00",
            endTimeStr: "2026-09-21T09:30:00+02:00",
            durationMin: 60,
            crane: travelLift,
            clientEmail: "dragan.vukas@spinut-test.hr",
            service: liftService,
            landZone: zoneB,
            spotNumber: 3,
            status: "approved",
            adminNote: "Vađenje i smještaj na suhi vez Zona B.",
        },
        {
            dateStr: "2026-09-21",
            startTimeStr: "2026-09-21T10:00:00+02:00",
            endTimeStr: "2026-09-21T10:30:00+02:00",
            durationMin: 30,
            crane: smallCrane,
            clientEmail: "marko.peric@spinut-test.hr",
            service: lowerService,
            status: "approved",
            adminNote: "Spuštanje plovila nakon kraćeg popravka.",
        },
    ];

    let counter = 100;

    for (const sc of scenarios) {
        counter++;
        const client = clientMap[sc.clientEmail];
        if (!client) continue;

        const resNum = `REZ-2026-09${counter}`;
        const startTs = new Date(sc.startTimeStr);
        const endTs = new Date(sc.endTimeStr);

        const [res] = await db.insert(reservations).values({
            reservationNumber: resNum,
            userId: client.user.id,
            vesselId: client.vessel.id,
            serviceTypeId: sc.service.id,
            craneId: sc.crane.id,
            scheduledStart: startTs,
            scheduledEnd: endTs,
            durationMin: sc.durationMin,
            requestedDate: sc.dateStr,
            status: sc.status,
            landZoneId: sc.landZone ? sc.landZone.id : null,
            adminNote: sc.adminNote || null,
            userOib: client.user.oib,
            vesselName: client.vessel.name,
            vesselRegistration: client.vessel.registration,
            vesselLengthM: client.vessel.lengthM,
            vesselBeamM: client.vessel.beamM,
            vesselWeightTons: client.vessel.weightTons,
            vesselType: client.vessel.type,
        }).returning();

        // Ako scenarij ima radni nalog
        if (sc.workOrder) {
            const woStartedAt = startTs;
            const woCompletedAt = sc.workOrder.completedAt ? new Date(sc.workOrder.completedAt) : null;

            const [wo] = await db.insert(workOrders).values({
                reservationId: res.id,
                orderNumber: sc.workOrder.orderNumber,
                userId: client.user.id,
                vesselId: client.vessel.id,
                status: sc.workOrder.status,
                clientType: (client.user.clientCategory === "commercial" ? "external" : "member") as "external" | "member",
                operatorNotes: sc.workOrder.operatorNotes || null,
                startedAt: woStartedAt,
                completedAt: woCompletedAt,
                actualDurationMin: sc.workOrder.actualDurationMin || (sc.workOrder.status === "completed" ? sc.durationMin : null),
                craneId: sc.crane.id,
            }).returning();

            // Resursi ako postoje
            if (sc.workOrder.resources && sc.workOrder.resources.length > 0) {
                for (const r of sc.workOrder.resources) {
                    await db.insert(workOrderResources).values({
                        workOrderId: wo.id,
                        resourceId: r.resourceId,
                        quantity: String(r.quantity),
                        unitPriceEur: "25.00",
                        totalPriceEur: (r.quantity * 25).toFixed(2),
                        notes: "Korišteno na radnom nalogu",
                    });
                }
            }

            // Ako je dovršen, evidentiraj i rad dizalice
            if (sc.workOrder.status === "completed") {
                await db.insert(craneOperationLog).values({
                    craneId: sc.crane.id,
                    reservationId: res.id,
                    operatorId: opUserId,
                    startTime: woStartedAt,
                    endTime: woCompletedAt || endTs,
                    durationMinutes: sc.workOrder.actualDurationMin || sc.durationMin,
                    operationType: sc.service.operationCategory === "lift_from_sea" ? "lift" : "lower",
                    note: sc.workOrder.operatorNotes || "Uredno završeno",
                });

                // Ako ima zonu kopna, evidentiraj smještaj
                if (sc.landZone) {
                    await db.insert(landOccupancies).values({
                        vesselId: client.vessel.id,
                        userId: client.user.id,
                        zoneId: sc.landZone.id,
                        spotNumber: sc.spotNumber || null,
                        reservationId: res.id,
                        liftedAt: woCompletedAt || startTs,
                        createdBy: opUserId,
                        note: `Smješteno putem naloga ${sc.workOrder.orderNumber}`,
                    });
                }
            }
        }

        console.log(`✓ [${sc.dateStr}] ${sc.startTimeStr.substring(11, 16)} - ${sc.endTimeStr.substring(11, 16)} | ${sc.crane.name.padEnd(24)} | ${client.vessel.name.padEnd(16)} | ${sc.status.padEnd(11)} | Nalog: ${sc.workOrder ? sc.workOrder.orderNumber : "—"}`);
    }

    console.log("\n🎉 Uspješno kreirani svi testni scenariji za 17. - 21.09.2026.!");
    process.exit(0);
}

seedSeptemberScenarios().catch(err => {
    console.error("Greška pri unosu scenarija:", err);
    process.exit(1);
});
