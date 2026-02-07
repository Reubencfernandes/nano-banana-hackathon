/**
 * API ROUTE: /api/usage
 * 
 * This endpoint is deprecated - free tier has been discontinued.
 * Users must now provide their own Google Gemini API key.
 * 
 * Kept for backwards compatibility - returns a message indicating
 * that free tier is no longer available.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/usage
 * 
 * Returns information about the discontinued free tier
 */
export async function GET(req: NextRequest) {
    return NextResponse.json({
        message: "Free tier has been discontinued due to high costs. Please use your own Google Gemini API key.",
        freeTierAvailable: false
    });
}
