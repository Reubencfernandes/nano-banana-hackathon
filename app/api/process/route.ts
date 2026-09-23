/**
 * API ROUTE: /api/process
 * 
 * Main image processing endpoint for the Portrait Editor.
 * Handles all image transformation operations using Google's Gemini AI model.
 *   
 * Supported Operations:
 * - MERGE: Combine multiple character images into a cohesive group photo
 * - COMBINED: Apply multiple transformations in a single API call
 * - Background changes (color, preset, custom, AI-generated)
 * - Clothing modifications using reference images
 * - Artistic style transfers (anime, cyberpunk, van gogh, etc.)
 * - Text-based editing with natural language prompts
 * - Camera effects and photographic settings
 * - Age transformations
 * - Face modifications (expressions, accessories, hair, etc.)
 * 
 * Input: JSON with image data, operation type, and parameters
 * Output: JSON with processed image(s) as base64 data URLs
 */

import { NextRequest, NextResponse } from "next/server";
import { buildEditPrompt } from "@/lib/edit-prompt";
import { GoogleGenAI } from "@google/genai";
import { cookies } from "next/headers";

// Configure Next.js runtime for Node.js (required for Google AI SDK)
export const runtime = "nodejs";

// Set maximum execution time to 60 seconds for complex AI operations
export const maxDuration = 60;

/**
 * Parse base64 data URL into components
 * 
 * Extracts MIME type and base64 data from data URLs like:
 * "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA..."
 * 
 * @param dataUrl The data URL string to parse
 * @returns Object with mimeType and data, or null if invalid
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);  // Regex to capture MIME type and data
  if (!match) return null;                                   // Invalid format
  return {
    mimeType: match[1] || "image/png",  // Default to PNG if no MIME type
    data: match[2]                      // Base64 image data
  };
}

/**
 * Run an OpenAI image generation/edit via the Responses API + image_generation tool.
 * Returns the same { images, texts } shape used by the Gemini code paths so callers
 * don't need to branch on provider when reading results.
 */
async function runOpenAIImageGen(opts: {
  apiKey: string;
  prompt: string;
  imageDataUrls?: string[]; // optional input images as data URLs
}): Promise<{ images: string[]; texts: string[] }> {
  const inputContent: any[] = [{ type: "input_text", text: opts.prompt }];
  for (const url of opts.imageDataUrls || []) {
    if (url) inputContent.push({ type: "input_image", image_url: url });
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      // Per OpenAI vision/images guide: pair a chat-capable model with the
      // image_generation tool. The tool itself uses GPT Image under the hood.
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: inputContent }],
      tools: [{ type: "image_generation" }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${txt}`);
  }

  const json: any = await res.json();
  const output: any[] = json?.output || [];
  const images: string[] = [];
  const texts: string[] = [];

  for (const item of output) {
    if (item?.type === "image_generation_call" && item?.result) {
      images.push(`data:image/png;base64,${item.result}`);
    } else if (item?.type === "message") {
      const parts = item?.content || [];
      for (const p of parts) {
        if (p?.text) texts.push(p.text);
        if (typeof p === "string") texts.push(p);
      }
    }
  }
  return { images, texts };
}

/**
 * Main POST handler for image processing requests
 *
 * Processes incoming image transformation requests through Google's Gemini AI.
 * Handles both single-image operations and multi-image merging.
 *
 * @param req NextJS request object containing JSON body with image data and parameters
 * @returns JSON response with processed image(s) or error message
 */
export async function POST(req: NextRequest) {
  try {
    // Log incoming request size for debugging and monitoring

    // Parse and validate the JSON request body
    let body: any;
    try {
      body = await req.json() as {
        type: string;            // Operation type: "MERGE", "COMBINED", etc.
        image?: string;          // Single image for processing (base64 data URL)
        images?: string[];       // Multiple images for merge operations
        prompt?: string;         // Custom text prompt for AI
        params?: any;            // Node-specific parameters (background, clothes, etc.)
        apiToken?: string;       // User's Google AI API token (Gemini)
        openaiApiToken?: string; // User's OpenAI API token
        model?: string;          // Selected image model id
      };
    } catch (jsonError) {
      console.error('[API] Failed to parse JSON:', jsonError);
      return NextResponse.json(
        { error: "Invalid JSON in request body. This might be due to large image data or special characters." },
        { status: 400 }
      );
    }

    // Check if user is logged in with HF Pro (for premium features)
    let isHfProUser = false;
    try {
      const cookieStore = await cookies();
      const hfToken = cookieStore.get('hf_token');
      isHfProUser = !!hfToken?.value;
    } catch (error) {
      console.error('Error reading HF token from cookies:', error);
    }

    // Resolve which model + provider to use
    const requestedModel = body.model || "gemini-2.5-flash-image";
    const provider: "gemini" | "openai" = requestedModel.startsWith("gpt-") ? "openai" : "gemini";

    // Validate the API key for the selected provider
    if (provider === "gemini" && !body.apiToken) {
      return NextResponse.json(
        { error: "Google API key required. Please enter your Gemini API key in the top right to use this service." },
        { status: 401 }
      );
    }
    if (provider === "openai" && !body.openaiApiToken) {
      return NextResponse.json(
        { error: "OpenAI API key required. Please enter your OpenAI API key in the top right to use GPT image models." },
        { status: 401 }
      );
    }

    // Initialize Google AI client (only used for Gemini provider)
    const ai = provider === "gemini" ? new GoogleGenAI({ apiKey: body.apiToken! }) : null;

    /**
     * Universal image data converter
     * 
     * Converts various image input formats to the inline data format required by Gemini AI.
     * Handles multiple input types for maximum flexibility:
     * 
     * @param url Image source: data URL, HTTP URL, or relative path
     * @returns Promise resolving to {mimeType, data} object or null if conversion fails
     */
    const toInlineDataFromAny = async (url: string): Promise<{ mimeType: string; data: string } | null> => {
      if (!url) return null;  // Handle empty/null input

      try {
        // Case 1: Data URL (data:image/png;base64,...)
        if (url.startsWith('data:')) {
          return parseDataUrl(url);  // Use existing parser for data URLs
        }

        // Case 2: HTTP/HTTPS URL (external image)
        if (url.startsWith('http')) {
          const res = await fetch(url);                                    // Fetch external image
          const buf = await res.arrayBuffer();                             // Get binary data
          const base64 = Buffer.from(buf).toString('base64');              // Convert to base64
          const mimeType = res.headers.get('content-type') || 'image/jpeg'; // Get MIME type from headers
          return { mimeType, data: base64 };
        }

        // Case 3: Relative path (local image on server)
        if (url.startsWith('/')) {
          const host = req.headers.get('host') ?? 'localhost:3000';        // Get current host
          const proto = req.headers.get('x-forwarded-proto') ?? 'http';    // Determine protocol
          const absolute = `${proto}://${host}${url}`;                     // Build absolute URL
          const res = await fetch(absolute);                               // Fetch local image
          const buf = await res.arrayBuffer();                             // Get binary data
          const base64 = Buffer.from(buf).toString('base64');              // Convert to base64
          const mimeType = res.headers.get('content-type') || 'image/png'; // Get MIME type
          return { mimeType, data: base64 };
        }

        return null;  // Unsupported URL format
      } catch {
        return null;  // Handle any conversion errors gracefully
      }
    };

    /* ========================================
       MERGE OPERATION - MULTI-IMAGE PROCESSING
       ======================================== */

    /**
     * Handle MERGE node type separately from single-image operations
     * 
     * MERGE operations combine multiple character images into a single cohesive group photo.
     * This requires special handling because:
     * - Multiple input images need to be processed simultaneously
     * - AI must understand how to naturally blend subjects together
     * - Lighting, perspective, and scale must be consistent across all subjects
     */
    if (body.type === "MERGE") {
      const imgs = body.images?.filter(Boolean) ?? [];  // Remove any null/undefined images

      // Validate minimum input requirement for merge operations
      if (imgs.length < 2) {
        return NextResponse.json(
          { error: "MERGE requires at least two images" },
          { status: 400 }
        );
      }

      // Determine the AI prompt for merge operation
      let mergePrompt = body.prompt;  // Use custom prompt if provided

      if (!mergePrompt) {
        mergePrompt = `MERGE TASK: Create a natural, cohesive group photo combining ALL subjects from ${imgs.length} provided images.

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
        mergePrompt = `${mergePrompt}${enforcement}`;
      }

      const mergeParts: any[] = [{ text: mergePrompt }];
      for (let i = 0; i < imgs.length; i++) {
        const url = imgs[i];

        try {
          const parsed = await toInlineDataFromAny(url);
          if (!parsed) {
            console.error(`[MERGE] Failed to parse image ${i + 1}:`, url.substring(0, 100));
            continue;
          }
          mergeParts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
        } catch (error) {
          console.error(`[MERGE] Error processing image ${i + 1}:`, error);
        }
      }


      let images: string[] = [];
      let texts: string[] = [];

      if (provider === "openai") {
        try {
          const result = await runOpenAIImageGen({
            apiKey: body.openaiApiToken!,
            prompt: mergePrompt,
            imageDataUrls: imgs,
          });
          images = result.images;
          texts = result.texts;
        } catch (e: any) {
          return NextResponse.json(
            { error: e?.message || "OpenAI image generation failed" },
            { status: 500 }
          );
        }
      } else {
        const response = await ai!.models.generateContent({
          model: requestedModel,
          contents: mergeParts,
        });
        const outParts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
        for (const p of outParts) {
          if (p?.inlineData?.data) {
            images.push(`data:image/png;base64,${p.inlineData.data}`);
          } else if (p?.text) {
            texts.push(p.text);
          }
        }
      }

      if (!images.length) {
        return NextResponse.json(
          { error: "Model returned no image", text: texts.join("\n") },
          { status: 500 }
        );
      }

      return NextResponse.json({
        image: images[0],
        images,
        text: texts.join("\n")
      });
    }

    // Parse input image for non-merge nodes
    let parsed = null as null | { mimeType: string; data: string };
    if (body.image) {
      parsed = await toInlineDataFromAny(body.image);
    }

    if (!parsed) {
      return NextResponse.json({ error: "Invalid or missing image data. Please ensure an input is connected." }, { status: 400 });
    }

    // Build combined prompt from all accumulated parameters
    const { prompt, references } = await buildEditPrompt(body.params, body.prompt, toInlineDataFromAny);
    const referenceParts = references.map((inlineData) => ({ inlineData }));

    // Debug: Log the final combined prompt and parts structure

    // OpenAI branch: short-circuit and return early
    if (provider === "openai") {
      try {
        const inputDataUrls = [
          `data:${parsed.mimeType};base64,${parsed.data}`,
          ...referenceParts.map(r => `data:${r.inlineData.mimeType};base64,${r.inlineData.data}`),
        ];
        const result = await runOpenAIImageGen({
          apiKey: body.openaiApiToken!,
          prompt,
          imageDataUrls: inputDataUrls,
        });
        if (!result.images.length) {
          return NextResponse.json(
            { error: "No image generated.", textResponse: result.texts.join("\n") },
            { status: 500 }
          );
        }
        return NextResponse.json({ image: result.images[0] });
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message || "OpenAI image generation failed" },
          { status: 500 }
        );
      }
    }

    // Generate with Gemini
    const parts = [
      { text: prompt },
      // Primary subject image (input) - this is the person whose clothes will be changed
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
      // Additional reference images to guide modifications (e.g., clothes to copy)
      ...referenceParts,
    ];


    let response;
    try {
      response = await ai!.models.generateContent({
        model: requestedModel,
        contents: parts,
      });
    } catch (geminiError: any) {
      console.error('[API] Gemini API error:', geminiError);
      console.error('[API] Gemini error details:', {
        message: geminiError.message,
        status: geminiError.status,
        code: geminiError.code
      });

      // Try to extract a clean error message from the error
      let errorMessage = 'Unknown error occurred';

      // Check if the error message contains JSON
      if (geminiError.message) {
        try {
          // Try to parse JSON from the error message
          const jsonMatch = geminiError.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const errorJson = JSON.parse(jsonMatch[0]);
            // Extract the message from the parsed JSON
            if (errorJson.error?.message) {
              errorMessage = errorJson.error.message;
            } else if (errorJson.message) {
              errorMessage = errorJson.message;
            }
          } else {
            errorMessage = geminiError.message;
          }
        } catch {
          // If JSON parsing fails, use the original message
          errorMessage = geminiError.message;
        }
      }

      // Check for specific error types and provide user-friendly messages
      if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
        return NextResponse.json(
          { error: "Invalid API key. Please check your Google Gemini API key and try again." },
          { status: 401 }
        );
      }

      if (geminiError.message?.includes('safety') || errorMessage.includes('safety')) {
        return NextResponse.json(
          { error: "Content was blocked by safety filters. Try using different images or prompts." },
          { status: 400 }
        );
      }

      if (geminiError.message?.includes('quota') || geminiError.message?.includes('limit') || errorMessage.includes('quota') || errorMessage.includes('limit')) {
        return NextResponse.json(
          { error: "API quota exceeded. Please check your Gemini API usage limits." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }


    const outParts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    const texts: string[] = [];


    for (let i = 0; i < outParts.length; i++) {
      const p = outParts[i];

      if (p?.inlineData?.data) {
        images.push(`data:image/png;base64,${p.inlineData.data}`);
      }

      if (p?.text) {
        texts.push(p.text);
      }
    }

    if (!images.length) {
      console.error('[API] No images generated by Gemini. Text responses:', texts);
      return NextResponse.json(
        {
          error: "No image generated. Try adjusting your parameters.",
          textResponse: texts.join('\n'),
          debugInfo: {
            partsCount: outParts.length,
            candidatesCount: (response as any)?.candidates?.length || 0,
            hasResponse: !!response
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      image: images[0]
    });
  } catch (err: any) {
    console.error("/api/process error:", err);
    console.error("Error stack:", err?.stack);
    console.error("Error details:", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
      details: err?.details
    });

    // Provide more specific error messages
    if (err?.message?.includes('payload size') || err?.code === 413) {
      return NextResponse.json(
        { error: "Image data too large. Please use smaller images or reduce image quality." },
        { status: 413 }
      );
    }

    if (err?.message?.includes('API key') || err?.message?.includes('authentication')) {
      return NextResponse.json(
        { error: "Invalid API key. Please check your Google Gemini API token." },
        { status: 401 }
      );
    }

    if (err?.message?.includes('quota') || err?.message?.includes('limit')) {
      return NextResponse.json(
        { error: "API quota exceeded. Please check your Google Gemini API usage limits." },
        { status: 429 }
      );
    }

    if (err?.message?.includes('JSON')) {
      return NextResponse.json(
        { error: "Invalid data format. Please ensure images are properly encoded." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Failed to process image: ${err?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
