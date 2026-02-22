import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "marina-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookieHeader = opts.req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      const sessionCookie = cookies[COOKIE_NAME];

      if (sessionCookie) {
        // Try email/password JWT first (has 'sub' claim, signed with JWT_SECRET)
        try {
          const { payload } = await jwtVerify(sessionCookie, getJwtSecret(), {
            algorithms: ["HS256"],
          });
          if (payload.sub && !payload.openId) {
            // This is our own JWT from email/password auth
            const userId = payload.sub; // UUID string
            user = (await db.getUserById(userId)) ?? null;
          } else {
            throw new Error("Not our JWT — try OAuth");
          }
        } catch {
          // Fall back to OAuth flow
          user = await sdk.authenticateRequest(opts.req);
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
