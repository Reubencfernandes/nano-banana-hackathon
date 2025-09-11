import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

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
      
      return NextResponse.json({ 
        isLoggedIn: !!hfToken?.value,
        hasToken: !!hfToken?.value 
      });
    } catch (error) {
      console.error('Error checking HF token:', error);
      return NextResponse.json({ isLoggedIn: false, hasToken: false });
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
    
    // Store the token in a secure HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set({
      name: 'hf_token',
      value: hf_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
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
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting HF token:', error);
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}