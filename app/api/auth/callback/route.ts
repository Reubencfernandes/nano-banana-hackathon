import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface UserInfo {
  name?: string;
  picture?: string;
  username?: string;
  preferred_username?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (code) {
    // This is an OAuth redirect, redirect to main page for client-side handling
    return NextResponse.redirect(new URL('/', req.url));
  } else {
    // This is a status check request
    try {
      const cookieStore = await cookies();
      const hfToken = cookieStore.get('hf_token');
      const hfUserInfo = cookieStore.get('hf_user_info');

      let userInfo = null;
      if (hfUserInfo?.value) {
        try {
          userInfo = JSON.parse(hfUserInfo.value);
        } catch (e) {
          console.error("Failed to parse user info cookie", e);
        }
      }

      return NextResponse.json({
        isLoggedIn: !!hfToken?.value,
        hasToken: !!hfToken?.value,
        userInfo
      });
    } catch (error) {
      console.error('Error checking HF token:', error);
      return NextResponse.json({ isLoggedIn: false, hasToken: false });
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hf_token, user_info } = await req.json();

    if (!hf_token || typeof hf_token !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing HF token" },
        { status: 400 }
      );
    }

    // Store the token and user info in secure HTTP-only cookies
    const cookieStore = await cookies();

    cookieStore.set({
      name: 'hf_token',
      value: hf_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    if (user_info) {
      cookieStore.set({
        name: 'hf_user_info',
        value: JSON.stringify({
          name: user_info.name,
          picture: user_info.picture,
          username: user_info.preferred_username || user_info.username
        }),
        httpOnly: true, // We could make this false to read from client, but API route access is safer
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
    }

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
    cookieStore.delete('hf_user_info');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting HF token:', error);
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}