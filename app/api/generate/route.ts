/**
 * API ROUTE: /api/generate
 * 
 * Text-to-image generation endpoint using Google's Gemini AI model.
 * Generates new images from natural language descriptions.
 * 
 * Input: JSON with text prompt and optional API token
 * Output: JSON with generated image(s) as base64 data URLs
 * 
 * Example usage:
 * POST /api/generate
 * { "prompt": "A professional portrait photo of a person in business attire" }
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Configure Next.js runtime for Node.js (required for Google AI SDK)
export const runtime = "nodejs";

/**
 * Handle POST requests for image generation
 * 
 * @param req NextJS request object with JSON body containing prompt and optional API token
 * @returns JSON response with generated images or error message
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const { prompt, apiToken } = (await req.json()) as { prompt?: string; apiToken?: string };
    
    // Validate required prompt parameter
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    // Validate and retrieve API key from user input or environment
    const apiKey = apiToken || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json(
        { error: "API key not provided. Please enter your Hugging Face API token in the top right corner or add GOOGLE_API_KEY to .env.local file. Get your key from: https://aistudio.google.com/app/apikey" },
        { status: 500 }
      );
    }

    // Initialize Google AI client
    const ai = new GoogleGenAI({ apiKey });

    // Generate image using Gemini's image generation model
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",  // Latest image generation model
      contents: prompt,                         // Natural language description
    });

    // Parse response to extract images and text
    const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];  // Array to store generated images as data URLs
    const texts: string[] = [];   // Array to store any text responses

    // Process each part of the response
    for (const part of parts) {
      if (part?.inlineData?.data) {
        // Convert base64 image data to data URL format
        images.push(`data:image/png;base64,${part.inlineData.data}`);
      } else if (part?.text) {
        // Collect any text explanations or descriptions
        texts.push(part.text as string);
      }
    }

    // Return generated content to client
    return NextResponse.json({ images, text: texts.join("\n") });
    
  } catch (err) {
    console.error("/api/generate error", err);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

