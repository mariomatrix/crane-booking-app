import crypto from "crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, or, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import {
  users,
  authSessions,
  authAccounts,
  authVerifications,
  memberLinks,
  auditLog,
} from "../../drizzle/schema";
import { sendAuthOtpEmail, sendMagicLinkEmail } from "./email";

let _authInstance: ReturnType<typeof createBetterAuthInstance> | null = null;

function createBetterAuthInstance() {
  const connectionString =
    process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/crane_booking";
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });

  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.PUBLIC_URL ||
    "http://localhost:3000";

  const secret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.JWT_SECRET ||
    "crane-booking-better-auth-secret-key-2026";

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    user: {
      additionalFields: {
        firstName: {
          type: "string",
          required: false,
        },
        lastName: {
          type: "string",
          required: false,
        },
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        userStatus: {
          type: "string",
          required: false,
          defaultValue: "pending_verification",
          input: false,
        },
        clientCategory: {
          type: "string",
          required: false,
          defaultValue: "member",
          input: false,
        },
        loginMethod: {
          type: "string",
          required: false,
          defaultValue: "better-auth",
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const rawName = (user.name || "").trim();
            const emailPrefix = user.email ? user.email.split("@")[0] : "Korisnik";
            const parts = rawName ? rawName.split(/\s+/) : [emailPrefix];
            const firstName = (user as any).firstName || parts[0] || emailPrefix;
            const lastName =
              (user as any).lastName ||
              (parts.length > 1 ? parts.slice(1).join(" ") : "");

            return {
              data: {
                ...user,
                email: user.email ? user.email.trim().toLowerCase() : user.email,
                name: rawName || `${firstName} ${lastName}`.trim(),
                firstName,
                lastName,
                role: (user as any).role || "user",
                // Novi korisnici čiji e-mail nije bio u MSSQL bazi idu u pending_verification
                // dok se ne povežu preko OIB-a + Matičnog broja ili dok ih admin ne odobri
                userStatus: (user as any).userStatus || "active",
                emailVerified: true,
                emailVerifiedAt: new Date(),
                loginMethod: (user as any).loginMethod || "better-auth",
              },
            };
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            try {
              await db
                .update(users)
                .set({
                  lastSignedIn: new Date(),
                  emailVerified: true,
                  emailVerifiedAt: sql`COALESCE(${users.emailVerifiedAt}, NOW())`,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, session.userId));
            } catch (err) {
              console.warn("[BetterAuth] Failed to update user lastSignedIn:", err);
            }
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600, // 10 minuta
        async sendVerificationOTP({ email, otp, type }) {
          await sendAuthOtpEmail({
            to: email,
            otp,
            type,
            lang: "hr",
          });
        },
      }),
      magicLink({
        expiresIn: 600, // 10 minuta
        async sendMagicLink({ email, url }) {
          await sendMagicLinkEmail({
            to: email,
            url,
            lang: "hr",
          });
        },
      }),
    ],
  });
}

export function getAuth() {
  if (!_authInstance) {
    _authInstance = createBetterAuthInstance();
  }
  return _authInstance;
}

/**
 * Normalizes a legacy member number (MAT_BROJ) by trimming spaces and leading zeros
 * so both "00123" and "123" match properly.
 */
export function normalizeMatBroj(val: string): string {
  const trimmed = val.trim();
  const stripped = trimmed.replace(/^0+/, "");
  return stripped || "0";
}

/**
 * Member Claim Flow:
 * Links a newly authenticated Better Auth user (who signed in with a personal Gmail / Email OTP
 * not previously recorded in MSSQL) to their existing MSSQL-synced member profile (`users` + `member_links`)
 * verified by OIB + Matični broj člana (`legacyMatBroj`).
 */
export async function claimSyncedMemberProfile(opts: {
  currentUserId: string;
  oib: string;
  matBroj: string;
}): Promise<{
  mergedUserId: string;
  memberName: string;
  legacyMatBroj: string;
}> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) {
    throw new Error("Baza podataka nije dostupna.");
  }

  const cleanOib = opts.oib.trim();
  const cleanMatBroj = opts.matBroj.trim();
  const normalizedInputMat = normalizeMatBroj(cleanMatBroj);

  // 1. Dohvati trenutnog (novog) korisnika
  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, opts.currentUserId))
    .limit(1);

  if (!currentUser) {
    throw new Error("Trenutni korisnički račun nije pronađen.");
  }

  // Provjeri je li trenutni korisnik već povezan s member_links
  const existingCurrentLinks = await db
    .select()
    .from(memberLinks)
    .where(eq(memberLinks.userId, currentUser.id))
    .limit(1);

  if (existingCurrentLinks.length > 0) {
    // Već je povezan s članskim profilom — samo osiguraj da je active
    if (currentUser.userStatus !== "active") {
      await db
        .update(users)
        .set({ userStatus: "active", updatedAt: new Date() })
        .where(eq(users.id, currentUser.id));
    }
    return {
      mergedUserId: currentUser.id,
      memberName: currentUser.name || `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim(),
      legacyMatBroj: existingCurrentLinks[0].legacyMatBroj,
    };
  }

  // 2. Pronađi sinkroniziranog člana u member_links + users prema OIB-u
  const candidateRows = await db
    .select({
      link: memberLinks,
      memberUser: users,
    })
    .from(memberLinks)
    .innerJoin(users, eq(memberLinks.userId, users.id))
    .where(
      or(
        eq(memberLinks.legacyOib, cleanOib),
        eq(users.oib, cleanOib)
      )
    );

  // Filtriraj prema matičnom broju (točno podudaranje ili podudaranje bez vodećih nula)
  const matched = candidateRows.find(
    (row) =>
      row.link.legacyMatBroj.trim() === cleanMatBroj ||
      normalizeMatBroj(row.link.legacyMatBroj) === normalizedInputMat
  );

  if (!matched) {
    throw new Error(
      "Nije pronađen član PŠD Špinut s unesenom kombinacijom OIB-a i matičnog broja. Provjerite podatke na članskoj iskaznici."
    );
  }

  const targetUser = matched.memberUser;
  const targetLink = matched.link;

  // Ako je to već isti korisnik
  if (targetUser.id === currentUser.id) {
    await db
      .update(users)
      .set({ userStatus: "active", updatedAt: new Date() })
      .where(eq(users.id, targetUser.id));

    return {
      mergedUserId: targetUser.id,
      memberName: targetUser.name || "",
      legacyMatBroj: targetLink.legacyMatBroj,
    };
  }

  // Sigurnosna provjera: ako ciljni član već ima drugi verificirani račun (drugi Google ID ili drugi verificirani email)
  if (
    targetUser.email &&
    targetUser.emailVerifiedAt &&
    currentUser.email &&
    targetUser.email.toLowerCase() !== currentUser.email.toLowerCase()
  ) {
    throw new Error(
      "Ovaj članski profil je već povezan s drugom verificiranom e-mail adresom. Obratite se upravi lučice."
    );
  }

  // 3. Spoji (Merge) u transakciji: prebaci auth_accounts i auth_sessions na stvarni članski UUID (`targetUser.id`)
  await db.transaction(async (tx) => {
    const emailToTransfer = currentUser.email || targetUser.email;
    const googleIdToTransfer = currentUser.googleId || targetUser.googleId;
    const imageToTransfer = currentUser.image || targetUser.image;
    const passwordHashToTransfer = currentUser.passwordHash || targetUser.passwordHash;

    // Prebaci Better Auth sesije i račune na postojećeg člana
    await tx
      .update(authSessions)
      .set({ userId: targetUser.id, updatedAt: new Date() })
      .where(eq(authSessions.userId, currentUser.id));

    await tx
      .update(authAccounts)
      .set({ userId: targetUser.id, updatedAt: new Date() })
      .where(eq(authAccounts.userId, currentUser.id));

    // Oslobodi UNIQUE ograničenja (email, googleId) na privremenom zapisu prije brisanja
    await tx
      .update(users)
      .set({
        email: null,
        googleId: null,
        oib: null,
      })
      .where(eq(users.id, currentUser.id));

    // Obriši privremeni (prazni) korisnički zapis
    await tx.delete(users).where(eq(users.id, currentUser.id));

    // Ažuriraj stvarni članski zapis s verificiranim podacima za prijavu
    await tx
      .update(users)
      .set({
        email: emailToTransfer,
        googleId: googleIdToTransfer,
        image: imageToTransfer,
        passwordHash: passwordHashToTransfer,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        userStatus: "active",
        clientCategory: "member",
        loginMethod: currentUser.loginMethod || "better-auth",
        lastSignedIn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUser.id));

    // Zapiši u revizijski dnevnik (audit_log)
    await tx.insert(auditLog).values({
      actorId: targetUser.id,
      action: "member_profile_claimed",
      entityType: "user",
      entityId: targetUser.id,
      payload: {
        legacyMatBroj: targetLink.legacyMatBroj,
        oib: cleanOib,
        mergedFromTempUserId: currentUser.id,
        claimedEmail: emailToTransfer,
      },
    });
  });

  return {
    mergedUserId: targetUser.id,
    memberName:
      targetUser.name ||
      `${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim(),
    legacyMatBroj: targetLink.legacyMatBroj,
  };
}

/**
 * Generates and emails a 6-digit OTP code stored in `auth_verifications`.
 */
export async function sendEmailOtpCode(email: string): Promise<void> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const normalizedEmail = email.trim().toLowerCase();
  const identifier = `email-otp:${normalizedEmail}`;
  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db
    .delete(authVerifications)
    .where(eq(authVerifications.identifier, identifier));

  await db.insert(authVerifications).values({
    identifier,
    value: otp,
    expiresAt,
  });

  await sendAuthOtpEmail({
    to: normalizedEmail,
    otp,
    type: "sign-in",
    lang: "hr",
  });
}

/**
 * Verifies a 6-digit Email OTP code, upserts the user, creates an `auth_sessions` record,
 * and determines whether the user needs to complete the Member Claim step.
 */
export async function verifyEmailOtpCode(opts: {
  email: string;
  otp: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { getDb, getUserByEmail, createLocalUser, getUserById } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const normalizedEmail = opts.email.trim().toLowerCase();
  const cleanOtp = opts.otp.trim();
  const identifier = `email-otp:${normalizedEmail}`;

  const [verification] = await db
    .select()
    .from(authVerifications)
    .where(
      and(
        eq(authVerifications.identifier, identifier),
        eq(authVerifications.value, cleanOtp)
      )
    )
    .limit(1);

  if (!verification || verification.expiresAt < new Date()) {
    throw new Error("Kod je neispravan ili je istekao. Zatražite novi kod.");
  }

  // Jednokratna upotreba — odmah obriši verificirani OTP
  await db
    .delete(authVerifications)
    .where(eq(authVerifications.id, verification.id));

  return finalizePasswordlessSignIn({
    email: normalizedEmail,
    loginMethod: "email-otp",
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });
}

/**
 * Generates and emails a single-use Magic Link stored in `auth_verifications`.
 */
export async function sendMagicLinkUrl(email: string, baseUrl: string): Promise<void> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const normalizedEmail = email.trim().toLowerCase();
  const token = crypto.randomBytes(32).toString("hex");
  const identifier = `magic-link:${token}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db.insert(authVerifications).values({
    identifier,
    value: normalizedEmail,
    expiresAt,
  });

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/auth?magicToken=${token}`;

  await sendMagicLinkEmail({
    to: normalizedEmail,
    url,
    lang: "hr",
  });
}

/**
 * Verifies a single-use Magic Link token, upserts the user, and creates a session.
 */
export async function verifyMagicLinkToken(opts: {
  token: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const cleanToken = opts.token.trim();
  const identifier = `magic-link:${cleanToken}`;

  const [verification] = await db
    .select()
    .from(authVerifications)
    .where(eq(authVerifications.identifier, identifier))
    .limit(1);

  if (!verification || verification.expiresAt < new Date()) {
    throw new Error("Poveznica za prijavu je neispravna ili je istekla.");
  }

  // Jednokratna upotreba
  await db
    .delete(authVerifications)
    .where(eq(authVerifications.id, verification.id));

  return finalizePasswordlessSignIn({
    email: verification.value,
    loginMethod: "magic-link",
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });
}

async function finalizePasswordlessSignIn(opts: {
  email: string;
  loginMethod: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { getDb, getUserByEmail, createLocalUser, getUserById } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  let user = await getUserByEmail(opts.email);
  let needsMemberClaim = false;

  if (!user) {
    const emailPrefix = opts.email.split("@")[0] || "Korisnik";
    const newUserId = await createLocalUser({
      email: opts.email,
      passwordHash: "",
      firstName: emailPrefix,
      lastName: "",
      name: emailPrefix,
      userStatus: "active",
      loginMethod: opts.loginMethod,
    });
    if (!newUserId) {
      throw new Error("Neuspjelo kreiranje korisničkog računa.");
    }
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerifiedAt: new Date(),
        userStatus: "active",
        loginMethod: opts.loginMethod,
      })
      .where(eq(users.id, newUserId));

    user = await getUserById(newUserId);
    needsMemberClaim = true;
  } else {
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
        lastSignedIn: new Date(),
        loginMethod: opts.loginMethod,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    user = await getUserById(user.id);

    if (user && user.userStatus === "pending_verification" && user.role === "user") {
      const links = await db
        .select({ id: memberLinks.id })
        .from(memberLinks)
        .where(eq(memberLinks.userId, user.id))
        .limit(1);
      if (links.length === 0) {
        needsMemberClaim = true;
      }
    }
  }

  if (!user) {
    throw new Error("Korisnik nije pronađen.");
  }

  // Kreiraj zapis sesije u auth_sessions (mogućnost pregleda i opoziva po uređaju)
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dana

  await db.insert(authSessions).values({
    token: sessionToken,
    userId: user.id,
    expiresAt,
    ipAddress: opts.ipAddress || null,
    userAgent: opts.userAgent || null,
  });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: `${opts.loginMethod}_login`,
    entityType: "user",
    entityId: user.id,
  });

  return {
    user,
    sessionToken,
    needsMemberClaim,
  };
}
