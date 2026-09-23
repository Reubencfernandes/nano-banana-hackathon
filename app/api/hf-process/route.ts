/**
 * API ROUTE: /api/hf-process
 * 
 * HuggingFace model processing endpoint for the Portrait Editor.
 * Handles image editing and generation using HuggingFace models.
 * 
 * Supported Models:
 * - Qwen/Qwen-Image-2.1: Image editing and text-to-image, served from our own
 *   Gradio Space (QWEN_SPACE_ID) and called through its `/edit` API endpoint
 * 
 * IMPORTANT LIMITATIONS:
 * - The model only accepts a SINGLE image for editing
 * - MERGE operations require a multi-image model (Gemini or GPT)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Client, handle_file } from "@gradio/client";

// Configure Next.js runtime
export const runtime = "nodejs";

// Set maximum execution time for AI operations (Space may need to wake up / queue)
export const maxDuration = 300;

// Gradio Space hosting Qwen-Image-2.1 (see spaces/qwen-image-2.1)
const QWEN_SPACE_ID = process.env.QWEN_SPACE_ID || "Reubencf/qwen-image-2.1";

/**
 * Available HuggingFace models with their capabilities
 */
const HF_MODELS = {
    "Qwen-Image-2.1": {
        id: "Qwen/Qwen-Image-2.1",
        name: "Qwen Image 2.1",
        type: "image-to-image",
        description: "Latest Qwen image editing and generation model",
        supportsNodes: ["BACKGROUND", "CLOTHES", "STYLE", "EDIT", "CAMERA", "ANGLE", "AGE", "FACE", "LIGHTNING", "POSES"],
    },
};

/**
 * Run Qwen-Image-2.1 on the Gradio Space and return the result as a data URL.
 * The user's HF token is forwarded so the Space's GPU usage counts against their quota.
 */
async function runQwenSpace(hfToken: string, prompt: string, image: Blob | null): Promise<string> {
    const client = await Client.connect(QWEN_SPACE_ID, { token: hfToken as `hf_${string}` });
    const result = await client.predict("/edit", {
        image: image ? handle_file(image) : null,
        prompt,
        seed: -1,
        steps: 40,
    });

    const output = (result.data as any[])[0];
    const outputUrl: string | undefined = output?.url;
    if (!outputUrl) {
        throw new Error("Space returned no image");
    }

    const imageResponse = await fetch(outputUrl, {
        headers: { Authorization: `Bearer ${hfToken}` },
    });
    if (!imageResponse.ok) {
        throw new Error(`Failed to download result image: ${imageResponse.status}`);
    }
    const contentType = imageResponse.headers.get("content-type") || "image/png";
    const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${base64}`;
}

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

        // Get HF token from cookies (set by the OAuth login flow)
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
                    error: "MERGE operations require a multi-image model. HuggingFace models only accept single images. Please switch to Gemini or GPT mode to use MERGE.",
                    requiresNanoBananaPro: true
                },
                { status: 400 }
            );
        }

        // Handle text-to-image generation
        if (modelConfig.type === "text-to-image") {
            const prompt = body.prompt || body.params?.characterDescription || "A professional portrait photo";

            try {
                const dataUrl = await runQwenSpace(hfToken, prompt, null);
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

            // Clothing modifications
            if (params.clothesPrompt) {
                prompts.push(`Change clothing to: ${params.clothesPrompt}`);
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

            if (params.cameraX !== undefined && params.cameraY !== undefined) {
                const x = params.cameraX; // -1 to 1, 0 = front, ±1 = back
                const y = params.cameraY; // -1 to 1, 0 = eye level
                const z = typeof params.cameraZ === "number" ? params.cameraZ : 0.5;

                const xAbs = Math.abs(x);
                let horizontalDesc: string;
                if (xAbs < 0.1) horizontalDesc = "directly in front, subject fully facing the camera";
                else if (xAbs < 0.3) horizontalDesc = `slight ${x > 0 ? "right" : "left"} angle, subject mostly facing the camera`;
                else if (xAbs < 0.6) horizontalDesc = `three-quarter view from the subject's ${x > 0 ? "right" : "left"} side`;
                else if (xAbs < 0.85) horizontalDesc = `profile / side view from the subject's ${x > 0 ? "right" : "left"}`;
                else if (xAbs < 0.97) horizontalDesc = `three-quarter rear view from the subject's ${x > 0 ? "right" : "left"}`;
                else horizontalDesc = "directly behind the subject, rear view";

                let verticalDesc: string;
                if (y > 0.75) verticalDesc = "extreme high angle, bird's-eye view";
                else if (y > 0.4) verticalDesc = "high angle, camera above the subject looking down";
                else if (y > 0.1) verticalDesc = "slightly elevated, just above eye level";
                else if (y > -0.1) verticalDesc = "eye level";
                else if (y > -0.4) verticalDesc = "slightly low angle, just below eye level";
                else if (y > -0.75) verticalDesc = "low angle, camera below the subject looking up";
                else verticalDesc = "extreme low angle, worm's-eye view";

                let shotDesc: string;
                if (z < 0.15) shotDesc = "extreme close-up";
                else if (z < 0.35) shotDesc = "close-up shot";
                else if (z < 0.55) shotDesc = "medium shot";
                else if (z < 0.75) shotDesc = "medium-wide shot";
                else shotDesc = "wide shot";

                prompts.push(`Photograph this scene from a new camera angle: ${horizontalDesc}, ${verticalDesc}, ${shotDesc}. Adjust perspective, foreshortening, horizon, and shadows to match this new viewpoint. Keep the subject's appearance and identity identical.`);
            }

            const finalPrompt = prompts.length > 0
                ? prompts.join(" ")
                : body.prompt || "Enhance this image with high quality output.";

            try {
                // Convert base64 to blob for HF API
                const imageBlob = base64ToBlob(parsed.data, parsed.mimeType);

                const dataUrl = await runQwenSpace(hfToken, finalPrompt, imageBlob);

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

                if (hfError.message?.toLowerCase().includes('quota')) {
                    return NextResponse.json(
                        { error: "Your HuggingFace GPU quota is used up. Try again later or upgrade to HF Pro." },
                        { status: 429 }
                    );
                }

                if (hfError.message?.includes('Could not resolve app config') || hfError.message?.includes('not found')) {
                    return NextResponse.json(
                        { error: `The ${modelConfig.name} Space (${QWEN_SPACE_ID}) is unavailable. It may be starting up — try again in a minute.` },
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
        note: "MERGE operations require Gemini or GPT as they need multi-image input which HuggingFace models don't support."
    });
}
