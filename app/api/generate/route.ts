import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs"; // Ensure Node runtime for SDK

export async function POST(req: NextRequest) {
  try {
    const { prompt, apiToken } = (await req.json()) as { prompt?: string; apiToken?: string };
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    // Use user-provided API token or fall back to environment variable
    const apiKey = apiToken || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json(
        { error: "API key not provided. Please enter your Hugging Face API token in the top right corner or add GOOGLE_API_KEY to .env.local file. Get your key from: https://aistudio.google.com/app/apikey" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });

    const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    const texts: string[] = [];

    for (const part of parts) {
      if (part?.inlineData?.data) {
        images.push(`data:image/png;base64,${part.inlineData.data}`);
      } else if (part?.text) {
        texts.push(part.text as string);
      }
    }

    return NextResponse.json({ images, text: texts.join("\n") });
  } catch (err) {
    console.error("/api/generate error", err);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

