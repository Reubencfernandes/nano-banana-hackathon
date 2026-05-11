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
    const { prompt, apiToken, openaiApiToken, model } = (await req.json()) as {
      prompt?: string;
      apiToken?: string;
      openaiApiToken?: string;
      model?: string;
    };

    // Validate required prompt parameter
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    const requestedModel = model || "gemini-2.5-flash-image-preview";
    const provider: "gemini" | "openai" = requestedModel.startsWith("gpt-") ? "openai" : "gemini";

    // OpenAI branch: Responses API + image_generation tool
    if (provider === "openai") {
      if (!openaiApiToken) {
        return NextResponse.json(
          { error: "OpenAI API key required. Please enter your OpenAI API key in the top right." },
          { status: 401 }
        );
      }

      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiToken}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: prompt,
          tools: [{ type: "image_generation" }],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        return NextResponse.json(
          { error: `OpenAI API error (${res.status}): ${txt}` },
          { status: 500 }
        );
      }

      const json: any = await res.json();
      const output: any[] = json?.output || [];
      const images: string[] = [];
      const texts: string[] = [];
      for (const item of output) {
        if (item?.type === "image_generation_call" && item?.result) {
          images.push(`data:image/png;base64,${item.result}`);
        } else if (item?.type === "message") {
          for (const p of (item?.content || [])) {
            if (p?.text) texts.push(p.text);
          }
        }
      }
      return NextResponse.json({ images, text: texts.join("\n") });
    }

    // Gemini branch
    const apiKey = apiToken || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      return NextResponse.json(
        { error: "Gemini API key not provided. Please enter your Google Gemini API key in the top right. Get your key from: https://aistudio.google.com/app/apikey" },
        { status: 401 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: requestedModel,
      contents: prompt,
    });

    const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    const texts: string[] = [];

    for (const part of parts) {
      if (part?.inlineData?.data) {
        images.push(`data:image/png;base64,${part.inlineData.data}`);
      } else if (part?.text) {
        texts.push(part.text as string);
      }
    }

    return NextResponse.json({ images, text: texts.join("\n") });

  } catch (err) {
    console.error("/api/generate error", err);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}

