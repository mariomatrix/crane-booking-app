/** SMS sending via Infobip REST API */

const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_SENDER = process.env.INFOBIP_SENDER || "Marina";

export async function sendSms(to: string, message: string): Promise<boolean> {
    if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
        console.warn("[SMS] Infobip not configured — skipping SMS to", to);
        return false;
    }
    // Normalize phone: must start with country code e.g. +385...
    try {
        const response = await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
            method: "POST",
            headers: {
                "Authorization": `App ${INFOBIP_API_KEY}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({
                messages: [
                    {
                        from: INFOBIP_SENDER,
                        destinations: [{ to }],
                        text: message,
                    },
                ],
            }),
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            console.warn(`[SMS] Failed (${response.status}): ${detail}`);
            return false;
        }
        return true;
    } catch (err) {
        console.warn("[SMS] Error:", err);
        return false;
    }
}

export async function sendReservationConfirmationSms(opts: {
    phone: string;
    craneName: string;
    startDate: Date;
    location: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const time = opts.startDate.toLocaleString(lang === "hr" ? "hr-HR" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
    const msg = lang === "hr"
        ? `MARINA: Rezervacija za ${opts.craneName} potvrđena. Dođite u ${opts.location} u ${time}.`
        : `MARINA: Reservation for ${opts.craneName} confirmed. Come to ${opts.location} at ${time}.`;
    return sendSms(opts.phone, msg);
}

export async function sendReservationRejectionSms(opts: {
    phone: string;
    craneName: string;
    reason?: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const msg = lang === "hr"
        ? `MARINA: Rezervacija za ${opts.craneName} je odbijena.${opts.reason ? " Razlog: " + opts.reason : ""}`
        : `MARINA: Reservation for ${opts.craneName} was rejected.${opts.reason ? " Reason: " + opts.reason : ""}`;
    return sendSms(opts.phone, msg);
}
