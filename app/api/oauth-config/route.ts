import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * API endpoint to get OAuth configuration at runtime
 */
export async function GET(req: NextRequest) {
    const clientId = process.env.OAUTH_CLIENT_ID;
    const scopes = 'email inference-api';

    // Determine redirect URL based on environment
    const spaceHost = process.env.SPACE_HOST;
    let redirectUrl: string;

    if (spaceHost) {
        // Production: use HF Space URL
        redirectUrl = `https://${spaceHost}/api/auth/callback`;
    } else {
        // Local dev: use request host
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        redirectUrl = `${protocol}://${host}/api/auth/callback`;
    }

    // Generate OAuth state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // Build the complete OAuth login URL
    let loginUrl: string | null = null;
    if (clientId) {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUrl,
            scope: scopes,
            response_type: 'code',
            state: state,
        });
        loginUrl = `https://huggingface.co/oauth/authorize?${params.toString()}`;
    }

    console.log('OAuth Config:', {
        OAUTH_CLIENT_ID: clientId ? 'present' : 'missing',
        redirectUrl,
        SPACE_HOST: spaceHost || 'not set (local dev)',
    });

    return NextResponse.json({
        clientId: clientId || null,
        isConfigured: !!clientId,
        redirectUrl,
        loginUrl,
        state,
    });
}
