/**
 * API ROUTE: /api/usage
 * 
 * Endpoints for checking and managing API usage quotas.
 * 
 * GET: Returns current usage for the requesting IP
 * POST: Records a request (internal use by process route)
 */

import { NextRequest, NextResponse } from "next/server";
import { getUsage, canMakeRequest, getDailyLimit } from "@/lib/usage-store";

export const runtime = "nodejs";

/**
 * Get client IP from request headers
 * Handles various proxy scenarios (Vercel, Cloudflare, etc.)
 */
function getClientIP(req: NextRequest): string {
    // Try various headers that might contain the real IP
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, the first one is the client
        return forwardedFor.split(',')[0].trim();
    }

    const realIP = req.headers.get('x-real-ip');
    if (realIP) {
        return realIP;
    }

    // Vercel-specific header
    const vercelForwardedFor = req.headers.get('x-vercel-forwarded-for');
    if (vercelForwardedFor) {
        return vercelForwardedFor.split(',')[0].trim();
    }

    // Cloudflare header
    const cfConnectingIP = req.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
        return cfConnectingIP;
    }

    // Fallback - this might not be accurate behind proxies
    return 'unknown';
}

/**
 * GET /api/usage
 * 
 * Returns the current usage statistics for the requesting IP
 */
export async function GET(req: NextRequest) {
    const ip = getClientIP(req);
    const usage = await getUsage(ip);

    return NextResponse.json({
        ip: ip.substring(0, 8) + '***', // Partial IP for privacy
        used: usage.used,
        remaining: usage.remaining,
        limit: usage.limit,
        resetDate: usage.resetDate,
        message: usage.remaining > 0
            ? `You have ${usage.remaining} free requests remaining today.`
            : `Daily limit reached. Add your own API key to continue or wait until tomorrow.`
    });
}
