/**
 * API ROUTE: /api/improve-prompt
 * 
 * Uses Gemini 2.5 Flash to improve user prompts for better AI image generation.
 * Takes a basic prompt and enhances it with more detailed, descriptive language
 * that will produce better results from image generation models.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      type?: string; // 'background', 'edit', etc.
    };

    if (!body.prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Check if user is logged in with HF Pro
    let isHfProUser = false;
    try {
      const cookieStore = await cookies();
      const hfToken = cookieStore.get('hf_token');
      isHfProUser = !!hfToken?.value;
    } catch (error) {
      console.error('Error reading HF token from cookies:', error);
    }

    // Get API key
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_actual_api_key_here') {
      return NextResponse.json(
        { error: `API key not configured. Please ${isHfProUser ? 'contact support' : 'login with HF Pro'}.` },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Create context-specific improvement prompts
    const contextPrompts = {
      background: `You are an expert at writing prompts for AI image generation. Take the following simple background description and transform it into a detailed, vivid prompt that will generate stunning, realistic backgrounds.

Focus on:
- Visual details (lighting, colors, textures, atmosphere)
- Composition and depth
- Realistic environmental elements
- Photography/cinematic quality terms
- Maintaining the character while enhancing the background

Keep the character image and background realistic. Make the description rich and specific but not overly complex.

Original prompt: "${body.prompt}"

Write a short and concise improved background generation prompt and do not include anything unnecessary:`,

      edit: `You are an expert at writing prompts for AI image editing. Take the following simple editing request and transform it into a clear, detailed prompt that will produce precise, high-quality image modifications.
Original prompt: "${body.prompt}" Return a short and concise improved editing prompt and do not include anything unnecessary:`,

      default: `You are an expert at writing prompts for AI image generation and editing. Take the following simple prompt and transform it into a detailed, effective prompt that will produce better results.

Focus on:
- Clear, specific instructions
- Visual details and quality descriptors
- Professional terminology
- Realistic and natural-looking results

Original prompt: "${body.prompt}"

Write an improved prompt:`
    };

    const improvementPrompt = contextPrompts[body.type as keyof typeof contextPrompts] || contextPrompts.default;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: improvementPrompt }] }],
    });

    const improvedPrompt = response?.text?.trim();

    if (!improvedPrompt) {
      return NextResponse.json(
        { error: "Failed to generate improved prompt" },
        { status: 500 }
      );
    }

    return NextResponse.json({ improvedPrompt });

  } catch (error: any) {
    console.error('[API] improve-prompt error:', error);
    
    return NextResponse.json(
      { error: "Failed to improve prompt. Please try again." },
      { status: 500 }
    );
  }
}