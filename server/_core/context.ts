import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { jwtVerify, SignJWT } from "jose";
import { fromNodeHeaders } from "better-auth/node";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRY_MS,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { getAuth } from "./betterAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret)
    throw new Error("JWT_REFRESH_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

/**
 * Try to verify an access token and return the user ID.
 * Returns null if the token is invalid or expired.
 */
async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Try to verify a refresh token and return the user ID.
 * Returns null if the token is invalid or expired.
 */
async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), {
      algorithms: ["HS256"],
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Issue a new short-lived access token for the given user ID.
 */
async function issueAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookieHeader = opts.req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      const accessToken = cookies[COOKIE_NAME];
      const refreshToken = cookies[REFRESH_COOKIE_NAME];

      // 1. Try access token first (fast path)
      if (accessToken) {
        const userId = await verifyAccessToken(accessToken);
        if (userId) {
          user = (await db.getUserById(userId)) ?? null;
        }
      }

      // 2. If access token failed/expired, try silent refresh
      if (!user && refreshToken) {
        const userId = await verifyRefreshToken(refreshToken);
        if (userId) {
          user = (await db.getUserById(userId)) ?? null;
          if (user) {
            const newAccessToken = await issueAccessToken(user.id);
            const cookieOptions = getSessionCookieOptions(opts.req);
            opts.res.cookie(COOKIE_NAME, newAccessToken, {
              ...cookieOptions,
              maxAge: ACCESS_TOKEN_EXPIRY_MS,
            });
          }
        }
      }

      // 3. Check Better Auth session (OAuth / Email OTP / Magic Link sessions stored in auth_sessions)
      if (!user) {
        try {
          const auth = getAuth();
          const baSession = await auth.api.getSession({
            headers: fromNodeHeaders(opts.req.headers),
          });
          if (baSession?.user?.id) {
            user = (await db.getUserById(baSession.user.id)) ?? null;
            if (user) {
              // Bridge Better Auth session to JWT cookie for fast path & legacy endpoints
              const newAccessToken = await issueAccessToken(user.id);
              const cookieOptions = getSessionCookieOptions(opts.req);
              opts.res.cookie(COOKIE_NAME, newAccessToken, {
                ...cookieOptions,
                maxAge: ACCESS_TOKEN_EXPIRY_MS,
              });
            }
          }
        } catch {
          // Ignore Better Auth lookup error if DB is unavailable in unit tests
        }
      }
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
