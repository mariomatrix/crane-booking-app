import nodemailer from "nodemailer";

export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
}

function getTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

async function sendEmail(payload: EmailPayload) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn("[Email] SMTP not configured — skipping email to", payload.to);
        return false;
    }
    try {
        const transporter = getTransporter();
        await transporter.sendMail({
            from: `"Marina Crane Booking" <${process.env.SMTP_USER}>`,
            ...payload,
        });
        return true;
    } catch (err) {
        console.warn("[Email] Failed to send:", err);
        return false;
    }
}

export async function sendReservationConfirmation(opts: {
    to: string;
    userName: string;
    craneName: string;
    startDate: Date;
    endDate: Date;
    craneLocation: string;
    adminNotes?: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? `Rezervacija potvrđena — ${opts.craneName}`
        : `Reservation Confirmed — ${opts.craneName}`;
    const startStr = opts.startDate.toLocaleString(isHr ? "hr-HR" : "en-GB");
    const endStr = opts.endDate.toLocaleString(isHr ? "hr-HR" : "en-GB");

    const html = `
    <h2>${isHr ? "Pozdrav" : "Hello"}, ${opts.userName}!</h2>
    <p>${isHr ? "Vaša rezervacija je potvrđena." : "Your reservation has been confirmed."}</p>
    <table style="border-collapse:collapse;font-family:sans-serif">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Dizalica" : "Crane"}:</td><td>${opts.craneName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Početak" : "Start"}:</td><td>${startStr}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Kraj" : "End"}:</td><td>${endStr}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Bazen/Pozicija" : "Basin/Position"}:</td><td><strong>${opts.craneLocation}</strong></td></tr>
      ${opts.adminNotes ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Napomena" : "Note"}:</td><td>${opts.adminNotes}</td></tr>` : ""}
    </table>
    <p style="margin-top:16px">${isHr ? "Molimo uplovite u navedeni bazen do navedenog vremena." : "Please sail into the specified basin by the specified time."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}

export async function sendReservationRejection(opts: {
    to: string;
    userName: string;
    craneName: string;
    startDate: Date;
    reason?: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? `Rezervacija odbijena — ${opts.craneName}`
        : `Reservation Rejected — ${opts.craneName}`;
    const startStr = opts.startDate.toLocaleString(isHr ? "hr-HR" : "en-GB");

    const html = `
    <h2>${isHr ? "Pozdrav" : "Hello"}, ${opts.userName}!</h2>
    <p>${isHr ? "Nažalost, vaša rezervacija je odbijena." : "Unfortunately, your reservation has been rejected."}</p>
    <table style="border-collapse:collapse;font-family:sans-serif">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Dizalica" : "Crane"}:</td><td>${opts.craneName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Traženo vrijeme" : "Requested time"}:</td><td>${startStr}</td></tr>
      ${opts.reason ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Razlog" : "Reason"}:</td><td>${opts.reason}</td></tr>` : ""}
    </table>
    <p style="margin-top:16px">${isHr ? "Pokušajte s drugim terminom." : "Please try another time slot."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}

export async function sendWaitingListNotification(opts: {
    to: string;
    userName: string;
    craneName: string;
    date: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? `Termin dostupan — ${opts.craneName}`
        : `Slot Available — ${opts.craneName}`;
    const html = `
    <h2>${isHr ? "Pozdrav" : "Hello"}, ${opts.userName}!</h2>
    <p>${isHr
            ? `Termin koji ste čekali za <strong>${opts.craneName}</strong> na dan <strong>${opts.date}</strong> je sada dostupan.`
            : `A slot you were waiting for on <strong>${opts.craneName}</strong> on <strong>${opts.date}</strong> is now available.`
        }</p>
    <p>${isHr ? "Prijavite se i rezervirajte termin dok je dostupan." : "Log in and book the slot while it's available."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}
