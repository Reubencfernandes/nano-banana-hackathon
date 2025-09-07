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
      image: string;
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

    // Parse input image
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
    
    // Style blending
    if (params.styleImage) {
      const strength = params.blendStrength || 50;
      prompts.push(`Apply artistic style blending using the provided style reference image (attached below) at ${strength}% strength.`);
      const styleRef = await toInlineDataFromAny(params.styleImage);
      if (styleRef) referenceParts.push({ inlineData: styleRef });
    }
    
    // Edit prompt
    if (params.editPrompt) {
      prompts.push(params.editPrompt);
    }
    
    // Camera settings
    if (params.focalLength || params.aperture || params.shutterSpeed || params.whiteBalance || params.angle || 
        params.iso || params.filmStyle || params.lighting || params.bokeh || params.composition || params.aspectRatio) {
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
      if (params.aspectRatio) cameraSettings.push(`Aspect Ratio: ${params.aspectRatio}`);
      
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
