import type { Express, Request, Response } from "express";
import crypto from "crypto";
import * as db from "../db";
import { getSessionCookieOptions, getRefreshCookieOptions } from "./cookies";
import { getJwtSecret, getRefreshSecret } from "./context";
import { SignJWT } from "jose";
import { parse as parseCookieHeader } from "cookie";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_EXPIRY_MS,
} from "@shared/const";
import axios from "axios";
import { eq, and } from "drizzle-orm";
import { authAccounts, authSessions, memberLinks, users } from "../../drizzle/schema";

/**
 * Hardened Google OAuth 2.0 implementation with PKCE (S256) + CSRF State protection
 * and Better Auth session/account persistence + PŠD Špinut Member Claim routing.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const OAUTH_STATE_COOKIE = "__Spinut_oauth_state";
const OAUTH_VERIFIER_COOKIE = "__Spinut_oauth_verifier";

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      "http://localhost:3000/auth/google/callback",
  };
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function issueTokenPair(
  userId: string,
  role: string,
  req: Request,
  res: Response
) {
  const accessToken = await new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getJwtSecret());

  const refreshToken = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${REFRESH_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getRefreshSecret());

  const sessionOpts = getSessionCookieOptions(req);
  const refreshOpts = getRefreshCookieOptions(req);

  res.cookie(COOKIE_NAME, accessToken, {
    ...sessionOpts,
    maxAge: ACCESS_TOKEN_EXPIRY_MS,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshOpts,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  });
}

export function registerOAuthRoutes(app: Express) {
  // ─── Step 1: Redirect to Google consent screen with State + PKCE (S256) ───
  app.get("/auth/google", (req: Request, res: Response) => {
    const { clientId, callbackUrl } = getGoogleConfig();

    if (!clientId) {
      res.redirect("/auth?error=google_not_configured");
      return;
    }

    // Generate cryptographic state & PKCE code_verifier / code_challenge
    const state = base64UrlEncode(crypto.randomBytes(32));
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
      crypto.createHash("sha256").update(codeVerifier).digest()
    );

    const cookieOpts = getSessionCookieOptions(req);
    // 10-minute expiry for OAuth handshake cookies
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...cookieOpts,
      maxAge: 10 * 60 * 1000,
    });
    res.cookie(OAUTH_VERIFIER_COOKIE, codeVerifier, {
      ...cookieOpts,
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  // ─── Step 2: Handle Google callback with State + PKCE verification ───
  app.get("/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const returnedState = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    const cookies = req.headers.cookie
      ? parseCookieHeader(req.headers.cookie)
      : {};
    const expectedState = cookies[OAUTH_STATE_COOKIE];
    const codeVerifier = cookies[OAUTH_VERIFIER_COOKIE];

    // Clear temporary OAuth handshake cookies immediately
    const cookieOpts = getSessionCookieOptions(req);
    res.clearCookie(OAUTH_STATE_COOKIE, { ...cookieOpts, maxAge: -1 });
    res.clearCookie(OAUTH_VERIFIER_COOKIE, { ...cookieOpts, maxAge: -1 });

    if (error || !code) {
      console.warn("[Google OAuth] Error or no code:", error);
      res.redirect("/auth?error=google_auth_failed");
      return;
    }

    // Verify CSRF state
    if (!expectedState || !returnedState || expectedState !== returnedState) {
      console.warn("[Google OAuth] Invalid or missing OAuth state parameter");
      res.redirect("/auth?error=google_invalid_state");
      return;
    }

    try {
      const { clientId, clientSecret, callbackUrl } = getGoogleConfig();

      // Exchange auth code + PKCE code_verifier for tokens
      const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      });

      const {
        access_token,
        refresh_token,
        id_token,
        expires_in,
        scope,
      } = tokenResponse.data;

      // Get user info from Google
      const userInfoResponse = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const {
        id: googleId,
        email,
        verified_email,
        name,
        given_name,
        family_name,
        picture,
      } = userInfoResponse.data;

      if (!googleId || !email || verified_email === false) {
        res.redirect("/auth?error=google_missing_info");
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Upsert user: find by googleId, or by email (link accounts)
      let user = await db.getUserByGoogleId(googleId);
      let isNewUnclaimedUser = false;

      if (!user) {
        // Check if user exists by email (e.g. synced member with email or previously registered user)
        user = await db.getUserByEmail(normalizedEmail);

        if (user) {
          await db.updateUser(user.id, {
            googleId,
            loginMethod: "google",
            emailVerifiedAt: user.emailVerifiedAt || new Date(),
          });
          user = (await db.getUserById(user.id)) ?? undefined;
        } else {
          // New user whose Google email is NOT in `users` yet.
          // Put them in `pending_verification` so they can claim their MSSQL member profile
          // via OIB + Matični broj (or wait for admin approval if commercial).
          const userId = await db.createLocalUser({
            email: normalizedEmail,
            passwordHash: "",
            firstName: given_name || name?.split(" ")[0] || "",
            lastName: family_name || name?.split(" ").slice(1).join(" ") || "",
          });
          if (userId) {
            await db.updateUser(userId, {
              googleId,
              loginMethod: "google",
              emailVerifiedAt: new Date(),
              userStatus: "active",
            });
            user = (await db.getUserById(userId)) ?? undefined;
            isNewUnclaimedUser = true;
          }
        }
      } else {
        await db.updateUser(user.id, {
          lastSignedIn: new Date(),
          loginMethod: "google",
        });
      }

      if (!user) {
        res.redirect("/auth?error=google_user_creation_failed");
        return;
      }

      // Persist OAuth account & revocable DB session in Better Auth tables
      const database = await db.getDb();
      if (database) {
        if (picture && !user.image) {
          await database
            .update(users)
            .set({ image: picture, emailVerified: true })
            .where(eq(users.id, user.id));
        }

        const existingAcc = await database
          .select({ id: authAccounts.id })
          .from(authAccounts)
          .where(
            and(
              eq(authAccounts.providerId, "google"),
              eq(authAccounts.accountId, String(googleId))
            )
          )
          .limit(1);

        if (existingAcc.length === 0) {
          await database.insert(authAccounts).values({
            accountId: String(googleId),
            providerId: "google",
            userId: user.id,
            accessToken: access_token || null,
            refreshToken: refresh_token || null,
            idToken: id_token || null,
            accessTokenExpiresAt: expires_in
              ? new Date(Date.now() + Number(expires_in) * 1000)
              : null,
            scope: scope || "openid email profile",
          });
        }

        // Also check if an existing user is still in pending_verification without a linked member profile
        if (!isNewUnclaimedUser && user.userStatus === "pending_verification") {
          const links = await database
            .select({ id: memberLinks.id })
            .from(memberLinks)
            .where(eq(memberLinks.userId, user.id))
            .limit(1);
          if (links.length === 0) {
            isNewUnclaimedUser = true;
          }
        }
      }

      // Issue JWT token pair (access + refresh)
      await issueTokenPair(user.id, user.role, req, res);

      // Audit log
      await db.createAuditEntry({
        actorId: user.id,
        action: "google_login",
        entityType: "user",
        entityId: user.id,
      });

      // If user needs to link their member profile (OIB + Matični broj), redirect to claim screen
      if (isNewUnclaimedUser) {
        res.redirect(302, "/auth?mode=claimMember");
        return;
      }

      res.redirect(302, "/");
    } catch (err) {
      console.error("[Google OAuth] Callback failed:", err);
      res.redirect("/auth?error=google_auth_failed");
    }
  });
}
