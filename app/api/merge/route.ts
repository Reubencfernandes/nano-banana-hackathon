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
      apiToken?: string;
    };

    const imgs = body.images?.filter(Boolean) ?? [];
    if (imgs.length < 2) {
      return NextResponse.json(
        { error: "MERGE requires at least two images" },
        { status: 400 }
      );
    }

    // Use user-provided API token or fall back to environment variable
    const apiKey = body.apiToken || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json(
        { error: "API key not provided. Please enter your Hugging Face API token in the top right corner or add GOOGLE_API_KEY to .env.local file. Get your key from: https://aistudio.google.com/app/apikey" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build parts array: first the text prompt, then image inlineData parts
    // If no custom prompt, use default extraction-focused prompt
    let prompt = body.prompt;
    
    if (!prompt) {
      prompt = `MERGE TASK: Create a natural, cohesive group photo combining ALL subjects from ${imgs.length} provided images.

CRITICAL REQUIREMENTS:
1. Extract ALL people/subjects from EACH image exactly as they appear
2. Place them together in a SINGLE UNIFIED SCENE with:
   - Consistent lighting direction and color temperature
   - Matching shadows and ambient lighting  
   - Proper scale relationships (realistic relative sizes)
   - Natural spacing as if they were photographed together
   - Shared environment/background that looks cohesive

3. Composition guidelines:
   - Arrange subjects at similar depth (not one far behind another)
   - Use natural group photo positioning (slight overlap is ok)
   - Ensure all faces are clearly visible
   - Create visual balance in the composition
   - Apply consistent color grading across all subjects

4. Environmental unity:
   - Use a single, coherent background for all subjects
   - Match the perspective as if taken with one camera
   - Ensure ground plane continuity (all standing on same level)
   - Apply consistent atmospheric effects (if any)

The result should look like all subjects were photographed together in the same place at the same time, NOT like separate images placed side by side.`;
    } else {
      // Even with custom prompt, append cohesion requirements
      const enforcement = `\n\nIMPORTANT: Create a COHESIVE group photo where all subjects appear to be in the same scene with consistent lighting, scale, and environment. The result should look naturally photographed together, not composited.`;
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

