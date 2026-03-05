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
            from: process.env.SMTP_FROM ? `"Marina Crane Booking" <${process.env.SMTP_FROM}>` : `"Marina Crane Booking" <${process.env.SMTP_USER}>`,
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
    vesselName?: string;
    vesselType?: string;
    vesselWeightKg?: number | string;
    userNote?: string;
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
    <p>${isHr
            ? "Vaša rezervacija je potvrđena. Molimo Vas da se pojavite u lučici na vrijeme."
            : "Your reservation has been confirmed. Please arrive at the marina on time."
        }</p>
    <table style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:500px">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;width:140px">${isHr ? "Dizalica" : "Crane"}:</td><td>${opts.craneName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Početak" : "Start"}:</td><td>${startStr}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Kraj" : "End"}:</td><td>${endStr}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Lokacija" : "Location"}:</td><td><strong>${opts.craneLocation}</strong></td></tr>
      
      <tr><td colspan="2" style="border-top:1px solid #eee;padding:8px 0 4px 0;font-size:12px;color:#888;text-transform:uppercase">${isHr ? "Detalji plovila" : "Vessel Details"}</td></tr>
      ${opts.vesselName ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Plovilo" : "Vessel"}:</td><td>${opts.vesselName}</td></tr>` : ""}
      ${opts.vesselType ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Tip" : "Type"}:</td><td>${opts.vesselType}</td></tr>` : ""}
      ${opts.vesselWeightKg ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Težina" : "Weight"}:</td><td>${opts.vesselWeightKg}kg</td></tr>` : ""}
      
      ${opts.userNote ? `<tr><td colspan="2" style="border-top:1px solid #eee;padding:8px 0 4px 0;font-size:12px;color:#888;text-transform:uppercase">${isHr ? "Vaša napomena" : "Your Note"}</td></tr><tr><td colspan="2" style="padding:4px 0">${opts.userNote}</td></tr>` : ""}
      
      ${opts.adminNotes ? `<tr><td colspan="2" style="border-top:1px solid #eee;padding:8px 0 4px 0;font-size:12px;color:#888;text-transform:uppercase">${isHr ? "Napomena administratora" : "Admin Note"}</td></tr><tr><td colspan="2" style="padding:4px 0;color:#2563eb">${opts.adminNotes}</td></tr>` : ""}
    </table>
    <p style="margin-top:24px">${isHr ? "Vidimo se!" : "See you there!"}</p>
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

export async function sendPasswordResetEmail(opts: {
    to: string;
    userName: string;
    resetUrl: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? "Resetiranje lozinke — Marina Crane Booking"
        : "Reset your password — Marina Crane Booking";

    const html = `
    <h2>${isHr ? "Pozdrav" : "Hello"}, ${opts.userName}!</h2>
    <p>${isHr
            ? "Primili smo zahtjev za resetiranje vaše lozinke. Ako niste zatražili ovu promjenu, možete slobodno ignorirati ovaj email."
            : "We received a request to reset your password. If you didn't make this request, you can safely ignore this email."
        }</p>
    <p>${isHr
            ? `Za postavljanje nove lozinke, kliknite na gumb ispod:`
            : `To set a new password, click the button below:`
        }</p>
    <div style="margin:24px 0">
      <a href="${opts.resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
        ${isHr ? "Resetiraj lozinku" : "Reset Password"}
      </a>
    </div>
    <p style="color:#888;font-size:12px">${isHr ? "Ovaj link vrijedi 60 minuta." : "This link is valid for 60 minutes."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}

export async function sendReservationReceived(opts: {
    to: string;
    userName: string;
    reservationNumber: string;
    craneName?: string;
    requestedDate: string;
    lang?: "hr" | "en";
    vesselName?: string;
    vesselType?: string;
    vesselWeightKg?: number | string;
    userNote?: string;
    contactPhone?: string;
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? `Zahtjev zaprimljen — ${opts.reservationNumber}`
        : `Request Received — ${opts.reservationNumber}`;

    const html = `
    <h2>${isHr ? "Pozdrav" : "Hello"}, ${opts.userName}!</h2>
    <p>${isHr
            ? "Vaš zahtjev za rezervaciju je uspješno zaprimljen i trenutno čeka na odobrenje administratora."
            : "Your reservation request has been successfully received and is currently waiting for administrator approval."
        }</p>
    <table style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:500px">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;width:140px">${isHr ? "Broj rezervacije" : "Reservation Number"}:</td><td>${opts.reservationNumber}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Traženi datum" : "Requested Date"}:</td><td>${opts.requestedDate}</td></tr>
      ${opts.craneName ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Dizalica" : "Crane"}:</td><td>${opts.craneName}</td></tr>` : ""}
      
      <tr><td colspan="2" style="border-top:1px solid #eee;padding:8px 0 4px 0;font-size:12px;color:#888;text-transform:uppercase">${isHr ? "Detalji plovila" : "Vessel Details"}</td></tr>
      ${opts.vesselName ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Plovilo" : "Vessel"}:</td><td>${opts.vesselName}</td></tr>` : ""}
      ${opts.vesselType ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Tip" : "Type"}:</td><td>${opts.vesselType}</td></tr>` : ""}
      ${opts.vesselWeightKg ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Težina" : "Weight"}:</td><td>${opts.vesselWeightKg}kg</td></tr>` : ""}
      
      ${opts.contactPhone ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${isHr ? "Kontakt telefon" : "Contact Phone"}:</td><td>${opts.contactPhone}</td></tr>` : ""}
      
      ${opts.userNote ? `<tr><td colspan="2" style="border-top:1px solid #eee;padding:8px 0 4px 0;font-size:12px;color:#888;text-transform:uppercase">${isHr ? "Vaša napomena" : "Your Note"}</td></tr><tr><td colspan="2" style="padding:4px 0">${opts.userNote}</td></tr>` : ""}
    </table>
    <p style="margin-top:16px">${isHr ? "Obavijestit ćemo vas čim status vaše rezervacije bude promijenjen." : "We will notify you as soon as the status of your reservation is changed."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}

export async function sendEmailVerification(opts: {
    to: string;
    userName: string;
    verifyUrl: string;
    lang?: "hr" | "en";
}) {
    const { lang = "hr" } = opts;
    const isHr = lang === "hr";
    const subject = isHr
        ? "Potvrdite email adresu — Marina Crane Booking"
        : "Verify your email — Marina Crane Booking";

    const html = `
    <h2>${isHr ? "Dobrodošli" : "Welcome"}, ${opts.userName}!</h2>
    <p>${isHr
            ? "Hvala na registraciji. Molimo potvrdite svoju email adresu klikom na gumb ispod:"
            : "Thank you for registering. Please verify your email address by clicking the button below:"
        }</p>
    <div style="margin:24px 0">
      <a href="${opts.verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
        ${isHr ? "Potvrdi email" : "Verify Email"}
      </a>
    </div>
    <p style="color:#888;font-size:12px">${isHr ? "Ovaj link vrijedi 24 sata." : "This link is valid for 24 hours."}</p>
    <p style="color:#888;font-size:12px">Marina Crane Booking System</p>
  `;
    return sendEmail({ to: opts.to, subject, html });
}
