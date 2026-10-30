import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { fromNodeHeaders } from "better-auth/node";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRY_MS,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./cookies";
import { getAuth } from "./betterAuth";
import {
  getJwtSecret,
  getRefreshSecret,
  verifyAccessToken,
  verifyRefreshToken,
  issueAccessToken,
  resolveActiveUserById,
} from "../services/authPolicyService";

export { getJwtSecret, getRefreshSecret };

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

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
          user = await resolveActiveUserById(userId);
        }
      }

      // 2. If access token failed/expired, try silent refresh
      if (!user && refreshToken) {
        const userId = await verifyRefreshToken(refreshToken);
        if (userId) {
          user = await resolveActiveUserById(userId);
          if (user) {
            const newAccessToken = await issueAccessToken(user.id, user.role);
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
            user = await resolveActiveUserById(baSession.user.id);
            if (user) {
              // Bridge Better Auth session to JWT cookie for fast path & legacy endpoints
              const newAccessToken = await issueAccessToken(user.id, user.role);
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
