/**
 * API ROUTE: /api/hf-process
 * 
 * Hugging Face Inference API integration with fal.ai Gemini 2.5 Flash Image.
 * Uses HF Inference API to access fal.ai's Gemini 2.5 Flash Image models.
 */

import { NextRequest, NextResponse } from "next/server";
import { HfInference } from "@huggingface/inference";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated with HF Pro
    const cookieStore = await cookies();
    const hfToken = cookieStore.get('hf_token');
    
    if (!hfToken?.value) {
      return NextResponse.json(
        { error: "Please login with HF Pro to use fal.ai Gemini 2.5 Flash Image." },
        { status: 401 }
      );
    }

    // Initialize HF Inference client
    const hf = new HfInference(hfToken.value);
    
    const body = await req.json() as {
      type: string;
      image?: string;
      images?: string[];
      prompt?: string;
      params?: any;
    };

    // Convert data URL to blob for HF API
    const dataUrlToBlob = (dataUrl: string): Blob => {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    };

    // Handle MERGE operation using Stable Diffusion
    if (body.type === "MERGE") {
      if (!body.images || body.images.length < 2) {
        return NextResponse.json(
          { error: "MERGE requires at least two images" },
          { status: 400 }
        );
      }

      const prompt = body.prompt || `Create a cohesive group photo combining all subjects from the provided images. Ensure consistent lighting, natural positioning, and unified background.`;

      try {
        // Use fal.ai's Gemini 2.5 Flash Image through HF
        const result = await hf.textToImage({
          model: "fal-ai/gemini-25-flash-image/edit",
          inputs: prompt,
          parameters: {
            width: 1024,
            height: 1024,
            num_inference_steps: 20,
          }
        });

        // HF returns a Blob, convert to base64
        const arrayBuffer = await (result as unknown as Blob).arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        
        return NextResponse.json({ 
          image: `data:image/png;base64,${base64}`,
          model: "fal-ai/gemini-25-flash-image/edit"
        });
      } catch (error: unknown) {
        console.error('HF Merge error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
          { error: `HF processing failed: ${errorMessage}` },
          { status: 500 }
        );
      }
    }

    // Handle COMBINED and single image processing
    if (body.type === "COMBINED" || !body.image) {
      if (!body.image) {
        return NextResponse.json(
          { error: "No image provided" },
          { status: 400 }
        );
      }
    }

    const inputBlob = dataUrlToBlob(body.image);
    
    // Build prompt from parameters
    const prompts: string[] = [];
    const params = body.params || {};

    // Background changes
    if (params.backgroundType) {
      if (params.backgroundType === "color") {
        prompts.push(`Change background to ${params.backgroundColor || "white"}`);
      } else if (params.backgroundType === "image") {
        prompts.push(`Change background to ${params.backgroundImage || "beautiful landscape"}`);
      } else if (params.customPrompt) {
        prompts.push(params.customPrompt);
      }
    }

    // Style applications
    if (params.stylePreset) {
      const styleMap: { [key: string]: string } = {
        "90s-anime": "90s anime style, classic animation",
        "cyberpunk": "cyberpunk aesthetic, neon lights, futuristic",
        "van-gogh": "Van Gogh painting style, impressionist",
        "simpsons": "The Simpsons cartoon style",
        "arcane": "Arcane League of Legends art style"
      };
      const styleDesc = styleMap[params.stylePreset] || params.stylePreset;
      prompts.push(`Apply ${styleDesc} art style`);
    }

    // Other modifications
    if (params.editPrompt) {
      prompts.push(params.editPrompt);
    }

    const prompt = prompts.length > 0 
      ? prompts.join(", ") 
      : "High quality image processing";

    try {
      // Use fal.ai's Gemini 2.5 Flash Image for image editing
      const result = await hf.imageToImage({
        model: "fal-ai/gemini-25-flash-image/edit",
        inputs: inputBlob,
        parameters: {
          prompt: prompt,
          strength: 0.8,
          num_inference_steps: 25,
        }
      });

      const arrayBuffer = await (result as unknown as Blob).arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      return NextResponse.json({ 
        image: `data:image/png;base64,${base64}`,
        model: "fal-ai/gemini-25-flash-image/edit"
      });
    } catch (error: unknown) {
      console.error('HF processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: `HF processing failed: ${errorMessage}` },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error('HF API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `API error: ${errorMessage}` },
      { status: 500 }
    );
  }
}