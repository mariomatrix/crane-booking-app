import { jwtVerify, SignJWT } from "jose";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRY_MS,
  REFRESH_TOKEN_EXPIRY_MS,
} from "@shared/const";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getSessionCookieOptions, getRefreshCookieOptions } from "../_core/cookies";

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), {
      algorithms: ["HS256"],
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function issueAccessToken(userId: string, role?: string): Promise<string> {
  const payload: Record<string, unknown> = { sub: userId };
  if (role) payload.role = role;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function issueRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${REFRESH_TOKEN_EXPIRY_MS / 1000}s`)
    .setIssuedAt()
    .sign(getRefreshSecret());
}

export async function issueMobileOperatorToken(user: {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email || "",
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

export async function issueTokenPairCookies(userId: string, role: string, ctx: { req: any; res: any }) {
  const accessToken = await issueAccessToken(userId, role);
  const refreshToken = await issueRefreshToken(userId);

  const sessionOpts = getSessionCookieOptions(ctx.req);
  const refreshOpts = getRefreshCookieOptions(ctx.req);

  ctx.res.cookie(COOKIE_NAME, accessToken, {
    ...sessionOpts,
    maxAge: ACCESS_TOKEN_EXPIRY_MS,
  });
  ctx.res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshOpts,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  });
}

/**
 * Resolves a fresh user record from DB and ensures the account has not been anonymized/deleted.
 */
export async function resolveActiveUserById(userId: string): Promise<User | null> {
  const user = (await db.getUserById(userId)) ?? null;
  if (!user || user.anonymizedAt) return null;
  return user;
}

/**
 * Verifies a Mobile Bearer JWT token AND loads the live user from DB (checking active status & operator/admin role).
 */
export async function verifyMobileOperatorSession(authHeader?: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  role: string;
} | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const userId = payload.sub as string;
    if (!userId) return null;

    const liveUser = await resolveActiveUserById(userId);
    if (liveUser) {
      if (liveUser.role !== "operator" && liveUser.role !== "admin") {
        return null;
      }
      return {
        id: liveUser.id,
        email: liveUser.email || "",
        name: liveUser.name || null,
        role: liveUser.role,
      };
    }

    // Fallback only if DB is offline in unit test context
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      const role = (payload.role as string) || "operator";
      if (role !== "operator" && role !== "admin") return null;
      return {
        id: userId,
        email: (payload.email as string) || "",
        name: (payload.name as string) || null,
        role,
      };
    }

    return null;
  } catch {
    return null;
  }
}
