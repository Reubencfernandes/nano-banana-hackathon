/**
 * API ROUTE: /api/hf-process
 * 
 * HuggingFace model processing endpoint for the Nano Banana Editor.
 * Handles image editing and generation using HuggingFace models.
 * 
 * Supported Models:
 * - black-forest-labs/FLUX.1-Kontext-dev: Image editing with context understanding
 * - Qwen/Qwen-Image-Edit: Powerful image editing model  
 * - black-forest-labs/FLUX.1-dev: Text-to-image generation
 * 
 * IMPORTANT LIMITATIONS:
 * - These models only accept SINGLE images for editing
 * - MERGE operations require Nano Banana Pro (Gemini API) which accepts multiple images
 * - Text-to-image (FLUX.1-dev) doesn't require input images
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { HfInference } from "@huggingface/inference";

// Configure Next.js runtime
export const runtime = "nodejs";

// Set maximum execution time for AI operations
export const maxDuration = 60;

/**
 * Available HuggingFace models with their capabilities
 */
const HF_MODELS = {
    "FLUX.1-Kontext-dev": {
        id: "black-forest-labs/FLUX.1-Kontext-dev",
        name: "FLUX.1 Kontext",
        type: "image-to-image",
        description: "Advanced image editing with context understanding",
        supportsNodes: ["BACKGROUND", "CLOTHES", "STYLE", "EDIT", "CAMERA", "AGE", "FACE", "LIGHTNING", "POSES"],
    },
    "Qwen-Image-Edit": {
        id: "Qwen/Qwen-Image-Edit",
        name: "Qwen Image Edit",
        type: "image-to-image",
        description: "Powerful image editing and manipulation",
        supportsNodes: ["BACKGROUND", "CLOTHES", "STYLE", "EDIT", "CAMERA", "AGE", "FACE", "LIGHTNING", "POSES"],
    },
    "FLUX.1-dev": {
        id: "black-forest-labs/FLUX.1-dev",
        name: "FLUX.1 Dev",
        type: "text-to-image",
        description: "High-quality text-to-image generation",
        supportsNodes: ["CHARACTER"], // Only for generating new images
    },
};

/**
 * Parse base64 data URL into components
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return null;
    return {
        mimeType: match[1] || "image/png",
        data: match[2]
    };
}

/**
 * Convert base64 to Blob for HuggingFace API
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

/**
 * Main POST handler for HuggingFace model processing
 */
export async function POST(req: NextRequest) {
    try {
        // Parse request body
        let body: {
            type: string;
            model: string;
            image?: string;
            prompt?: string;
            params?: any;
        };

        try {
            body = await req.json();
        } catch (jsonError) {
            console.error('[HF-API] Failed to parse JSON:', jsonError);
            return NextResponse.json(
                { error: "Invalid JSON in request body" },
                { status: 400 }
            );
        }

        // Get HF token from cookies
        let hfToken: string | null = null;
        try {
            const cookieStore = await cookies();
            const tokenCookie = cookieStore.get('hf_token');
            hfToken = tokenCookie?.value || null;
        } catch (error) {
            console.error('Error reading HF token:', error);
        }

        if (!hfToken) {
            return NextResponse.json(
                { error: "Please login with HuggingFace to use HF models. Click 'Login with HuggingFace' in the header." },
                { status: 401 }
            );
        }

        // Validate model selection
        const modelKey = body.model as keyof typeof HF_MODELS;
        const modelConfig = HF_MODELS[modelKey];

        if (!modelConfig) {
            return NextResponse.json(
                { error: `Invalid model: ${body.model}. Available models: ${Object.keys(HF_MODELS).join(", ")}` },
                { status: 400 }
            );
        }

        // Check for MERGE - not supported with HF models
        if (body.type === "MERGE") {
            return NextResponse.json(
                {
                    error: "MERGE operations require Nano Banana Pro (Gemini API). HuggingFace models only accept single images. Please switch to 'Nano Banana Pro' mode and enter your Google Gemini API key to use MERGE functionality.",
                    requiresNanoBananaPro: true
                },
                { status: 400 }
            );
        }

        // Initialize HuggingFace client
        const hf = new HfInference(hfToken);

        // Handle text-to-image generation (FLUX.1-dev)
        if (modelConfig.type === "text-to-image") {
            const prompt = body.prompt || body.params?.characterDescription || "A professional portrait photo";

            try {
                const result = await hf.textToImage({
                    model: modelConfig.id,
                    inputs: prompt,
                    parameters: {
                        num_inference_steps: 28,
                        guidance_scale: 3.5,
                    },
                });

                // Result is a Blob, convert to base64
                const resultBlob = result as unknown as Blob;
                const arrayBuffer = await resultBlob.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const dataUrl = `data:image/png;base64,${base64}`;

                return NextResponse.json({ image: dataUrl });
            } catch (hfError: any) {
                console.error('[HF-API] Text-to-image error:', hfError);
                return NextResponse.json(
                    { error: `HuggingFace API error: ${hfError.message || 'Unknown error'}` },
                    { status: 500 }
                );
            }
        }

        // Handle image-to-image editing
        if (modelConfig.type === "image-to-image") {
            // Validate input image
            if (!body.image) {
                return NextResponse.json(
                    { error: "No input image provided. Please connect an image source to this node." },
                    { status: 400 }
                );
            }

            // Handle different image formats
            let parsed: { mimeType: string; data: string } | null = null;
            let imageUrl = body.image;

            // Try parsing as Data URL first
            parsed = parseDataUrl(imageUrl);

            // If not a data URL, handle various URL formats
            if (!parsed) {
                // Convert relative paths to absolute URLs
                if (imageUrl.startsWith('/')) {
                    const spaceHost = process.env.SPACE_HOST || 'localhost:3000';
                    const protocol = spaceHost.includes('localhost') ? 'http' : 'https';
                    imageUrl = `${protocol}://${spaceHost}${imageUrl}`;
                    console.log('[HF-API] Converted relative path to:', imageUrl);
                }

                // Fetch from HTTP(S) URL
                if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    try {
                        console.log('[HF-API] Fetching image from URL:', imageUrl.substring(0, 100));
                        const imageResponse = await fetch(imageUrl);
                        if (!imageResponse.ok) {
                            throw new Error(`Failed to fetch image: ${imageResponse.status}`);
                        }
                        const imageBuffer = await imageResponse.arrayBuffer();
                        const contentType = imageResponse.headers.get('content-type') || 'image/png';
                        const base64 = Buffer.from(imageBuffer).toString('base64');
                        parsed = { mimeType: contentType, data: base64 };
                    } catch (fetchErr) {
                        console.error('[HF-API] Failed to fetch image URL:', fetchErr);
                    }
                }
            }

            if (!parsed) {
                console.error('[HF-API] Invalid image format. Image starts with:', body.image?.substring(0, 50));
                return NextResponse.json(
                    { error: "Invalid image format. Expected a data URL (data:image/...) or HTTP URL. Please re-upload or reconnect your image." },
                    { status: 400 }
                );
            }

            // Build the editing prompt from parameters
            const prompts: string[] = [];
            const params = body.params || {};

            // Background modifications
            if (params.backgroundType) {
                if (params.backgroundType === "color") {
                    prompts.push(`Change the background to a solid ${params.backgroundColor || "white"} color.`);
                } else if (params.backgroundType === "custom" && params.customPrompt) {
                    prompts.push(params.customPrompt);
                } else if (params.backgroundType === "city") {
                    prompts.push(`Place the person in a ${params.citySceneType || "busy city street"} during ${params.cityTimeOfDay || "daytime"}.`);
                }
            }

            // Style application  
            if (params.stylePreset) {
                const styleMap: { [key: string]: string } = {
                    "90s-anime": "Transform into 90s anime art style",
                    "mha": "Convert into My Hero Academia anime style",
                    "dbz": "Convert into Dragon Ball Z anime style",
                    "ukiyo-e": "Convert into Japanese Ukiyo-e woodblock print style",
                    "cubism": "Convert into Cubist art style",
                    "van-gogh": "Convert into Van Gogh post-impressionist style",
                    "simpsons": "Convert into The Simpsons cartoon style",
                    "family-guy": "Convert into Family Guy animation style",
                    "pixar": "Convert into Pixar animation style",
                    "manga": "Convert into Manga style",
                };
                const styleDescription = styleMap[params.stylePreset] || `Apply ${params.stylePreset} style`;
                prompts.push(`${styleDescription} at ${params.styleStrength || 50}% intensity.`);
            }

            // Edit prompt
            if (params.editPrompt) {
                prompts.push(params.editPrompt);
            }

            // Age transformation
            if (params.targetAge) {
                prompts.push(`Transform the person to look ${params.targetAge} years old.`);
            }

            // Face modifications
            if (params.faceOptions) {
                const face = params.faceOptions;
                const modifications: string[] = [];
                if (face.removePimples) modifications.push("remove pimples");
                if (face.addSunglasses) modifications.push("add sunglasses");
                if (face.addHat) modifications.push("add a hat");
                if (face.changeHairstyle) modifications.push(`change hairstyle to ${face.changeHairstyle}`);
                if (face.facialExpression) modifications.push(`change expression to ${face.facialExpression}`);
                if (modifications.length > 0) {
                    prompts.push(`Face modifications: ${modifications.join(", ")}`);
                }
            }

            // Lighting effects
            if (params.lightingPrompt) {
                prompts.push(`Apply lighting: ${params.lightingPrompt}`);
            }

            // Pose modifications
            if (params.posePrompt) {
                prompts.push(`Change pose to: ${params.posePrompt}`);
            }

            const finalPrompt = prompts.length > 0
                ? prompts.join(" ")
                : body.prompt || "Enhance this image with high quality output.";

            try {
                // Convert base64 to blob for HF API
                const imageBlob = base64ToBlob(parsed.data, parsed.mimeType);

                // Use image-to-image endpoint
                const result = await hf.imageToImage({
                    model: modelConfig.id,
                    inputs: imageBlob,
                    parameters: {
                        prompt: finalPrompt,
                        num_inference_steps: 28,
                        guidance_scale: 7.5,
                        strength: 0.75,
                    },
                });

                // Convert result blob to base64
                const arrayBuffer = await result.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const dataUrl = `data:image/png;base64,${base64}`;

                return NextResponse.json({ image: dataUrl });
            } catch (hfError: any) {
                console.error('[HF-API] Image-to-image error:', hfError);

                // Provide helpful error messages
                if (hfError.message?.includes('401') || hfError.message?.includes('unauthorized')) {
                    return NextResponse.json(
                        { error: "HuggingFace authentication failed. Please logout and login again." },
                        { status: 401 }
                    );
                }

                if (hfError.message?.includes('Model') && hfError.message?.includes('not')) {
                    return NextResponse.json(
                        { error: `Model ${modelConfig.id} is not available or requires a Pro subscription.` },
                        { status: 503 }
                    );
                }

                return NextResponse.json(
                    { error: `HuggingFace API error: ${hfError.message || 'Unknown error'}` },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json(
            { error: "Unsupported operation type" },
            { status: 400 }
        );

    } catch (err: any) {
        console.error("/api/hf-process error:", err);
        return NextResponse.json(
            { error: `Failed to process: ${err?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}

/**
 * GET handler to return available models and their capabilities
 */
export async function GET() {
    return NextResponse.json({
        models: HF_MODELS,
        note: "MERGE operations require Nano Banana Pro (Gemini API) as it needs multi-image input which HuggingFace models don't support."
    });
}
