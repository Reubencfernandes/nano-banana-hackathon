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
        
        try {
          const parsed = await toInlineDataFromAny(url);
          if (!parsed) {
            console.error(`[MERGE] Failed to parse image ${i + 1}:`, url.substring(0, 100));
            continue;
          }
          mergeParts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
        } catch (error) {
          console.error(`[MERGE] Error processing image ${i + 1}:`, error);
        }
      }
      

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

    // Debug: Log all received parameters

    // We'll collect additional inline image parts (references)
    const referenceParts: { inlineData: { mimeType: string; data: string } }[] = [];
    
    // Background modifications
    if (params.backgroundType) {
      const bgType = params.backgroundType;
      
      if (bgType === "color") {
        prompts.push(`Change the background to a solid ${params.backgroundColor || "white"} background with smooth, even color coverage.`);
        
      } else if (bgType === "gradient") {
        const direction = params.gradientDirection || "to right";
        const startColor = params.gradientStartColor || "#ff6b6b";
        const endColor = params.gradientEndColor || "#4ecdc4";
        
        if (direction === "radial") {
          prompts.push(`Replace the background with a radial gradient that starts with ${startColor} in the center and transitions smoothly to ${endColor} at the edges, creating a circular gradient effect.`);
        } else {
          prompts.push(`Replace the background with a linear gradient flowing ${direction}, starting with ${startColor} and smoothly transitioning to ${endColor}.`);
        }
        
      } else if (bgType === "image") {
        prompts.push(`Change the background to ${params.backgroundImage || "a beautiful beach scene"}.`);
        
      } else if (bgType === "city") {
        const sceneType = params.citySceneType || "busy_street";
        const timeOfDay = params.cityTimeOfDay || "daytime";
        
        let cityDescription = "";
        
        switch (sceneType) {
          case "busy_street":
            cityDescription = "a realistic busy city street with people walking at various distances around the main character. Include pedestrians in business attire, casual clothing, carrying bags and phones - some walking close by (appearing similar size to main character), others further in the background (appearing smaller due to distance). Show urban storefronts, traffic lights, street signs, and parked cars with authentic city atmosphere and proper depth perception";
            break;
          case "tokyo_shibuya":
            cityDescription = "the iconic Tokyo Shibuya Crossing with people walking at various distances around the main character. Include people close by (similar scale to main character) and others further away (smaller due to distance), Japanese signage, neon advertisements, the famous scramble crossing zebra stripes, people in typical Tokyo fashion, some wearing masks, carrying colorful umbrellas. Show the massive LED screens, buildings towering above, and create proper depth with people at different distances creating natural perspective";
            break;
          case "tokyo_subway":
            cityDescription = "a realistic Tokyo subway environment with commuters at various distances from the main character. Include people nearby (similar scale) and others further down corridors (smaller due to perspective), authentic Japanese subway tile walls, directional signage in Japanese, the distinctive Tokyo Metro design aesthetic, and proper depth showing the underground transit system's scale and architecture";
            break;
          case "times_square":
            cityDescription = "Times Square NYC with bright LED billboards, street performers, tourists, and New Yorkers walking closely around the main character. Include authentic yellow taxi cabs, hot dog vendors, people taking selfies, Broadway theater marquees, the famous red steps, TKTS booth, and the overwhelming sensory experience of NYC's most famous intersection";
            break;
          case "downtown_skyline":
            cityDescription = "a downtown city skyline with tall buildings, glass towers, and urban architecture in the background while people in business attire walk nearby on the sidewalk";
            break;
          case "urban_crosswalk":
            cityDescription = "an urban crosswalk intersection with pedestrians of diverse backgrounds crossing around the main character, traffic lights, crosswalk signals, city buses, and the natural flow of city foot traffic";
            break;
          case "shopping_district":
            cityDescription = "a bustling shopping district with people carrying shopping bags walking near the main character, storefront window displays, outdoor cafes, street vendors, and the lively atmosphere of commercial city life";
            break;
          case "city_park":
            cityDescription = "a city park with people jogging, walking dogs, and families enjoying activities around the main character, with urban skyscrapers visible in the background through the trees";
            break;
          case "rooftop_view":
            cityDescription = "a rooftop terrace with people socializing around the main character, overlooking a sprawling city skyline with twinkling lights and urban architecture stretching to the horizon";
            break;
          case "blade_runner_street":
            cityDescription = "a cinematic Blade Runner-inspired street scene with neon-soaked alleyways, people in futuristic clothing walking through steam and rain around the main character. Include holographic advertisements, flying vehicles in the distance, Asian-influenced signage, dark atmospheric lighting with cyan and magenta neon reflections on wet pavement, and the dystopian cyberpunk aesthetic of the iconic film";
            break;
          case "matrix_alley":
            cityDescription = "a Matrix-inspired urban alley with people in dark clothing and sunglasses walking purposefully around the main character. Include the distinctive green-tinted lighting, concrete brutalist architecture, fire escapes, urban decay, shadowy doorways, and the cold, digital atmosphere of the Matrix films with realistic but slightly stylized cinematography";
            break;
          default:
            cityDescription = "a dynamic city environment with people walking naturally around the main character in an authentic urban setting";
        }
        
        let timeDescription = "";
        switch (timeOfDay) {
          case "golden_hour":
            timeDescription = " during golden hour with warm, glowing sunlight";
            break;
          case "daytime":
            timeDescription = " during bright daytime with clear lighting";
            break;
          case "blue_hour":
            timeDescription = " during blue hour with twilight atmosphere";
            break;
          case "night":
            timeDescription = " at night with city lights, illuminated windows, and neon glow";
            break;
          case "dawn":
            timeDescription = " at dawn with soft morning light";
            break;
          case "overcast":
            timeDescription = " on an overcast day with diffused lighting";
            break;
          default:
            timeDescription = "";
        }
        
        prompts.push(`Replace the background with ${cityDescription}${timeDescription}. CRITICAL SCALE REQUIREMENTS: Keep the main character at their EXACT original size and position - do NOT make them smaller or change their scale. The background people should be appropriately sized relative to their distance from the camera, with people closer to the camera appearing larger and people further away appearing smaller, but the main character must maintain their original proportions. Ensure the main character appears naturally integrated into the scene with proper lighting, shadows, and perspective that matches the environment.`);
        
      } else if (bgType === "photostudio") {
        const setup = params.studioSetup || "white_seamless";
        const lighting = params.studioLighting || "key_fill";
        const faceCamera = params.faceCamera || false;
        
        let setupDescription = "";
        switch (setup) {
          case "white_seamless":
            setupDescription = "a professional white seamless paper backdrop";
            break;
          case "black_seamless":
            setupDescription = "a professional black seamless paper backdrop";
            break;
          case "grey_seamless":
            setupDescription = "a professional grey seamless paper backdrop";
            break;
          case "colored_seamless":
            const bgColor = params.studioBackgroundColor || "#ffffff";
            setupDescription = `a professional seamless paper backdrop in ${bgColor}`;
            break;
          case "textured_backdrop":
            setupDescription = "a professional textured photography backdrop";
            break;
          case "infinity_cove":
            setupDescription = "a professional infinity cove studio setup with curved backdrop";
            break;
          default:
            setupDescription = "a professional studio backdrop";
        }
        
        let lightingDescription = "";
        switch (lighting) {
          case "key_fill":
            lightingDescription = "key and fill lighting for balanced illumination";
            break;
          case "three_point":
            lightingDescription = "three-point lighting with key, fill, and rim lights";
            break;
          case "beauty_lighting":
            lightingDescription = "beauty lighting setup with soft, flattering illumination";
            break;
          case "dramatic_lighting":
            lightingDescription = "dramatic single-light setup with strong shadows";
            break;
          case "soft_lighting":
            lightingDescription = "soft, diffused lighting for gentle illumination";
            break;
          case "hard_lighting":
            lightingDescription = "hard, directional lighting for sharp shadows and contrast";
            break;
          default:
            lightingDescription = "professional studio lighting";
        }
        
        const positioningInstruction = faceCamera ? " Position the person to face directly toward the camera with confident posture." : "";
        
        prompts.push(`Crop the head and create a 2-inch ID photo. Place the person in a professional photo studio with ${setupDescription} and ${lightingDescription}. Create a clean, professional portrait setup with proper studio atmosphere.${positioningInstruction}`);
        
      } else if (bgType === "upload" && params.customBackgroundImage) {
        prompts.push(`Replace the background using the provided custom background reference image (attached below). Ensure perspective and lighting match.`);
        const bgRef = await toInlineDataFromAny(params.customBackgroundImage);
        if (bgRef) referenceParts.push({ inlineData: bgRef });
        
      } else if (bgType === "custom" && params.customPrompt) {
        prompts.push(`${params.customPrompt}. CRITICAL SCALE REQUIREMENTS: Keep the main character at their EXACT original size and position - do NOT make them smaller or change their scale. Ensure the main character appears naturally integrated into the scene with proper lighting, shadows, and perspective that matches the environment.`);
      }
    }
    
    // Clothes modifications
    if (params.clothesImage) {
      
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
        "90s-anime": "Transform into vibrant 90s anime art style",
        "mha": "Convert into My Hero Academia anime style ",
        "spiderverse": "Convert into Spiderverse anime style",
        "dbz": "Convert into Dragon Ball Z anime style ",
        "ukiyo-e": "Convert into traditional Japanese Ukiyo-e woodblock print style with flat color planes, bold black outlines, stylized natural elements, limited color palette of blues and earth tones, geometric patterns, and the distinctive floating world aesthetic of Edo period art",
        "cubism": "Convert into Cubist art style with geometric fragmentation and angular decomposition, use various different colors",
        "van-gogh": "Convert into Post-Impressionist Van Gogh style with thick impasto paint texture, bold swirling brushstrokes that create dynamic movement, vibrant yellows and deep blues with expressive non-naturalistic color choices, visible three-dimensional brush marks, and the characteristic flowing patterns and emotional intensity seen in masterworks like Starry Night",
        "simpsons": "Convert into The Simpsons cartoon style ",
        "family-guy": "Convert into Family Guy animation style",
        "pixar": "Convert into Pixar animation style",
        "manga": "Convert into Manga style",
       
       
      };
      
      const styleDescription = styleMap[params.stylePreset];
      if (styleDescription) {
        prompts.push(`${styleDescription}. Apply this style transformation at ${strength}% intensity while preserving the core subject matter.`);
      } else {
        console.error(`[API] Style not found in styleMap: ${params.stylePreset}`);
      }
    }
    
    // Edit prompt
    if (params.editPrompt) {
      prompts.push(params.editPrompt);
    }
    
    // Camera settings - Enhanced for Gemini 2.5 Flash Image
    if (params.focalLength || params.aperture || params.shutterSpeed || params.whiteBalance || params.angle || 
        params.iso || params.filmStyle || params.lighting || params.bokeh || params.composition || params.motionBlur) {
      // Build cinematic camera prompt for professional, movie-like results
      let cameraPrompt = "CINEMATIC CAMERA TRANSFORMATION: Transform this image into a professional, cinematic photograph with movie-quality production values";
      
      // 1. Focal Length (Lens Choice) - First priority as it defines perspective
      if (params.focalLength) {
        if (params.focalLength === "8mm") {
          cameraPrompt += " shot with an ultra-wide 8mm fisheye lens creating dramatic barrel distortion, immersive perspective, and cinematic edge curvature typical of action sequences";
        } else if (params.focalLength === "14mm") {
          cameraPrompt += " captured with a 14mm ultra-wide angle lens for sweeping cinematic vistas and dramatic environmental context";
        } else if (params.focalLength === "24mm") {
          cameraPrompt += " shot with a 24mm wide-angle cinema lens for establishing shots with expansive field of view and slight perspective enhancement";
        } else if (params.focalLength === "35mm") {
          cameraPrompt += " filmed with a 35mm lens providing natural cinematic perspective, the gold standard for narrative storytelling";
        } else if (params.focalLength === "50mm") {
          cameraPrompt += " captured with a 50mm cinema lens for authentic human vision perspective and natural depth rendering";
        } else if (params.focalLength === "85mm") {
          cameraPrompt += " shot with an 85mm portrait cinema lens for intimate character close-ups with beautiful subject isolation and compressed backgrounds";
        } else if (params.focalLength === "100mm") {
          cameraPrompt += " filmed with a 100mm telephoto lens for dramatic compression and cinematic subject isolation";
        } else if (params.focalLength === "135mm") {
          cameraPrompt += " captured with a 135mm telephoto cinema lens for extreme compression and dreamlike background separation";
        } else {
          cameraPrompt += ` shot with professional ${params.focalLength} cinema glass`;
        }
      }
      
      // 2. Aperture (Depth of Field Control) - Core exposure triangle component
      if (params.aperture) {
        if (params.aperture === "f/0.95") {
          cameraPrompt += `, shot wide open at f/0.95 for extreme shallow depth of field, ethereal bokeh, and cinematic subject isolation with dreamy background blur`;
        } else if (params.aperture === "f/1.2") {
          cameraPrompt += `, captured at f/1.2 for beautiful shallow depth of field, creating that signature cinematic look with smooth background separation and creamy bokeh`;
        } else if (params.aperture === "f/1.4") {
          cameraPrompt += `, shot at f/1.4 for controlled shallow depth of field, maintaining subject sharpness while creating pleasing background blur and professional bokeh quality`;
        } else if (params.aperture === "f/1.8") {
          cameraPrompt += `, captured at f/1.8 for balanced depth of field, keeping key subjects sharp while maintaining smooth background separation and natural bokeh`;
        } else if (params.aperture === "f/2") {
          cameraPrompt += `, shot at f/2 for moderate depth of field with excellent subject isolation, maintaining cinematic quality and professional sharpness`;
        } else if (params.aperture === "f/2.8") {
          cameraPrompt += `, photographed at f/2.8 for optimal lens sharpness with controlled depth of field, ideal for professional portrait and documentary work`;
        } else if (params.aperture === "f/4") {
          cameraPrompt += `, captured at f/4 for extended depth of field with excellent overall sharpness, perfect for group portraits and environmental photography`;
        } else if (params.aperture === "f/5.6") {
          cameraPrompt += `, shot at f/5.6 for deep focus with maximum lens sharpness, ideal for landscape and architectural photography where detail is paramount`;
        } else if (params.aperture === "f/8") {
          cameraPrompt += `, photographed at f/8 for optimal depth of field and corner-to-corner sharpness, the sweet spot for landscape and travel photography`;
        } else if (params.aperture === "f/11") {
          cameraPrompt += `, captured at f/11 for extensive depth of field with front-to-back sharpness, perfect for sweeping landscapes and architectural details`;
        } else if (params.aperture === "f/16") {
          cameraPrompt += `, shot at f/16 for maximum depth of field with hyperfocal distance focusing, ensuring sharp detail from foreground to infinity`;
        } else if (params.aperture === "f/22") {
          cameraPrompt += `, photographed at f/22 for extreme depth of field with starburst effects on light sources, creating dramatic landscape and architectural imagery`;
        } else {
          cameraPrompt += `, professionally exposed at ${params.aperture} with carefully controlled depth of field for optimal image quality`;
        }
      }
      
      // 3. Shutter Speed (Motion Control) - Core exposure triangle component
      if (params.shutterSpeed) {
        if (params.shutterSpeed === "1/1000s") {
          cameraPrompt += ", captured at 1/1000s shutter speed to freeze fast action and eliminate motion blur with tack-sharp precision";
        } else if (params.shutterSpeed === "1/250s") {
          cameraPrompt += ", shot at 1/250s shutter speed for optimal handheld photography with sharp subjects and minimal camera shake";
        } else if (params.shutterSpeed === "1/30s") {
          cameraPrompt += ", photographed at 1/30s shutter speed creating subtle motion blur while maintaining subject recognition";
        } else if (params.shutterSpeed === "1/15s") {
          cameraPrompt += ", captured at 1/15s shutter speed for intentional motion blur effects and dynamic movement trails";
        } else if (params.shutterSpeed === "5s") {
          cameraPrompt += ", shot with 5-second long exposure creating smooth motion blur, light trails, and ethereal atmospheric effects";
        } else {
          cameraPrompt += `, captured with ${params.shutterSpeed} shutter speed for controlled motion and exposure effects`;
        }
      }
      
      // 4. ISO (Sensor Sensitivity) - Final exposure triangle component
      if (params.iso) {
        if (params.iso === "ISO 100") {
          cameraPrompt += ", shot at ISO 100 for pristine image quality, zero noise, and maximum dynamic range typical of high-end cinema cameras";
        } else if (params.iso === "ISO 400") {
          cameraPrompt += ", filmed at ISO 400 for balanced exposure with minimal noise, the sweet spot for most cinematic scenarios";
        }  else if (params.iso === "ISO 1600") {
          cameraPrompt += ", captured at ISO 1600 with controlled grain for dramatic low-light cinematography and moody atmosphere";
        } else if (params.iso === "ISO 6400") {
          cameraPrompt += ", filmed at ISO 6400 with artistic grain structure for gritty, realistic cinema aesthetics";
        } else {
          cameraPrompt += `, shot at ${params.iso} with appropriate noise characteristics`;
        }
      }
      
      // 5. White Balance (Color Temperature) - Color accuracy foundation
      if(params.whiteBalance) {
        cameraPrompt += `, shot with ${params.whiteBalance} white balance`;
      }
      
      // 6. Lighting Setup (Illumination Style) - Mood and atmosphere
      if (params.lighting) {
        if (params.lighting === "Natural Light") {
          cameraPrompt += ", naturally lit with soft, diffused daylight providing even illumination and organic shadow patterns";
        } else if (params.lighting === "Golden Hour") {
          cameraPrompt += ", cinematically lit during golden hour with warm, directional sunlight creating magical rim lighting, long shadows, and that coveted cinematic glow";
        } else if (params.lighting === "Blue Hour") {
          cameraPrompt += ", captured during blue hour with soft, even twilight illumination and cool color temperature for moody cinematic atmosphere";
        } else if (params.lighting === "Studio Lighting") {
          cameraPrompt += ", professionally lit with multi-point studio lighting setup featuring key light, fill light, and rim light for commercial cinema quality";
        } else if (params.lighting === "Rembrandt") {
          cameraPrompt += ", lit with Rembrandt lighting creating a distinctive triangle of light on the cheek with dramatic chiaroscuro contrast between light and shadow";
        } else if (params.lighting === "Split Lighting") {
          cameraPrompt += ", illuminated with split lighting dividing the face into equal halves of light and shadow for dramatic and mysterious effect";
        } else if (params.lighting === "Butterfly Lighting") {
          cameraPrompt += ", lit with butterfly lighting from above creating a butterfly-shaped shadow under the nose for flattering beauty and glamour portraits";
        } else if (params.lighting === "Loop Lighting") {
          cameraPrompt += ", illuminated with loop lighting creating a small loop-shaped shadow from the nose for natural and versatile portrait lighting";
        } else if (params.lighting === "Rim Lighting") {
          cameraPrompt += ", backlit with rim lighting creating a glowing outline around the subject for dramatic separation and three-dimensional depth";
        } else if (params.lighting === "Silhouette") {
          cameraPrompt += ", backlit for silhouette effect with the subject outlined against bright background while facial details remain in shadow";
        } else if (params.lighting === "High Key") {
          cameraPrompt += ", lit with high-key lighting using bright, even illumination with minimal shadows for optimistic and clean aesthetic";
        } else if (params.lighting === "Low Key") {
          cameraPrompt += ", dramatically lit with low-key lighting emphasizing deep shadows and high contrast for moody and mysterious atmosphere";
        } else {
          cameraPrompt += `, professionally lit with ${params.lighting} lighting setup`;
        }
      }
      
      // 7. Camera Angle (Perspective and Composition) - Visual storytelling
      if (params.angle) {
        if (params.angle === "low angle") {
          cameraPrompt += ", shot from a low-angle perspective looking upward to convey power, dominance, and heroic stature";
        } else if (params.angle === "bird's eye") {
          cameraPrompt += ", captured from a bird's eye view directly overhead to show scale, context, and spatial relationships";
        } else if (params.angle === "high angle") {
          cameraPrompt += ", shot from a high-angle perspective looking downward to create vulnerability and diminish subject importance";
        } else if (params.angle === "eye level") {
          cameraPrompt += ", shot from eye level for a neutral, natural perspective that connects with the viewer";
        } else if (params.angle === "over the shoulder") {
          cameraPrompt += ", captured from an over-the-shoulder angle to establish character relationships and dialogue dynamics";
        } else if (params.angle === "POV") {
          cameraPrompt += ", shot from a first-person POV perspective to immerse the viewer in the subject's experience";
        } else if (params.angle === "Dutch tilt") {
          cameraPrompt += ", shot with a Dutch tilt angle creating diagonal lines to convey unease, tension, and disorientation";
        } else if (params.angle === "worm's eye") {
          cameraPrompt += ", captured from a worm's eye view at ground level looking up for extreme dramatic impact and scale";
        } else {
          cameraPrompt += `, shot from ${params.angle} camera angle`;
        }
      }
      
      // 8. Bokeh Quality (Out-of-Focus Rendering) - Aesthetic enhancement
      if (params.bokeh) {
        if (params.bokeh === "Smooth Bokeh") {
          cameraPrompt += ", featuring silky smooth bokeh with perfectly circular out-of-focus highlights and creamy background transitions";
        } else if (params.bokeh === "Swirly Bokeh") {
          cameraPrompt += ", featuring artistic swirly bokeh with spiral-like background blur patterns and rotational distortion effects typical of vintage Petzval-style lenses";
        } else if (params.bokeh === "Hexagonal Bokeh") {
          cameraPrompt += ", featuring hexagonal bokeh with geometric six-sided highlight shapes formed by straight aperture blades typical of cinema lenses";
        } else if (params.bokeh === "Cat Eye Bokeh") {
          cameraPrompt += ", featuring cat's eye bokeh with elliptical highlight distortion toward frame edges caused by optical vignetting and field curvature";
        } else if (params.bokeh === "Bubble Bokeh") {
          cameraPrompt += ", featuring soap bubble bokeh with bright-edged circular highlights and hollow centers characteristic of Meyer Optik Trioplan lenses";
        } else if (params.bokeh === "Creamy Bokeh") {
          cameraPrompt += ", featuring creamy bokeh with smooth gradient transitions and soft edge rendering for professional portrait aesthetics";
        } else {
          cameraPrompt += `, featuring ${params.bokeh} quality bokeh rendering in out-of-focus areas`;
        }
      }
      
      // 9. Motion Blur Effects (Dynamic Movement) - Creative motion control
      if (params.motionBlur) {
        if (params.motionBlur === "Light Motion Blur") {
          cameraPrompt += ", with subtle motion blur suggesting gentle movement and adding cinematic flow to the image";
        } else if (params.motionBlur === "Medium Motion Blur") {
          cameraPrompt += ", with moderate motion blur creating dynamic energy and sense of movement typical of action cinematography";
        } else if (params.motionBlur === "Heavy Motion Blur") {
          cameraPrompt += ", with pronounced motion blur creating dramatic movement streaks and high-energy cinematic action, giving the moving background subjects a sense of motion blur movement";
        } else if (params.motionBlur === "Radial Blur") {
          cameraPrompt += ", with radial motion blur emanating from the center, creating explosive zoom-like movement and dramatic focus pull";
        } else if (params.motionBlur === "Zoom Blur") {
          cameraPrompt += ", with zoom blur effect creating dramatic speed lines and kinetic energy radiating outward from the subject";
        } else {
          cameraPrompt += `, with ${params.motionBlur} motion effect`;
        }
      }
      
      // 10. Film Style Processing (Post-Production Look) - Final aesthetic treatment
      if (params.filmStyle && params.filmStyle !== "RAW") {
        cameraPrompt += `, processed with ${params.filmStyle} film aesthetic and color grading`;
      } else if (params.filmStyle === "RAW") {
        cameraPrompt += ", with natural RAW processing maintaining realistic colors and contrast";
      }
      
      cameraPrompt += ". Maintain photorealistic quality with authentic camera characteristics, natural lighting, and professional composition.";
      
      prompts.push(cameraPrompt);
    }
    
    // Age transformation
    if (params.targetAge) {
      prompts.push(`Transform the person to look exactly ${params.targetAge} years old with age-appropriate features.`);
    }
    
    // Lighting effects
    if (params.lightingPrompt && params.selectedLighting) {
      prompts.push(`IMPORTANT: Completely transform the lighting on this person to match this exact description: ${params.lightingPrompt}. The lighting change should be dramatic and clearly visible. Keep their face, clothes, pose, and background exactly the same, but make the lighting transformation very obvious.`);
    }
    
    // Pose modifications
    if (params.posePrompt && params.selectedPose) {
      prompts.push(`IMPORTANT: Completely change the person's body pose to match this exact description: ${params.posePrompt}. The pose change should be dramatic and clearly visible. Keep their face, clothes, and background exactly the same, but make the pose transformation very obvious.`);
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
      if (face.selectedMakeup) modifications.push(`add a face makeup with red colors on cheeks and and some yellow blue colors around the eye area`);
      
      if (modifications.length > 0) {
        prompts.push(`Face modifications: ${modifications.join(", ")}`);
      }
    }
    
    // Combine all prompts
    let prompt = prompts.length > 0 
      ? prompts.join("\n\n") + "\nApply all these modifications while maintaining the person's identity and keeping unspecified aspects unchanged."
      : "Process this image with high quality output.";

    // Add the custom prompt if provided
    if (body.prompt) {
      prompt = body.prompt + "\n\n" + prompt;
    }

    // Debug: Log the final combined prompt and parts structure

    // Generate with Gemini
    const parts = [
      { text: prompt },
      // Primary subject image (input) - this is the person whose clothes will be changed
      { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
      // Additional reference images to guide modifications (e.g., clothes to copy)
      ...referenceParts,
    ];

    
    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: parts,
      });
    } catch (geminiError: any) {
      console.error('[API] Gemini API error:', geminiError);
      console.error('[API] Gemini error details:', {
        message: geminiError.message,
        status: geminiError.status,
        code: geminiError.code
      });
      
      if (geminiError.message?.includes('safety')) {
        return NextResponse.json(
          { error: "Content was blocked by safety filters. Try using different images or prompts." },
          { status: 400 }
        );
      }
      
      if (geminiError.message?.includes('quota') || geminiError.message?.includes('limit')) {
        return NextResponse.json(
          { error: "API quota exceeded. Please check your Gemini API usage limits." },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: `Gemini API error: ${geminiError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    
    const outParts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
    const images: string[] = [];
    const texts: string[] = [];
    
    
    for (let i = 0; i < outParts.length; i++) {
      const p = outParts[i];
      
      if (p?.inlineData?.data) {
        images.push(`data:image/png;base64,${p.inlineData.data}`);
      }
      
      if (p?.text) {
        texts.push(p.text);
      }
    }

    if (!images.length) {
      console.error('[API] No images generated by Gemini. Text responses:', texts);
      return NextResponse.json(
        { 
          error: "No image generated. Try adjusting your parameters.", 
          textResponse: texts.join('\n'),
          debugInfo: {
            partsCount: outParts.length,
            candidatesCount: (response as any)?.candidates?.length || 0,
            hasResponse: !!response
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: images[0] });
  } catch (err: any) {
    console.error("/api/process error:", err);
    console.error("Error stack:", err?.stack);
    console.error("Error details:", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
      details: err?.details
    });
    
    // Provide more specific error messages
    if (err?.message?.includes('payload size') || err?.code === 413) {
      return NextResponse.json(
        { error: "Image data too large. Please use smaller images or reduce image quality." },
        { status: 413 }
      );
    }
    
    if (err?.message?.includes('API key') || err?.message?.includes('authentication')) {
      return NextResponse.json(
        { error: "Invalid API key. Please check your Google Gemini API token." },
        { status: 401 }
      );
    }
    
    if (err?.message?.includes('quota') || err?.message?.includes('limit')) {
      return NextResponse.json(
        { error: "API quota exceeded. Please check your Google Gemini API usage limits." },
        { status: 429 }
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
