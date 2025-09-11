/**
 * API ROUTE: /api/process
 * 
 * Main image processing endpoint for the Nano Banana Editor.
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
    const contentLength = req.headers.get('content-length');
    console.log(`[API] Request size: ${contentLength} bytes`);
    
    // Parse and validate the JSON request body
    let body: any;
    try {
      body = await req.json() as {
        type: string;        // Operation type: "MERGE", "COMBINED", etc.
        image?: string;      // Single image for processing (base64 data URL)
        images?: string[];   // Multiple images for merge operations
        prompt?: string;     // Custom text prompt for AI
        params?: any;        // Node-specific parameters (background, clothes, etc.)
        apiToken?: string;   // User's Google AI API token
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

    // Validate and retrieve Google API key from user input or environment
    const apiKey = body.apiToken || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_actual_api_key_here') {
      return NextResponse.json(
        { error: `API key not provided. Please ${isHfProUser ? 'enter your Google Gemini API token in the top right' : 'login with HF Pro or enter your Google Gemini API token'}.` },
        { status: 500 }
      );
    }

    // Initialize Google AI client with the validated API key
    const ai = new GoogleGenAI({ apiKey });
    
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
        console.log(`[MERGE] Processing image ${i + 1}/${imgs.length}, type: ${typeof url}, length: ${url?.length || 0}`);
        
        try {
          const parsed = await toInlineDataFromAny(url);
          if (!parsed) {
            console.error(`[MERGE] Failed to parse image ${i + 1}:`, url.substring(0, 100));
            continue;
          }
          mergeParts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
          console.log(`[MERGE] Successfully processed image ${i + 1}`);
        } catch (error) {
          console.error(`[MERGE] Error processing image ${i + 1}:`, error);
        }
      }
      
      console.log(`[MERGE] Sending ${mergeParts.length - 1} images to model`);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: mergeParts,
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

      return NextResponse.json({ image: images[0], images, text: texts.join("\n") });
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
    const prompts: string[] = [];
    const params = body.params || {};

    // We'll collect additional inline image parts (references)
    const referenceParts: { inlineData: { mimeType: string; data: string } }[] = [];
    
    // Background modifications
    if (params.backgroundType) {
      const bgType = params.backgroundType;
      if (bgType === "color") {
        prompts.push(`Change the background to a solid ${params.backgroundColor || "white"} background.`);
      } else if (bgType === "image") {
        prompts.push(`Change the background to ${params.backgroundImage || "a beautiful beach scene"}.`);
      } else if (bgType === "upload" && params.customBackgroundImage) {
        prompts.push(`Replace the background using the provided custom background reference image (attached below). Ensure perspective and lighting match.`);
        const bgRef = await toInlineDataFromAny(params.customBackgroundImage);
        if (bgRef) referenceParts.push({ inlineData: bgRef });
      } else if (params.customPrompt) {
        prompts.push(params.customPrompt);
      }
    }
    
    // Clothes modifications
    if (params.clothesImage) {
      console.log(`[API] Processing clothes image, type: ${typeof params.clothesImage}, length: ${params.clothesImage?.length || 0}`);
      
      if (params.selectedPreset === "Sukajan") {
        prompts.push("Replace the person's clothing with a Japanese sukajan jacket (embroidered designs). Use the clothes reference image if provided.");
      } else if (params.selectedPreset === "Blazer") {
        prompts.push("Replace the person's clothing with a professional blazer. Use the clothes reference image if provided.");
      } else {
        prompts.push(`Take the person shown in the first image and replace their entire outfit with the clothing items shown in the second reference image. The person's face, hair, body pose, and background should remain exactly the same. Only the clothing should change to match the reference clothing image. Ensure the new clothes fit naturally on the person's body with realistic proportions, proper fabric draping, and lighting that matches the original photo environment.`);
      }
      
      try {
        const clothesRef = await toInlineDataFromAny(params.clothesImage);
        if (clothesRef) {
          console.log(`[API] Successfully processed clothes image`);
          referenceParts.push({ inlineData: clothesRef });
        } else {
          console.error('[API] Failed to process clothes image - toInlineDataFromAny returned null');
        }
      } catch (error) {
        console.error('[API] Error processing clothes image:', error);
      }
    }
    
    // Style application
    if (params.stylePreset) {
      const strength = params.styleStrength || 50;
      const styleMap: { [key: string]: string } = {
        "90s-anime": "Convert the image to 90's anime art style with classic anime features: large expressive eyes, detailed hair, soft shading, nostalgic colors reminiscent of Studio Ghibli and classic anime productions",
        "mha": "Transform the image into My Hero Academia anime style with modern crisp lines, vibrant colors, dynamic character design, and heroic aesthetics typical of the series",
        "dbz": "Apply Dragon Ball Z anime style with sharp angular features, spiky hair, intense expressions, bold outlines, high contrast shading, and dramatic action-oriented aesthetics",
        "ukiyo-e": "Render in traditional Japanese Ukiyo-e woodblock print style with flat colors, bold outlines, stylized waves and clouds, traditional Japanese artistic elements",
        "cyberpunk": "Transform into cyberpunk aesthetic with neon colors (cyan, magenta, yellow), dark backgrounds, futuristic elements, holographic effects, tech-noir atmosphere",
        "steampunk": "Apply steampunk style with Victorian-era brass and copper tones, mechanical gears, steam effects, vintage industrial aesthetic, sepia undertones",
        "cubism": "Render in Cubist art style with geometric fragmentation, multiple perspectives shown simultaneously, abstract angular forms, Picasso-inspired decomposition",
        "van-gogh": "Apply Post-Impressionist Van Gogh style with thick swirling brushstrokes, vibrant yellows and blues, expressive texture, starry night-like patterns",
        "simpsons": "Convert to The Simpsons cartoon style with yellow skin tones, simple rounded features, bulging eyes, overbite, Matt Groening's distinctive character design",
        "family-guy": "Transform into Family Guy animation style with rounded character design, simplified features, Seth MacFarlane's distinctive art style, bold outlines",
        "arcane": "Apply Arcane (League of Legends) style with painterly brush-stroke textures, neon rim lighting, hand-painted feel, stylized realism, vibrant color grading",
        "wildwest": "Render in Wild West style with dusty desert tones, sunset orange lighting, vintage film grain, cowboy aesthetic, sepia and brown color palette",
        "stranger-things": "Apply Stranger Things 80s aesthetic with Kodak film push-process look, neon magenta backlight, grainy vignette, retro sci-fi horror atmosphere",
        "breaking-bad": "Transform with Breaking Bad cinematography style featuring dusty New Mexico orange and teal color grading, 35mm film grain, desert atmosphere, dramatic lighting"
      };
      
      const styleDescription = styleMap[params.stylePreset];
      if (styleDescription) {
        prompts.push(`${styleDescription}. Apply this style transformation at ${strength}% intensity while preserving the core subject matter.`);
      }
    }
    
    // Edit prompt
    if (params.editPrompt) {
      prompts.push(params.editPrompt);
    }
    
    // Camera settings
    if (params.focalLength || params.aperture || params.shutterSpeed || params.whiteBalance || params.angle || 
        params.iso || params.filmStyle || params.lighting || params.bokeh || params.composition) {
      const cameraSettings: string[] = [];
      if (params.focalLength) {
        if (params.focalLength === "8mm fisheye") {
          cameraSettings.push("Apply 8mm fisheye lens effect with 180-degree circular distortion");
        } else {
          cameraSettings.push(`Focal Length: ${params.focalLength}`);
        }
      }
      if (params.aperture) cameraSettings.push(`Aperture: ${params.aperture}`);
      if (params.shutterSpeed) cameraSettings.push(`Shutter Speed: ${params.shutterSpeed}`);
      if (params.whiteBalance) cameraSettings.push(`White Balance: ${params.whiteBalance}`);
      if (params.angle) cameraSettings.push(`Camera Angle: ${params.angle}`);
      if (params.iso) cameraSettings.push(`${params.iso}`);
      if (params.filmStyle) cameraSettings.push(`Film style: ${params.filmStyle}`);
      if (params.lighting) cameraSettings.push(`Lighting: ${params.lighting}`);
      if (params.bokeh) cameraSettings.push(`Bokeh effect: ${params.bokeh}`);
      if (params.composition) cameraSettings.push(`Composition: ${params.composition}`);
      
      if (cameraSettings.length > 0) {
        prompts.push(`Apply professional photography settings: ${cameraSettings.join(", ")}`);
      }
    }
    
    // Age transformation
    if (params.targetAge) {
      prompts.push(`Transform the person to look exactly ${params.targetAge} years old with age-appropriate features.`);
    }
    
    // Face modifications
    if (params.faceOptions) {
      const face = params.faceOptions;
      const modifications: string[] = [];
      if (face.removePimples) modifications.push("remove all pimples and blemishes");
      if (face.addSunglasses) modifications.push("add stylish sunglasses");
      if (face.addHat) modifications.push("add a fashionable hat");
      if (face.changeHairstyle) modifications.push(`change hairstyle to ${face.changeHairstyle}`);
      if (face.facialExpression) modifications.push(`change facial expression to ${face.facialExpression}`);
      if (face.beardStyle) modifications.push(`add/change beard to ${face.beardStyle}`);
      
      if (modifications.length > 0) {
        prompts.push(`Face modifications: ${modifications.join(", ")}`);
      }
    }
    
    // Combine all prompts
    let prompt = prompts.length > 0 
      ? prompts.join("\n\n") + "\n\nApply all these modifications while maintaining the person's identity and keeping unspecified aspects unchanged."
      : "Process this image with high quality output.";

    // Add the custom prompt if provided
    if (body.prompt) {
      prompt = body.prompt + "\n\n" + prompt;
    }

    // Generate with Gemini
    const parts = [
      { text: prompt },
      // Primary subject image (input) - this is the person whose clothes will be changed
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
      // Additional reference images to guide modifications (e.g., clothes to copy)
      ...referenceParts,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: parts,
    });

    const outParts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    
    for (const p of outParts) {
      if (p?.inlineData?.data) {
        images.push(`data:image/png;base64,${p.inlineData.data}`);
      }
    }

    if (!images.length) {
      return NextResponse.json(
        { error: "No image generated. Try adjusting your parameters." },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: images[0] });
  } catch (err: any) {
    console.error("/api/process error:", err);
    console.error("Error stack:", err?.stack);
    
    // Provide more specific error messages
    if (err?.message?.includes('payload size')) {
      return NextResponse.json(
        { error: "Image data too large. Please use smaller images or reduce image quality." },
        { status: 413 }
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
