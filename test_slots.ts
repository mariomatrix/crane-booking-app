
import "dotenv/config";
import { getAllSettings, getDb, checkOverlap, listCranes } from "./server/db";

function parseHHMM(timeStr: string): { h: number; m: number } {
    const [h, m] = timeStr.split(":").map(Number);
    return { h: h ?? 8, m: m ?? 0 };
}

async function testAvailableSlots() {
    try {
        const db = await getDb();
        if (!db) {
            console.log("NOT CONNECTED - ensure DATABASE_URL is in .env");
            return;
        }

        const sysSettings = await getAllSettings();
        console.log("Settings:", sysSettings);

        const cranes = await listCranes();
        if (cranes.length === 0) {
            console.log("No cranes found");
            return;
        }

        const craneId = cranes[0].id;
        const dateStr = "2026-03-19";
        const slotCount = 1;
        const slotMin = 60;
        const bufferMin = 0;

        const dateObj = new Date(dateStr);
        const { h: wsH, m: wsM } = parseHHMM(sysSettings.workdayStart ?? "08:00");
        const { h: weH, m: weM } = parseHHMM(sysSettings.workdayEnd ?? "16:00");

        const dayStartUTC = new Date(dateObj.getTime());
        dayStartUTC.setUTCHours(wsH, wsM, 0, 0);

        const dayEndUTC = new Date(dateObj.getTime());
        dayEndUTC.setUTCHours(weH, weM, 0, 0);

        const totalMinutes = (dayEndUTC.getTime() - dayStartUTC.getTime()) / 60000;
        const totalSlots = Math.floor(totalMinutes / slotMin);

        console.log(`Testing Crane ${craneId} on ${dateStr}`);
        console.log(`Day Start (UTC): ${dayStartUTC.toISOString()} (${dayStartUTC.getTime()})`);
        console.log(`Day End (UTC): ${dayEndUTC.toISOString()} (${dayEndUTC.getTime()})`);
        console.log(`Total Minutes: ${totalMinutes}, Total Slots: ${totalSlots}`);

        const availableStarts: Date[] = [];

        for (let i = 0; i <= totalSlots - slotCount; i++) {
            const slotStart = new Date(dayStartUTC.getTime() + i * slotMin * 60000);
            const slotEnd = new Date(slotStart.getTime() + slotCount * slotMin * 60000);
            const effectiveEnd = new Date(slotEnd.getTime() + bufferMin * 60000);

            console.log(`Checking Slot ${i}: ${slotStart.toISOString()} -> ${effectiveEnd.toISOString()}`);
            const overlap = await checkOverlap(craneId, slotStart, effectiveEnd);
            if (overlap) {
                console.log(`  -> OVERLAP detected`);
            } else {
                console.log(`  -> FREE`);
                availableStarts.push(slotStart);
            }
        }

        console.log(`Found ${availableStarts.length} available slots.`);

    } catch (err) {
        console.error("Test failed:", err);
    }
}

testAvailableSlots();
