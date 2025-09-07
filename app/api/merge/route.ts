import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  // data:[<mediatype>][;base64],<data>
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1] || "image/png", data: match[2] };
}

async function toInlineData(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    if (url.startsWith('data:')) {
      return parseDataUrl(url);
    }
    if (url.startsWith('http')) {
      // Fetch HTTP URL and convert to base64
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      const mimeType = res.headers.get('content-type') || 'image/jpeg';
      return { mimeType, data: base64 };
    }
    return null;
  } catch (e) {
    console.error('Failed to process image URL:', url.substring(0, 100), e);
    return null;
  }
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
    // If no custom prompt, use default extraction-focused prompt
    let prompt = body.prompt;
    
    if (!prompt) {
      prompt = `MERGE TASK: You are provided with exactly ${imgs.length} source images.

INSTRUCTIONS:
1. EXTRACT the exact people/subjects from EACH provided image  
2. DO NOT generate new people - use ONLY the people visible in the provided images
3. COMBINE all extracted people into ONE single group photo
4. The output must contain ALL people from ALL ${imgs.length} input images together

Requirements:
- Use the ACTUAL people from the provided images (do not create new ones)
- If an image has multiple people, include ALL of them  
- Arrange everyone naturally in the same scene
- Match lighting and proportions realistically
- Output exactly ONE image with everyone combined

DO NOT create artistic interpretations or new people. EXTRACT and COMBINE the actual subjects from the provided photographs.`;
    } else {
      // Even with custom prompt, append extraction requirements
      const enforcement = `\n\nIMPORTANT: Extract and use the EXACT people from the provided images. Do not generate new people or artistic interpretations. Combine the actual subjects from all ${imgs.length} images into one output.`;
      prompt = `${prompt}${enforcement}`;
    }

    // Debug: Log what we're receiving
    console.log(`[MERGE API] Received ${imgs.length} images to merge`);
    console.log(`[MERGE API] Image types:`, imgs.map(img => {
      if (img.startsWith('data:')) return 'data URL';
      if (img.startsWith('http')) return 'HTTP URL';
      return 'unknown';
    }));
    
    const parts: any[] = [{ text: prompt }];
    for (const url of imgs) {
      const parsed = await toInlineData(url);
      if (!parsed) {
        console.error('[MERGE API] Failed to parse image:', url.substring(0, 100));
        continue;
      }
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }
    
    console.log(`[MERGE API] Sending ${parts.length - 1} images to model (prompt + images)`);
    console.log(`[MERGE API] Prompt preview:`, prompt.substring(0, 200));

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

