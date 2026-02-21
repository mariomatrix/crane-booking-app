
import "dotenv/config";
import { getAllSettings, getDb, checkOverlap, listAllReservations, listCranes } from "./server/db";

async function debug() {
    try {
        const db = await getDb();
        if (!db) {
            console.log("Could not connect to database. Is DATABASE_URL set?");
            return;
        }

        const settings = await getAllSettings();
        console.log("Settings:", JSON.stringify(settings, null, 2));

        const cranes = await listCranes();
        console.log("Cranes:", JSON.stringify(cranes, null, 2));

        const reservations = await listAllReservations();
        console.log("Total Reservations:", reservations.length);

        const testDate = "2026-03-19";
        const craneId = cranes[0]?.id;

        if (!craneId) {
            console.log("No cranes found!");
            return;
        }

        console.log(`Checking availability for crane ${craneId} on ${testDate}...`);

        const slotMin = 60;
        const bufferMin = 0;
        const dateObj = new Date(testDate);
        const { h: wsH, m: wsM } = { h: 8, m: 0 }; // Default
        const { h: weH, m: weM } = { h: 16, m: 0 }; // Default

        const dayStartUTC = new Date(dateObj.getTime());
        dayStartUTC.setUTCHours(wsH, wsM, 0, 0);
        const dayEndUTC = new Date(dateObj.getTime());
        dayEndUTC.setUTCHours(weH, weM, 0, 0);

        const totalMinutes = (dayEndUTC.getTime() - dayStartUTC.getTime()) / 60000;
        const totalSlots = Math.floor(totalMinutes / slotMin);

        console.log(`Total slots: ${totalSlots}`);

        for (let i = 0; i < totalSlots; i++) {
            const slotStart = new Date(dayStartUTC.getTime() + i * slotMin * 60000);
            const slotEnd = new Date(slotStart.getTime() + slotMin * 60000);
            const overlap = await checkOverlap(craneId, slotStart, slotEnd);
            console.log(`Slot ${i} (${slotStart.toISOString()}): ${overlap ? 'BUSY' : 'FREE'}`);
        }

    } catch (err) {
        console.error("Debug failed:", err);
    }
}

debug();
