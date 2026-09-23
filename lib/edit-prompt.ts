/**
 * Shared prompt builder for node edits.
 *
 * Turns the accumulated node parameters (background, clothes, style, camera,
 * angle, age, lighting, pose, face) into a single text prompt, plus any
 * reference images the nodes attached (clothes reference, uploaded background).
 * Used by both /api/process (Gemini / OpenAI) and /api/hf-process (Qwen) so
 * every provider sees the same instructions.
 */

export type InlineImage = { mimeType: string; data: string };

export async function buildEditPrompt(
  params: any,
  basePrompt: string | undefined,
  resolveImage: (url: string) => Promise<InlineImage | null>,
): Promise<{ prompt: string; references: InlineImage[] }> {
  const prompts: string[] = [];
  const references: InlineImage[] = [];
  params = params || {};

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
      const bgRef = await resolveImage(params.customBackgroundImage);
      if (bgRef) references.push(bgRef);

    } else if (bgType === "custom" && params.customPrompt) {
      prompts.push(`${params.customPrompt}. CRITICAL SCALE REQUIREMENTS: Keep the main character at their EXACT original size and position - do NOT make them smaller or change their scale. Ensure the main character appears naturally integrated into the scene with proper lighting, shadows, and perspective that matches the environment.`);
    }
  }

  // Clothes modifications
  if (params.clothesImage || params.clothesPrompt) {
    // Build the prompt based on what's provided
    if (params.clothesImage && params.clothesPrompt) {
      // Both image and text description provided
      prompts.push(`Take the person shown in the first image and replace their entire outfit with clothing matching this description: "${params.clothesPrompt}". Use the second reference image as a visual guide for the clothing style. The person's face, hair, body pose, and background should remain exactly the same. Only the clothing should change. Ensure the new clothes fit naturally on the person's body with realistic proportions, proper fabric draping, and lighting that matches the original photo environment.`);
    } else if (params.clothesImage) {
      // Only image provided
      if (params.selectedPreset === "Sukajan") {
        prompts.push("Replace the person's clothing with a Japanese sukajan jacket (embroidered designs). Use the clothes reference image if provided.");
      } else if (params.selectedPreset === "Blazer") {
        prompts.push("Replace the person's clothing with a professional blazer. Use the clothes reference image if provided.");
      } else {
        prompts.push(`Take the person shown in the first image and replace their entire outfit with the clothing items shown in the second reference image. The person's face, hair, body pose, and background should remain exactly the same. Only the clothing should change to match the reference clothing image. Ensure the new clothes fit naturally on the person's body with realistic proportions, proper fabric draping, and lighting that matches the original photo environment.`);
      }
    } else if (params.clothesPrompt) {
      // Only text description provided
      prompts.push(`Change the person's clothing to: ${params.clothesPrompt}. The person's face, hair, body pose, and background should remain exactly the same. Only the clothing should change. Ensure the new clothes fit naturally on the person's body with realistic proportions, proper fabric draping, and lighting that matches the original photo environment.`);
    }

    // Add the reference image if provided
    if (params.clothesImage) {
      try {
        const clothesRef = await resolveImage(params.clothesImage);
        if (clothesRef) {
          references.push(clothesRef);
        } else {
          console.error('[API] Failed to process clothes image - toInlineDataFromAny returned null');
        }
      } catch (error) {
        console.error('[API] Error processing clothes image:', error);
      }
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

    if (params.aperture) {
      if (params.aperture === "f/1.2") {
        cameraPrompt += `, shot wide open at f/1.2 for extreme shallow depth of field, ethereal bokeh, and cinematic subject isolation with dreamy background blur`;
      } else if (params.aperture === "f/1.4") {
        cameraPrompt += `, captured at f/1.4 for beautiful shallow depth of field, creating that signature cinematic look with smooth background separation`;
      } else if (params.aperture === "f/2.8") {
        cameraPrompt += `, shot at f/2.8 for controlled depth of field, maintaining subject sharpness while creating pleasing background blur`;
      } else if (params.aperture === "f/4") {
        cameraPrompt += `, filmed at f/4 for balanced depth of field, keeping key subjects sharp while maintaining some background separation`;
      } else if (params.aperture === "f/5.6") {
        cameraPrompt += `, captured at f/5.6 for extended depth of field while maintaining cinematic quality and professional sharpness`;
      } else if (params.aperture === "f/8" || params.aperture === "f/11") {
        cameraPrompt += `, shot at ${params.aperture} for deep focus cinematography with tack-sharp details throughout the entire frame`;
      } else {
        cameraPrompt += `, professionally exposed at ${params.aperture}`;
      }
    }

    if (params.iso) {
      if (params.iso === "ISO 100") {
        cameraPrompt += ", shot at ISO 100 for pristine image quality, zero noise, and maximum dynamic range typical of high-end cinema cameras";
      } else if (params.iso === "ISO 200") {
        cameraPrompt += ", captured at ISO 200 for clean shadows and optimal color reproduction with professional cinema camera characteristics";
      } else if (params.iso === "ISO 400") {
        cameraPrompt += ", filmed at ISO 400 for balanced exposure with minimal noise, the sweet spot for most cinematic scenarios";
      } else if (params.iso === "ISO 800") {
        cameraPrompt += ", shot at ISO 800 creating subtle film grain texture that adds cinematic character and organic feel";
      } else if (params.iso === "ISO 1600") {
        cameraPrompt += ", captured at ISO 1600 with controlled grain for dramatic low-light cinematography and moody atmosphere";
      } else if (params.iso === "ISO 3200") {
        cameraPrompt += ", filmed at ISO 3200 with artistic grain structure for gritty, realistic cinema aesthetics";
      } else {
        cameraPrompt += `, shot at ${params.iso} with appropriate noise characteristics`;
      }
    }

    if (params.lighting) {
      if (params.lighting === "Golden Hour") {
        cameraPrompt += ", cinematically lit during golden hour with warm, directional sunlight creating magical rim lighting, long shadows, and that coveted cinematic glow";
      } else if (params.lighting === "Blue Hour") {
        cameraPrompt += ", captured during blue hour with soft, even twilight illumination and cool color temperature for moody cinematic atmosphere";
      } else if (params.lighting === "Studio") {
        cameraPrompt += ", professionally lit with multi-point studio lighting setup featuring key light, fill light, and rim light for commercial cinema quality";
      } else if (params.lighting === "Natural") {
        cameraPrompt += ", naturally lit with soft, diffused daylight providing even illumination and organic shadow patterns";
      } else if (params.lighting === "Dramatic") {
        cameraPrompt += ", dramatically lit with high-contrast lighting creating strong shadows and highlights for cinematic tension";
      } else {
        cameraPrompt += `, professionally lit with ${params.lighting} lighting setup`;
      }
    }

    if (params.bokeh) {
      if (params.bokeh === "Smooth Bokeh") {
        cameraPrompt += ", featuring silky smooth bokeh with perfectly circular out-of-focus highlights and creamy background transitions";
      } else if (params.bokeh === "Swirly Bokeh") {
        cameraPrompt += ", featuring artistic swirly bokeh with spiral-like background blur patterns for unique visual character";
      } else if (params.bokeh === "Hexagonal Bokeh") {
        cameraPrompt += ", featuring hexagonal bokeh with geometric six-sided highlight shapes typical of cinema lenses";
      } else {
        cameraPrompt += `, featuring ${params.bokeh} quality bokeh rendering in out-of-focus areas`;
      }
    }

    if (params.motionBlur) {
      if (params.motionBlur === "Light Motion Blur") {
        cameraPrompt += ", with subtle motion blur suggesting gentle movement and adding cinematic flow to the image";
      } else if (params.motionBlur === "Medium Motion Blur") {
        cameraPrompt += ", with moderate motion blur creating dynamic energy and sense of movement typical of action cinematography";
      } else if (params.motionBlur === "Heavy Motion Blur") {
        cameraPrompt += ", with pronounced motion blur creating dramatic movement streaks and high-energy cinematic action";
      } else if (params.motionBlur === "Radial Blur") {
        cameraPrompt += ", with radial motion blur emanating from the center, creating explosive zoom-like movement and dramatic focus pull";
      } else if (params.motionBlur === "Zoom Blur") {
        cameraPrompt += ", with zoom blur effect creating dramatic speed lines and kinetic energy radiating outward from the subject";
      } else {
        cameraPrompt += `, with ${params.motionBlur} motion effect`;
      }
    }

    if (params.angle) {
      if (params.angle === "Low Angle") {
        cameraPrompt += ", shot from a low-angle perspective looking upward for dramatic impact";
      } else if (params.angle === "Bird's Eye") {
        cameraPrompt += ", captured from a bird's eye view directly overhead";
      } else {
        cameraPrompt += `, ${params.angle} camera angle`;
      }
    }

    if (params.filmStyle && params.filmStyle !== "RAW") {
      cameraPrompt += `, processed with ${params.filmStyle} film aesthetic and color grading`;
    } else if (params.filmStyle === "RAW") {
      cameraPrompt += ", with natural RAW processing maintaining realistic colors and contrast";
    }

    cameraPrompt += ". Maintain photorealistic quality with authentic camera characteristics, natural lighting, and professional composition.";

    prompts.push(cameraPrompt);
  }

  // Angle modifications (from AngleNode) — 3D orbit: yaw (X), pitch (Y), distance (Z)
  if (params.cameraX !== undefined && params.cameraY !== undefined) {
    const x = params.cameraX; // -1 to 1, 0 = front, ±1 = back
    const y = params.cameraY; // -1 to 1, 0 = eye level, +1 = overhead, -1 = worm's eye
    const z = typeof params.cameraZ === "number" ? params.cameraZ : 0.5; // 0..1 (close to far)

    // Horizontal direction — x=0 is front, x=±1 is back
    let horizontalDesc: string;
    const xAbs = Math.abs(x);
    if (xAbs < 0.1) {
      horizontalDesc = "directly in front, subject fully facing the camera";
    } else if (xAbs < 0.3) {
      const side = x > 0 ? "right" : "left";
      horizontalDesc = `slight ${side} angle, subject mostly facing the camera`;
    } else if (xAbs < 0.6) {
      const side = x > 0 ? "right" : "left";
      horizontalDesc = `three-quarter view from the subject's ${side} side`;
    } else if (xAbs < 0.85) {
      const side = x > 0 ? "right" : "left";
      horizontalDesc = `profile / side view from the subject's ${side}`;
    } else if (xAbs < 0.97) {
      const side = x > 0 ? "right" : "left";
      horizontalDesc = `three-quarter rear view from the subject's ${side}`;
    } else {
      horizontalDesc = "directly behind the subject, rear view";
    }

    // Vertical direction
    let verticalDesc: string;
    if (y > 0.75) verticalDesc = "extreme high angle — nearly overhead, bird's-eye view";
    else if (y > 0.4) verticalDesc = "high angle — camera above the subject looking down";
    else if (y > 0.1) verticalDesc = "slightly elevated, camera just above eye level";
    else if (y > -0.1) verticalDesc = "eye level";
    else if (y > -0.4) verticalDesc = "slightly low angle, camera just below eye level";
    else if (y > -0.75) verticalDesc = "low angle — camera below the subject looking up";
    else verticalDesc = "extreme low angle — worm's-eye view, camera pointing sharply upward";

    // Shot distance
    let shotDesc: string;
    if (z < 0.15) shotDesc = "extreme close-up (face fills the frame)";
    else if (z < 0.35) shotDesc = "close-up shot (head and shoulders)";
    else if (z < 0.55) shotDesc = "medium shot (waist up)";
    else if (z < 0.75) shotDesc = "medium-wide shot (full body with some space)";
    else shotDesc = "wide shot (full body, subject smaller in frame)";

    prompts.push(`Photograph this scene from a new camera angle: ${horizontalDesc}, ${verticalDesc}, ${shotDesc}. Adjust the perspective, foreshortening, horizon line, background, and shadows to match this new viewpoint. Keep the subject's appearance, clothing, and identity identical.`);
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
  if (basePrompt) {
    prompt = basePrompt + "\n\n" + prompt;
  }

  return { prompt, references };
}
