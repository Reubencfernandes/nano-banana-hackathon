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
    
    // Parse input image
    const parsed = parseDataUrl(body.image);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    }

    let prompt = "";
    
    // Generate appropriate prompt based on node type
    switch (body.type) {
      case "BACKGROUND":
        const bgType = body.params?.backgroundType || "color";
        if (bgType === "color") {
          prompt = `Change the background of this image to a solid ${body.params?.backgroundColor || "white"} background. Keep the person/subject exactly as they are, only change the background.`;
        } else if (bgType === "image") {
          prompt = `Change the background to ${body.params?.backgroundImage || "a beautiful beach scene"}. Keep the person/subject exactly as they are with proper lighting to match the new background.`;
        } else {
          prompt = body.params?.customPrompt || "Change the background to a professional studio background.";
        }
        break;
        
      case "CLOTHES":
        prompt = body.params?.clothesPrompt || 
          "Change the person's clothes to " + (body.params?.clothesDescription || "formal business attire") + 
          ". Keep their face, pose, and everything else exactly the same.";
        break;
        
      case "BLEND":
        prompt = `Blend this image with the style: ${body.params?.stylePrompt || "oil painting style"}. ` +
          `Strength: ${body.params?.blendStrength || 50}%. Keep the subject recognizable while applying the style.`;
        break;
        
      case "EDIT":
        prompt = body.params?.editPrompt || "Make subtle improvements to this image.";
        break;
        
      case "CAMERA":
        const camera = body.params || {};
        prompt = `Apply these camera settings to the image:\n` +
          `Focal Length: ${camera.focalLength || "50mm"}\n` +
          `Aperture: ${camera.aperture || "f/2.8"}\n` +
          `Shutter Speed: ${camera.shutterSpeed || "1/250s"}\n` +
          `White Balance: ${camera.whiteBalance || "5600K daylight"}\n` +
          `Camera Angle: ${camera.angle || "eye level"}\n` +
          `Make the image look like it was shot with these exact camera settings.`;
        break;
        
      case "AGE":
        const targetAge = body.params?.targetAge || 30;
        prompt = `Transform the person in this image to look exactly ${targetAge} years old. ` +
          `Adjust their facial features, skin texture, hair, and overall appearance to match that age naturally. ` +
          `Keep their identity recognizable but age-appropriate.`;
        break;
        
      case "FACE":
        const face = body.params?.faceOptions || {};
        const modifications = [];
        if (face.removePimples) modifications.push("remove all pimples and blemishes");
        if (face.addSunglasses) modifications.push("add stylish sunglasses");
        if (face.addHat) modifications.push("add a fashionable hat");
        if (face.changeHairstyle) modifications.push(`change hairstyle to ${face.changeHairstyle}`);
        if (face.facialExpression) modifications.push(`change facial expression to ${face.facialExpression}`);
        if (face.beardStyle) modifications.push(`add/change beard to ${face.beardStyle}`);
        
        prompt = modifications.length > 0
          ? `Modify the person's face: ${modifications.join(", ")}. Keep everything else the same.`
          : "Enhance the person's face subtly.";
        break;
        
      default:
        return NextResponse.json({ error: "Unknown node type" }, { status: 400 });
    }

    // Add the custom prompt if provided
    if (body.prompt) {
      prompt = body.prompt + "\n\n" + prompt;
    }

    // Generate with Gemini
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } }
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
