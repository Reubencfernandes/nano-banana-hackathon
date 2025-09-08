import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1] || "image/png", data: match[2] };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: string;
      image?: string;
      images?: string[];
      prompt?: string;
      params?: any;
    };

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_actual_api_key_here') {
      return NextResponse.json(
        { error: "API key not configured. Please add GOOGLE_API_KEY to .env.local file." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Helpers
    const toInlineDataFromAny = async (url: string): Promise<{ mimeType: string; data: string } | null> => {
      if (!url) return null;
      try {
        if (url.startsWith('data:')) {
          return parseDataUrl(url);
        }
        if (url.startsWith('http')) {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const base64 = Buffer.from(buf).toString('base64');
          const mimeType = res.headers.get('content-type') || 'image/jpeg';
          return { mimeType, data: base64 };
        }
        if (url.startsWith('/')) {
          const host = req.headers.get('host') ?? 'localhost:3000';
          const proto = req.headers.get('x-forwarded-proto') ?? 'http';
          const absolute = `${proto}://${host}${url}`;
          const res = await fetch(absolute);
          const buf = await res.arrayBuffer();
          const base64 = Buffer.from(buf).toString('base64');
          const mimeType = res.headers.get('content-type') || 'image/png';
          return { mimeType, data: base64 };
        }
        return null;
      } catch {
        return null;
      }
    };

    // Handle MERGE node type separately
    if (body.type === "MERGE") {
      const imgs = body.images?.filter(Boolean) ?? [];
      if (imgs.length < 2) {
        return NextResponse.json(
          { error: "MERGE requires at least two images" },
          { status: 400 }
        );
      }

      // Build parts array for merge: first the text prompt, then image inlineData parts
      let mergePrompt = body.prompt;
      
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
      for (const url of imgs) {
        const parsed = await toInlineDataFromAny(url);
        if (!parsed) {
          console.error('[MERGE] Failed to parse image:', url.substring(0, 100));
          continue;
        }
        mergeParts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
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
      if (params.selectedPreset === "Sukajan") {
        prompts.push("Replace the person's clothing with a Japanese sukajan jacket (embroidered designs). Use the clothes reference image if provided.");
      } else if (params.selectedPreset === "Blazer") {
        prompts.push("Replace the person's clothing with a professional blazer. Use the clothes reference image if provided.");
      } else {
        prompts.push("Replace the person's clothing to match the provided clothes reference image (attached below). Preserve body pose and identity.");
      }
      const clothesRef = await toInlineDataFromAny(params.clothesImage);
      if (clothesRef) referenceParts.push({ inlineData: clothesRef });
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
      // Primary subject image (input)
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
      // Additional reference images to guide modifications
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
  } catch (err) {
    console.error("/api/process error", err);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}
