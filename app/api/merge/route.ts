import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  // data:[<mediatype>][;base64],<data>
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1] || "image/png", data: match[2] };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      images?: string[]; // data URLs
      prompt?: string;
    };

    const imgs = body.images?.filter(Boolean) ?? [];
    if (imgs.length < 2) {
      return NextResponse.json(
        { error: "MERGE requires at least two images" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json(
        { error: "API key not configured. Please add GOOGLE_API_KEY to .env.local file. Get your key from: https://aistudio.google.com/app/apikey" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build parts array: first the text prompt, then image inlineData parts
    // Use provided prompt or generate a default one
    const prompt = body.prompt || 
      `You are provided with ${imgs.length} images. Each image may contain one or more people.
      
      Your task: Create a single new photorealistic image that combines ALL people from ALL ${imgs.length} provided images into one cohesive group photo.
      
      Requirements:
      - Include EVERY person from EVERY input image (if an image has multiple people, include all of them)
      - Combine all people into a single scene where they appear together
      - Arrange them naturally (standing side by side, in rows, or in a natural group formation)
      - Ensure all people are clearly visible and recognizable
      - Match the lighting, shadows, and proportions to look realistic
      - Preserve each person's original appearance, clothing, and characteristics
      - The final composition should look like a genuine group photograph
      
      Output: One photorealistic image containing ALL people from ALL input images combined together.`;

    const parts: any[] = [{ text: prompt }];
    for (const url of imgs) {
      const parsed = parseDataUrl(url);
      if (!parsed) continue;
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: parts,
    });

    const outParts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    const texts: string[] = [];
    for (const p of outParts) {
      if (p?.inlineData?.data) {
        images.push(`data:image/png;base64,${p.inlineData.data}`);
      } else if (p?.text) {
        texts.push(p.text);
      }
    }

    if (!images.length) {
      return NextResponse.json(
        { error: "Model returned no image", text: texts.join("\n") },
        { status: 500 }
      );
    }

    return NextResponse.json({ images, text: texts.join("\n") });
  } catch (err) {
    console.error("/api/merge error", err);
    return NextResponse.json({ error: "Failed to merge" }, { status: 500 });
  }
}

