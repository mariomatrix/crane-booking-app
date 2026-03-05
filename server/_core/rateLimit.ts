import type { Request, Response, NextFunction } from "express";

/**
 * In-memory sliding-window rate limiter.
 * No external dependencies — suitable for single-instance deployments.
 *
 * For multi-instance (clustered) deployments, replace with Redis-based limiter.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getClientKey(req: Request): string {
    // Use X-Forwarded-For (first IP) for proxied environments (Render, etc.)
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
}

function cleanup(store: Map<string, RateLimitEntry>, windowMs: number) {
    const now = Date.now();
    const keys = Array.from(store.keys());
    for (const key of keys) {
        const entry = store.get(key);
        if (!entry) continue;
        entry.timestamps = entry.timestamps.filter((t: number) => now - t < windowMs);
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}

export function createRateLimiter(options: {
    /** Max requests per window */
    maxRequests: number;
    /** Window size in milliseconds */
    windowMs: number;
    /** Name for this limiter (used to separate stores) */
    name?: string;
    /** Custom message on 429 */
    message?: string;
}) {
    const { maxRequests, windowMs, name = "default", message } = options;

    if (!stores.has(name)) {
        stores.set(name, new Map());
    }
    const store = stores.get(name)!;

    // Periodic cleanup every 60 seconds
    const cleanupInterval = setInterval(() => cleanup(store, windowMs), 60_000);
    cleanupInterval.unref(); // Don't prevent process exit

    return (req: Request, res: Response, next: NextFunction) => {
        const key = getClientKey(req);
        const now = Date.now();

        let entry = store.get(key);
        if (!entry) {
            entry = { timestamps: [] };
            store.set(key, entry);
        }

        // Remove expired timestamps
        entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

        if (entry.timestamps.length >= maxRequests) {
            const retryAfterMs = entry.timestamps[0] + windowMs - now;
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);

            res.set("Retry-After", String(retryAfterSec));
            res.status(429).json({
                error: "TOO_MANY_REQUESTS",
                message: message || `Previše zahtjeva. Pokušajte ponovo za ${retryAfterSec} sekundi.`,
                retryAfterSeconds: retryAfterSec,
            });
            return;
        }

        entry.timestamps.push(now);
        next();
    };
}
