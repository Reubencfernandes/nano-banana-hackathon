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
import { InferenceClient } from "@huggingface/inference";

// Configure Next.js runtime
export const runtime = "nodejs";

// Set maximum execution time for AI operations
export const maxDuration = 60;

/**
 * Available HuggingFace models with their capabilities
 * Using fal-ai as the inference provider for these models
 */
export const HF_MODELS = {
    // Image-to-Image Models
    "FLUX.1-Kontext-dev": {
        id: "black-forest-labs/FLUX.1-Kontext-dev",
        provider: "fal-ai",
        providerId: "fal-ai/flux-kontext/dev",
        name: "FLUX.1 Kontext",
        type: "image-to-image",
        description: "Advanced image editing with context understanding",
        supportsNodes: ["BACKGROUND", "CLOTHES", "STYLE", "EDIT", "CAMERA", "AGE", "FACE", "LIGHTNING", "POSES"],
    },
    "Qwen-Image-Edit": {
        id: "Qwen/Qwen-Image-Edit",
        provider: "fal-ai",
        providerId: "fal-ai/qwen-image-edit",
        name: "Qwen Image Edit",
        type: "image-to-image",
        description: "Powerful image editing and manipulation",
        supportsNodes: ["BACKGROUND", "CLOTHES", "STYLE", "EDIT", "CAMERA", "AGE", "FACE", "LIGHTNING", "POSES"],
    },
};

/**
 * Parse base64 data URL into components
 * Also handles remote URLs by returning null (they need different handling)
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    if (!dataUrl || typeof dataUrl !== 'string') {
        console.error('[HF-API] parseDataUrl: Invalid input - not a string, got:', typeof dataUrl);
        return null;
    }

    // Check if it's a remote URL (not a data URL)
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        console.log('[HF-API] parseDataUrl: Remote URL detected');
        return null;
    }

    // Check if it starts with data:
    if (!dataUrl.startsWith('data:')) {
        console.error('[HF-API] parseDataUrl: Not a data URL, starts with:', dataUrl.substring(0, 20));
        return null;
    }

    // Handle data URLs - format: data:image/png;base64,xxxxx
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        // Try alternative format without base64 marker
        const altMatch = dataUrl.match(/^data:([^,]+),(.+)$/);
        if (altMatch) {
            console.log('[HF-API] parseDataUrl: Matched alternative format, mimeType:', altMatch[1]);
            return {
                mimeType: altMatch[1] || "image/png",
                data: altMatch[2]
            };
        }
        console.error('[HF-API] parseDataUrl: Failed to parse, first 100 chars:', dataUrl.substring(0, 100));
        return null;
    }

    console.log('[HF-API] parseDataUrl: Success, mimeType:', match[1], 'data length:', match[2].length);
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
            // Log received body for debugging
            console.log('[HF-API] Received request:', {
                type: body.type,
                model: body.model,
                hasImage: !!body.image,
                imageType: typeof body.image,
                imagePrefix: body.image ? body.image.substring(0, 50) : 'none',
                paramsKeys: body.params ? Object.keys(body.params) : []
            });
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

        // Check for MERGE - only supported with models that have supportsMultiImage
        if (body.type === "MERGE") {
            const supportsMulti = (modelConfig as any).supportsMultiImage;
            if (!supportsMulti) {
                return NextResponse.json(
                    {
                        error: `MERGE operations require a multi-image model. Please select FLUX.2-dev or switch to Nano Banana Pro (Gemini API).`,
                        requiresNanoBananaPro: false,
                        availableModels: Object.entries(HF_MODELS)
                            .filter(([_, m]) => (m as any).supportsMultiImage)
                            .map(([key, _]) => key)
                    },
                    { status: 400 }
                );
            }
        }

        // Initialize HuggingFace InferenceClient
        const client = new InferenceClient(hfToken);

        // Handle text-to-image generation (FLUX.1-dev)
        if (modelConfig.type === "text-to-image") {
            const prompt = body.prompt || body.params?.characterDescription || "A professional portrait photo";

            try {
                const result = await client.textToImage({
                    model: modelConfig.id,
                    provider: modelConfig.provider as any,
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

        // Handle multi-image operations (FLUX.2-dev for MERGE)
        if (modelConfig.type === "multi-image" && body.type === "MERGE") {
            const images = body.params?.images as string[] || [];

            if (images.length < 2) {
                return NextResponse.json(
                    { error: "MERGE requires at least 2 images" },
                    { status: 400 }
                );
            }

            // Build merge prompt
            const mergePrompt = body.params?.prompt || body.prompt ||
                `Combine these ${images.length} people into a single cohesive group photo. ` +
                `Maintain each person's identity and appearance. ` +
                `Create a natural, professional group portrait with consistent lighting and style.`;

            try {
                // For FLUX.2-dev, we need to send multiple images
                // Convert all images to base64 blobs
                const imageBlobs: Blob[] = [];
                for (const img of images) {
                    const parsed = parseDataUrl(img);
                    if (parsed) {
                        imageBlobs.push(base64ToBlob(parsed.data, parsed.mimeType));
                    }
                }

                // FLUX.2-dev with fal-ai accepts multiple images via the inputs array
                const response = await fetch(`https://api-inference.huggingface.co/models/${modelConfig.id}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${hfToken}`,
                        "Content-Type": "application/json",
                        "X-Use-Provider": modelConfig.provider,
                    },
                    body: JSON.stringify({
                        inputs: mergePrompt,
                        parameters: {
                            images: images.map(img => img.replace(/^data:image\/\w+;base64,/, '')),
                            num_inference_steps: 28,
                            guidance_scale: 7.5,
                        }
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[HF-API] Multi-image error:', errorText);
                    throw new Error(`API error: ${response.status} - ${errorText}`);
                }

                const resultBlob = await response.blob();
                const arrayBuffer = await resultBlob.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const dataUrl = `data:image/png;base64,${base64}`;

                return NextResponse.json({ image: dataUrl });
            } catch (hfError: any) {
                console.error('[HF-API] Multi-image error:', hfError);
                return NextResponse.json(
                    { error: `HuggingFace API error: ${hfError.message || 'Unknown error'}` },
                    { status: 500 }
                );
            }
        }

        // Handle single-image operations with multi-image model
        if (modelConfig.type === "multi-image" && body.type !== "MERGE") {
            // Treat as image-to-image for non-MERGE operations
        }

        // Handle image-to-image editing
        if (modelConfig.type === "image-to-image" || modelConfig.type === "multi-image") {
            // Validate input image
            if (!body.image) {
                console.error('[HF-API] No image in request body. Body keys:', Object.keys(body));
                return NextResponse.json(
                    { error: "No input image provided. Please connect an image source to this node." },
                    { status: 400 }
                );
            }

            console.log('[HF-API] Processing image. Type:', typeof body.image,
                'Length:', body.image.length,
                'First 80 chars:', body.image.substring(0, 80));

            let imageBlob: Blob;

            // Handle remote URLs
            if (body.image.startsWith('http://') || body.image.startsWith('https://')) {
                console.log('[HF-API] Image is a remote URL, fetching...');
                try {
                    const imgResponse = await fetch(body.image);
                    if (!imgResponse.ok) {
                        throw new Error(`Failed to fetch image: ${imgResponse.status}`);
                    }
                    imageBlob = await imgResponse.blob();
                    console.log('[HF-API] Remote image fetched, size:', imageBlob.size);
                } catch (fetchError: any) {
                    console.error('[HF-API] Failed to fetch remote image:', fetchError);
                    return NextResponse.json(
                        { error: `Failed to fetch image from URL: ${fetchError.message}` },
                        { status: 400 }
                    );
                }
            } else if (body.image.startsWith('data:')) {
                // Handle data URLs
                console.log('[HF-API] Image is a data URL, parsing...');
                const parsed = parseDataUrl(body.image);
                if (!parsed) {
                    // Try a different approach - just extract the base64 part
                    const base64Match = body.image.match(/base64,(.+)$/);
                    if (base64Match) {
                        console.log('[HF-API] Fallback: extracted base64 data manually');
                        imageBlob = base64ToBlob(base64Match[1], 'image/png');
                    } else {
                        console.error('[HF-API] Failed to parse data URL and fallback failed');
                        return NextResponse.json(
                            { error: "Invalid image format. Could not parse the data URL." },
                            { status: 400 }
                        );
                    }
                } else {
                    console.log('[HF-API] Parsed data URL, mimeType:', parsed.mimeType, 'data length:', parsed.data.length);
                    imageBlob = base64ToBlob(parsed.data, parsed.mimeType);
                }
            } else if (body.image.startsWith('/')) {
                // Handle local path (e.g., /images/something.png)
                console.log('[HF-API] Image is a local path:', body.image);
                return NextResponse.json(
                    { error: "Local image paths are not supported. Please use a data URL or upload the image." },
                    { status: 400 }
                );
            } else {
                console.error('[HF-API] Unknown image format. Starts with:', body.image.substring(0, 30));
                return NextResponse.json(
                    { error: `Unknown image format. Expected data URL or remote URL, got: ${body.image.substring(0, 20)}...` },
                    { status: 400 }
                );
            }

            console.log('[HF-API] Image blob created, size:', imageBlob.size, 'type:', imageBlob.type);

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

            // Clothes modifications (text-based for HuggingFace mode)
            if (params.clothesDescription) {
                prompts.push(`Change the person's clothing to: ${params.clothesDescription}. Keep the person's face and identity unchanged.`);
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
                // Use imageBlob that was created earlier (from data URL or remote URL)

                // Use image-to-image endpoint with fal-ai provider
                const result = await client.imageToImage({
                    model: modelConfig.id,
                    provider: modelConfig.provider as any,
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

        // Handle image-to-video generation
        if (modelConfig.type === "image-to-video") {
            console.log('[HF-API] Processing image-to-video request');

            // Get video prompt from params
            const videoPrompt = body.params?.videoPrompt || "Subtle movement and natural motion";
            const duration = body.params?.duration || 4;

            // Need input image for image-to-video
            if (!body.image) {
                return NextResponse.json(
                    { error: "Image-to-video requires an input image. Connect an image source to the VIDEO node." },
                    { status: 400 }
                );
            }

            // Get the image as a URL (for fal-ai, we need a URL not blob)
            const imageUrl = body.image;
            if (body.image.startsWith('/') && !body.image.startsWith('//')) {
                // Local path - this won't work for external API
                return NextResponse.json(
                    { error: "Please send the image as a data URL or remote URL for video generation." },
                    { status: 400 }
                );
            }


            try {
                // fal-ai video generation via HuggingFace routed provider
                // Using the providerId which contains the actual fal-ai endpoint
                console.log('[HF-API] Calling fal-ai video generation:', modelConfig.providerId);
                console.log('[HF-API] Image URL type:', imageUrl.startsWith('data:') ? 'base64' : 'url');
                console.log('[HF-API] Prompt:', videoPrompt);
                console.log('[HF-API] Duration:', duration);

                // For fal-ai routed providers, we use the HF inference API with provider routing
                // The format follows fal-ai's expected input structure
                const response = await fetch('https://router.huggingface.co/fal-ai/' + modelConfig.providerId.replace('fal-ai/', ''), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hfToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        image_url: imageUrl,
                        prompt: videoPrompt,
                        num_frames: Math.round(duration * 8), // ~8 fps
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[HF-API] Video generation error:', response.status, errorText);

                    // Try to parse error as JSON for better error messages
                    let errorMessage = errorText;
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.error || errorJson.message || errorText;
                    } catch {
                        // Keep original error text
                    }

                    return NextResponse.json(
                        { error: `Video generation failed: ${errorMessage}. Note: Video generation requires HuggingFace Pro subscription for fal-ai access.` },
                        { status: response.status }
                    );
                }

                // Check if response is JSON (for async/queued jobs) or binary (video)
                const contentType = response.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    // fal-ai often returns JSON with a URL to the generated video
                    const result = await response.json();
                    console.log('[HF-API] Video generation result:', result);

                    if (result.video?.url) {
                        // Return the video URL directly
                        return NextResponse.json({ video: result.video.url });
                    } else if (result.output?.video) {
                        return NextResponse.json({ video: result.output.video });
                    } else if (result.url) {
                        return NextResponse.json({ video: result.url });
                    } else {
                        return NextResponse.json(
                            { error: 'Video generation succeeded but no video URL was returned' },
                            { status: 500 }
                        );
                    }
                } else {
                    // Direct binary video response
                    const videoBlob = await response.blob();
                    const arrayBuffer = await videoBlob.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    const dataUrl = `data:video/mp4;base64,${base64}`;
                    return NextResponse.json({ video: dataUrl });
                }
            } catch (videoError: any) {
                console.error('[HF-API] Image-to-video error:', videoError);
                return NextResponse.json(
                    { error: `Failed to generate video: ${videoError.message || 'Unknown error'}. Make sure you have a HuggingFace Pro subscription for video generation.` },
                    { status: 500 }
                );
            }
        }

        // Handle text-to-video generation
        if (modelConfig.type === "text-to-video") {
            console.log('[HF-API] Processing text-to-video request');

            const videoPrompt = body.params?.videoPrompt || body.prompt || "A beautiful scene with gentle motion";
            const duration = body.params?.duration || 4;

            try {
                console.log('[HF-API] Calling fal-ai text-to-video:', modelConfig.providerId);
                console.log('[HF-API] Prompt:', videoPrompt);
                console.log('[HF-API] Duration:', duration);

                const response = await fetch('https://router.huggingface.co/fal-ai/' + modelConfig.providerId.replace('fal-ai/', ''), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hfToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: videoPrompt,
                        num_frames: Math.round(duration * 8), // ~8 fps
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[HF-API] Text-to-video error:', response.status, errorText);

                    let errorMessage = errorText;
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.error || errorJson.message || errorText;
                    } catch {
                        // Keep original error text
                    }

                    return NextResponse.json(
                        { error: `Video generation failed: ${errorMessage}. Note: Video generation requires HuggingFace Pro subscription for fal-ai access.` },
                        { status: response.status }
                    );
                }

                // Check if response is JSON or binary
                const contentType = response.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    const result = await response.json();
                    console.log('[HF-API] Text-to-video result:', result);

                    if (result.video?.url) {
                        return NextResponse.json({ video: result.video.url });
                    } else if (result.output?.video) {
                        return NextResponse.json({ video: result.output.video });
                    } else if (result.url) {
                        return NextResponse.json({ video: result.url });
                    } else {
                        return NextResponse.json(
                            { error: 'Video generation succeeded but no video URL was returned' },
                            { status: 500 }
                        );
                    }
                } else {
                    const videoBlob = await response.blob();
                    const arrayBuffer = await videoBlob.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    const dataUrl = `data:video/mp4;base64,${base64}`;
                    return NextResponse.json({ video: dataUrl });
                }
            } catch (videoError: any) {
                console.error('[HF-API] Text-to-video error:', videoError);
                return NextResponse.json(
                    { error: `Failed to generate video: ${videoError.message || 'Unknown error'}. Make sure you have a HuggingFace Pro subscription for video generation.` },
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
