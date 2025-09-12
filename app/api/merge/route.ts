/**
 * API ROUTE: /api/merge (DEPRECATED - functionality moved to /api/process)
 * 
 * Legacy endpoint for merging multiple character images into cohesive group photos.
 * This functionality is now handled by the main /api/process endpoint with type="MERGE".
 * Kept for backwards compatibility.
 * 
 * Input: JSON with array of image URLs/data and optional custom prompt
 * Output: JSON with merged group photo as base64 data URL
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Configure Next.js runtime for Node.js (required for Google AI SDK)
export const runtime = "nodejs";

/**
 * Parse base64 data URL into MIME type and data components
 * Handles data URLs in the format: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA...
 * 
 * @param dataUrl Complete data URL string
 * @returns Object with mimeType and data, or null if invalid format
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);  // Extract MIME type and base64 data
  if (!match) return null;  // Invalid data URL format
  return { 
    mimeType: match[1] || "image/png",  // Use extracted MIME type or default to PNG
    data: match[2]                      // Base64 encoded image data
  };
}

/**
 * Convert various image URL formats to inline data format required by Gemini AI
 * 
 * Supports:
 * - Data URLs (data:image/png;base64,...)
 * - HTTP/HTTPS URLs (fetches and converts to base64)
 * 
 * @param url Image URL in any supported format
 * @returns Promise resolving to inline data object or null on failure
 */
async function toInlineData(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    // Handle data URLs directly
    if (url.startsWith('data:')) {
      return parseDataUrl(url);
    }
    
    // Handle HTTP URLs by fetching and converting to base64
    if (url.startsWith('http')) {
      const res = await fetch(url);                                    // Fetch image from URL
      const buf = await res.arrayBuffer();                             // Get binary data
      const base64 = Buffer.from(buf).toString('base64');              // Convert to base64
      const mimeType = res.headers.get('content-type') || 'image/jpeg'; // Get MIME type from headers
      return { mimeType, data: base64 };
    }
    
    return null;  // Unsupported URL format
  } catch (e) {
    console.error('Failed to process image URL:', url.substring(0, 100), e);
    return null;  // Return null on any processing error
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
    
    const parts: any[] = [{ text: prompt }];
    for (const url of imgs) {
      const parsed = await toInlineData(url);
      if (!parsed) {
        console.error('[MERGE API] Failed to parse image:', url.substring(0, 100));
        continue;
      }
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

