import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions, getRefreshCookieOptions } from "./cookies";
import { getJwtSecret, getRefreshSecret } from "./context";
import { SignJWT } from "jose";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_EXPIRY_MS,
} from "@shared/const";
import axios from "axios";

/**
 * Native Google OAuth 2.0 implementation.
 * Replaces the generic SDK-based OAuth with direct Google API calls.
 *
 * Flow:
 * 1. GET /auth/google → redirect to Google consent screen
 * 2. GET /auth/google/callback → exchange code, get user info, upsert, set cookies
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback",
  };
}

async function issueTokenPair(userId: string, role: string, req: Request, res: Response) {
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

  res.cookie(COOKIE_NAME, accessToken, { ...sessionOpts, maxAge: ACCESS_TOKEN_EXPIRY_MS });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...refreshOpts, maxAge: REFRESH_TOKEN_EXPIRY_MS });
}

export function registerOAuthRoutes(app: Express) {
  // ─── Step 1: Redirect to Google consent screen ────────────────────────
  app.get("/auth/google", (req: Request, res: Response) => {
    const { clientId, callbackUrl } = getGoogleConfig();

    if (!clientId) {
      res.status(500).json({ error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID in .env." });
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  // ─── Step 2: Handle Google callback ───────────────────────────────────
  app.get("/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const error = req.query.error as string | undefined;

    if (error || !code) {
      console.warn("[Google OAuth] Error or no code:", error);
      res.redirect("/?error=google_auth_failed");
      return;
    }

    try {
      const { clientId, clientSecret, callbackUrl } = getGoogleConfig();

      // Exchange auth code for tokens
      const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      });

      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userInfoResponse = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const { id: googleId, email, name, given_name, family_name } = userInfoResponse.data;

      if (!googleId || !email) {
        res.redirect("/?error=google_missing_info");
        return;
      }

      // Upsert user: find by googleId, or by email (link accounts)
      let user = await db.getUserByGoogleId(googleId);

      if (!user) {
        // Check if user exists by email (they registered with email/password before)
        user = await db.getUserByEmail(email);

        if (user) {
          // Link their Google ID to existing account
          await db.updateUser(user.id, {
            googleId,
            loginMethod: "google",
            emailVerifiedAt: user.emailVerifiedAt || new Date(), // Google email is verified
          });
          user = await db.getUserById(user.id) ?? undefined;
        } else {
          // Create new user
          const userId = await db.createLocalUser({
            email,
            passwordHash: "", // No password for OAuth users
            firstName: given_name || name?.split(" ")[0] || "",
            lastName: family_name || name?.split(" ").slice(1).join(" ") || "",
          });
          if (userId) {
            await db.updateUser(userId, {
              googleId,
              loginMethod: "google",
              emailVerifiedAt: new Date(), // Google email is already verified
              userStatus: "active",
            });
            user = await db.getUserById(userId) ?? undefined;
          }
        }
      } else {
        // Update last signed in
        await db.updateUser(user.id, {
          lastSignedIn: new Date(),
          loginMethod: "google",
        });
      }

      if (!user) {
        res.redirect("/?error=google_user_creation_failed");
        return;
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

      // Redirect to home page
      res.redirect(302, "/");
    } catch (err) {
      console.error("[Google OAuth] Callback failed:", err);
      res.redirect("/?error=google_auth_failed");
    }
  });
}
