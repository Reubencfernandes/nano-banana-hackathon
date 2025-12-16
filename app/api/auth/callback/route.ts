import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Determine the correct URL based on environment
function getSpaceUrl(req: NextRequest): string {
  // Check for HF Space environment
  const spaceHost = process.env.SPACE_HOST;
  if (spaceHost) {
    return `https://${spaceHost}`;
  }

  // For local development, use the request origin
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const SPACE_URL = getSpaceUrl(req);
  const REDIRECT_URI = `${SPACE_URL}/api/auth/callback`;

  console.log('Auth callback - SPACE_URL:', SPACE_URL, 'has code:', !!code);

  if (code) {
    // Exchange authorization code for access token
    try {
      const clientId = process.env.OAUTH_CLIENT_ID;
      const clientSecret = process.env.OAUTH_CLIENT_SECRET;

      console.log('OAuth credentials:', {
        clientId: clientId ? 'present' : 'MISSING',
        clientSecret: clientSecret ? 'present' : 'MISSING'
      });

      if (!clientId || !clientSecret) {
        console.error('OAuth credentials not configured');
        return NextResponse.redirect(`${SPACE_URL}/?error=oauth_not_configured`);
      }

      // Exchange code for token
      console.log('Exchanging code for token with redirect_uri:', REDIRECT_URI);
      const tokenResponse = await fetch('https://huggingface.co/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        return NextResponse.redirect(`${SPACE_URL}/?error=token_exchange_failed`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      console.log('Token exchange successful, got access token');

      // Get user info
      const userResponse = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      let userInfo = null;
      if (userResponse.ok) {
        userInfo = await userResponse.json();
        console.log('Got user info:', { name: userInfo?.name, username: userInfo?.name });
      } else {
        console.error('Failed to get user info:', await userResponse.text());
      }

      // Create redirect response and set cookies ON THE RESPONSE
      // This is critical - cookies().set() doesn't work with redirects!
      const response = NextResponse.redirect(`${SPACE_URL}/`);

      // Set token cookie (HTTP-only for security)
      response.cookies.set('hf_token', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      // Set user info cookie (readable by client for UI)
      if (userInfo) {
        response.cookies.set('hf_user', JSON.stringify({
          name: userInfo.name || userInfo.fullname,
          username: userInfo.name,
          avatarUrl: userInfo.avatarUrl,
        }), {
          httpOnly: false,
          secure: true,
          sameSite: 'none',
          maxAge: 60 * 60 * 24 * 30,
          path: '/',
        });
      }

      console.log('OAuth successful, cookies set (SameSite=None), redirecting to:', SPACE_URL);
      return response;

    } catch (error) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(`${SPACE_URL}/?error=oauth_failed`);
    }
  } else {
    // This is a status check request
    try {
      const cookieStore = await cookies();
      const hfToken = cookieStore.get('hf_token');
      const hfUser = cookieStore.get('hf_user');

      // Debug cookies availability
      const allCookieNames = cookieStore.getAll().map(c => c.name);
      console.log('Auth check - All cookies:', allCookieNames);

      let user = null;
      if (hfUser?.value) {
        try {
          user = JSON.parse(hfUser.value);
        } catch { }
      }

      console.log('Auth status check:', {
        isLoggedIn: !!hfToken?.value,
        hasUser: !!user,
        tokenLength: hfToken?.value?.length
      });

      return NextResponse.json({
        isLoggedIn: !!hfToken?.value,
        hasToken: !!hfToken?.value,
        user,
      });
    } catch (error) {
      console.error('Error checking HF token:', error);
      return NextResponse.json({ isLoggedIn: false, hasToken: false, user: null });
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hf_token } = await req.json();

    if (!hf_token || typeof hf_token !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing HF token" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set({
      name: 'hf_token',
      value: hf_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing HF token:', error);
    return NextResponse.json(
      { error: "Failed to store token" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('hf_token');
    cookieStore.delete('hf_user');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting HF token:', error);
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}