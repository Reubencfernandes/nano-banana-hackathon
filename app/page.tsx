/**
 * NANO BANANA EDITOR - MAIN APPLICATION COMPONENT
 * 
 * This is a visual node-based editor for AI image processing.
 * Users can create nodes for different operations like merging images,
 * changing backgrounds, adding clothes, applying styles, etc.
 * 
 * Key Features:
 * - Drag & drop interface for connecting nodes
 * - Real-time image processing using Google's Gemini API
 * - Support for multiple image operations (merge, style, edit, etc.)
 * - Visual connection lines with animations
 * - Viewport controls (pan, zoom)
 */
"use client";

// React imports for hooks and core functionality
import React, { useEffect, useMemo, useRef, useState } from "react";
// Custom CSS for animations and styling
import "./editor.css";
// Import all the different node view components
import {
  BackgroundNodeView,  // Changes/generates backgrounds
  ClothesNodeView,     // Adds/changes clothing
  StyleNodeView,       // Applies artistic styles
  EditNodeView,        // General text-based editing
  CameraNodeView,      // Camera effects and settings
  AgeNodeView,         // Age transformation
  FaceNodeView,        // Face modifications
  LightningNodeView,   // Lighting effects
  PosesNodeView,       // Pose modifications
  NodeTimer            // Timer component
} from "./nodes";
// UI components from shadcn/ui library
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
// Hugging Face OAuth functionality
import { oauthLoginUrl, oauthHandleRedirectIfPresent } from '@huggingface/hub';

/**
 * Utility function to combine CSS class names conditionally
 * Filters out falsy values and joins the remaining strings with spaces
 * Example: cx("class1", condition && "class2", null) => "class1 class2" or "class1"
 */
function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

/**
 * Generate a unique ID for new nodes
 * Uses Math.random() to create a random string identifier
 * Format: random base-36 string (letters + numbers), 7 characters long
 */
const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * Generate AI prompt for merging multiple character images into a single cohesive group photo
 * 
 * This function creates a detailed prompt that instructs the AI model to:
 * 1. Extract people from separate images
 * 2. Combine them naturally as if photographed together
 * 3. Ensure consistent lighting, shadows, and perspective
 * 4. Create a believable group composition
 * 
 * @param characterData Array of objects containing image data and labels
 * @returns Detailed prompt string for the AI merge operation
 */
function generateMergePrompt(characterData: { image: string; label: string }[]): string {
  const count = characterData.length;

  // Create a summary of all images being processed
  const labels = characterData.map((d, i) => `Image ${i + 1} (${d.label})`).join(", ");

  // Return comprehensive prompt with specific instructions for natural-looking merge
  return `MERGE TASK: Create a natural, cohesive group photo combining ALL subjects from ${count} provided images.

Images provided:
${characterData.map((d, i) => `- Image ${i + 1}: ${d.label}`).join("\n")}

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
}

/**
 * Copy image to clipboard with PNG conversion
 * The clipboard API only supports PNG format for images, so we convert other formats
 */
async function copyImageToClipboard(dataUrl: string) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Convert to PNG if not already PNG
    if (blob.type !== 'image/png') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      await new Promise((resolve) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);
          resolve(void 0);
        };
        img.src = dataUrl;
      });

      const pngBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
    } else {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    }
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
  }
}

/* ========================================
   TYPE DEFINITIONS
   ======================================== */

/**
 * All possible node types in the editor
 * Each type represents a different kind of image processing operation
 */
type NodeType = "CHARACTER" | "MERGE" | "BACKGROUND" | "CLOTHES" | "STYLE" | "EDIT" | "CAMERA" | "AGE" | "FACE" | "BLEND" | "LIGHTNING" | "POSES";

/**
 * Base properties that all nodes share
 * Every node has an ID, type, and position in the editor world space
 */
import { Loader2, Clock } from "lucide-react";

// ... existing imports ...

/**
 * Base properties that all nodes share
 * Every node has an ID, type, and position in the editor world space
 */
type NodeBase = {
  id: string;          // Unique identifier for the node
  type: NodeType;      // What kind of operation this node performs
  x: number;           // X position in world coordinates (not screen pixels)
  y: number;           // Y position in world coordinates (not screen pixels)
  startTime?: number;  // Timestamp when processing started
  executionTime?: number; // Total processing time in milliseconds
};

/**
 * CHARACTER node - Contains source images (people/subjects)
 * These are the starting points for most image processing workflows
 * Users can upload images or paste URLs/data URLs
 */
type CharacterNode = NodeBase & {
  type: "CHARACTER";
  image: string;       // Image data (data URL, http URL, or file path)
  label?: string;      // Optional human-readable name for the character
};

/**
 * MERGE node - Combines multiple inputs into a single group photo
 * Takes multiple CHARACTER or processed nodes and creates a cohesive image
 * Uses AI to naturally blend subjects together with consistent lighting
 */
type MergeNode = NodeBase & {
  type: "MERGE";
  inputs: string[];           // Array of node IDs to merge together
  output?: string | null;     // Resulting merged image (data URL)
  isRunning?: boolean;        // Whether merge operation is currently processing
  error?: string | null;      // Error message if merge failed
};

/**
 * BACKGROUND node - Changes or generates backgrounds
 * Can use solid colors, preset images, uploaded custom images, or AI-generated backgrounds
 */
type BackgroundNode = NodeBase & {
  type: "BACKGROUND";
  input?: string;                    // ID of the source node (usually CHARACTER)
  output?: string;                   // Processed image with new background
  backgroundType: "color" | "gradient" | "image" | "city" | "photostudio" | "upload" | "custom";  // Type of background to apply
  backgroundColor?: string;          // Hex color code for solid color backgrounds

  // Gradient background properties
  gradientDirection?: string;        // Direction of gradient (to right, to bottom, radial, etc.)
  gradientStartColor?: string;       // Starting color of gradient
  gradientEndColor?: string;         // Ending color of gradient

  backgroundImage?: string;          // URL/path for preset background images

  // City scene properties
  citySceneType?: string;           // Type of city scene (busy_street, times_square, etc.)
  cityTimeOfDay?: string;           // Time of day for city scene

  // Photo studio properties
  studioSetup?: string;             // Studio background setup type
  studioBackgroundColor?: string;   // Color for colored seamless background
  studioLighting?: string;          // Studio lighting setup
  faceCamera?: boolean;             // Whether to position character facing camera

  customBackgroundImage?: string;    // User-uploaded background image data
  customPrompt?: string;            // AI prompt for generating custom backgrounds
  isRunning?: boolean;              // Processing state indicator
  error?: string | null;            // Error message if processing failed
};

/**
 * CLOTHES node - Adds or changes clothing on subjects
 * Can use preset clothing styles or custom uploaded clothing images
 */
type ClothesNode = NodeBase & {
  type: "CLOTHES";
  input?: string;              // ID of the source node
  output?: string;             // Image with modified clothing
  clothesImage?: string;       // Custom clothing image to apply
  selectedPreset?: string;     // Preset clothing style identifier
  clothesPrompt?: string;      // Text description for clothing changes
  isRunning?: boolean;         // Processing state
  error?: string | null;       // Error message
};

/**
 * STYLE node - Applies artistic styles and filters
 * Uses AI to transform images with different artistic styles (oil painting, watercolor, etc.)
 */
type StyleNode = NodeBase & {
  type: "STYLE";
  input?: string;              // Source node ID
  output?: string;             // Styled output image
  stylePreset?: string;        // Selected artistic style
  styleStrength?: number;      // How strongly to apply the style (0-100)
  isRunning?: boolean;         // Processing indicator
  error?: string | null;       // Error message
};

/**
 * EDIT node - General purpose text-based image editing
 * Uses natural language prompts to make specific changes to images
 */
type EditNode = NodeBase & {
  type: "EDIT";
  input?: string;              // Input node ID
  output?: string;             // Edited output image
  editPrompt?: string;         // Natural language description of desired changes
  isRunning?: boolean;         // Whether edit is being processed
  error?: string | null;       // Error if edit failed
};

/**
 * CAMERA node - Applies camera effects and photographic settings
 * Simulates different camera settings, lenses, and photographic techniques
 */
type CameraNode = NodeBase & {
  type: "CAMERA";
  input?: string;              // Source image node ID
  output?: string;             // Image with camera effects applied
  focalLength?: string;        // Lens focal length (e.g., "50mm", "85mm")
  aperture?: string;           // Aperture setting (e.g., "f/1.4", "f/2.8")
  shutterSpeed?: string;       // Shutter speed (e.g., "1/60", "1/125")
  whiteBalance?: string;       // Color temperature setting
  angle?: string;              // Camera angle/perspective
  iso?: string;                // ISO sensitivity setting
  filmStyle?: string;          // Film simulation (e.g., "Kodak", "Fuji")
  lighting?: string;           // Lighting setup description
  bokeh?: string;              // Background blur style
  composition?: string;        // Composition technique
  aspectRatio?: string;        // Image aspect ratio
  motionBlur?: string;         // Motion blur effect
  isRunning?: boolean;         // Processing status
  error?: string | null;       // Error message
};

/**
 * AGE node - Transforms subject age
 * Uses AI to make people appear older or younger while maintaining their identity
 */
type AgeNode = NodeBase & {
  type: "AGE";
  input?: string;              // Input node ID
  output?: string;             // Age-transformed image
  targetAge?: number;          // Target age to transform to (in years)
  isRunning?: boolean;         // Processing indicator
  error?: string | null;       // Error if transformation failed
};

/**
 * FACE node - Modifies facial features and accessories
 * Can add/remove facial hair, accessories, change expressions, etc.
 */
type FaceNode = NodeBase & {
  type: "FACE";
  input?: string;              // Source node ID
  output?: string;             // Modified face image
  faceOptions?: {              // Collection of face modification options
    removePimples?: boolean;       // Clean up skin blemishes
    addSunglasses?: boolean;       // Add sunglasses accessory
    addHat?: boolean;             // Add hat accessory  
    changeHairstyle?: string;     // New hairstyle description
    facialExpression?: string;    // Change facial expression
    beardStyle?: string;          // Add/modify facial hair
    selectedMakeup?: string;      // Selected makeup style
    makeupImage?: string;         // Path to makeup reference image
  };
  isRunning?: boolean;         // Processing state
  error?: string | null;       // Error message
};

/**
 * BLEND node - Blends/composites images with adjustable opacity
 * Used for subtle image combinations and overlay effects
 */
type BlendNode = NodeBase & {
  type: "BLEND";
  input?: string;              // Primary input node ID
  output?: string;             // Blended output image
  blendStrength?: number;      // Blend intensity (0-100 percent)
  isRunning?: boolean;         // Processing indicator
  error?: string | null;       // Error message
};

/**
 * LIGHTNING node - Applies lighting effects to images
 * Uses preset lighting styles and images for realistic lighting effects
 */
type LightningNode = NodeBase & {
  type: "LIGHTNING";
  input?: string;              // Source node ID
  output?: string;             // Image with lighting applied
  selectedLighting?: string;   // Selected lighting preset name
  lightingPrompt?: string;     // Text prompt for lighting effect
  lightingStrength?: number;   // Intensity of lighting effect (0-100)
  isRunning?: boolean;         // Processing state
  error?: string | null;       // Error message
};


/**
 * POSES node - Applies pose modifications to subjects
 * Uses preset pose images to modify subject poses
 */
type PosesNode = NodeBase & {
  type: "POSES";
  input?: string;              // Source node ID
  output?: string;             // Image with pose applied
  selectedPose?: string;       // Selected pose preset name
  posePrompt?: string;         // Text prompt for pose effect
  poseStrength?: number;       // How strongly to apply the pose (0-100)
  isRunning?: boolean;         // Processing state
  error?: string | null;       // Error message
};

/**
 * Union type of all possible node types
 * Used for type-safe handling of nodes throughout the application
 */
type AnyNode = CharacterNode | MergeNode | BackgroundNode | ClothesNode | StyleNode | EditNode | CameraNode | AgeNode | FaceNode | BlendNode | LightningNode | PosesNode;

/* ========================================
   CONSTANTS AND UTILITY FUNCTIONS
   ======================================== */

/**
 * Default placeholder image for new CHARACTER nodes
 * Uses Unsplash image as a starting point before users upload their own images
 */
const DEFAULT_PERSON = "/reo.png";

/**
 * Convert File objects to data URLs for image processing
 * 
 * Takes a FileList or array of File objects (from drag/drop or file input)
 * and converts each file to a base64 data URL that can be used in img tags
 * or sent to APIs for processing.
 * 
 * @param files FileList or File array from input events
 * @returns Promise that resolves to array of data URL strings
 */
function toDataUrls(files: FileList | File[]): Promise<string[]> {
  const arr = Array.from(files as File[]);  // Convert FileList to regular array
  return Promise.all(
    arr.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();                    // Browser API for reading files
          r.onload = () => resolve(r.result as string);  // Success: return data URL
          r.onerror = reject;                            // Error: reject promise
          r.readAsDataURL(file);                         // Start reading as base64 data URL
        })
    )
  );
}

/**
 * Convert screen pixel coordinates to world coordinates
 * 
 * The editor uses a coordinate system where:
 * - Screen coordinates: actual pixel positions on the browser window
 * - World coordinates: virtual positions that account for pan/zoom transformations
 * 
 * This function converts mouse/touch positions to world space for accurate node positioning.
 * 
 * @param clientX Mouse X position in screen pixels
 * @param clientY Mouse Y position in screen pixels  
 * @param container Bounding rect of the editor container
 * @param tx Current pan transform X offset
 * @param ty Current pan transform Y offset
 * @param scale Current zoom scale factor
 * @returns Object with world coordinates {x, y}
 */
function screenToWorld(
  clientX: number,
  clientY: number,
  container: DOMRect,
  tx: number,
  ty: number,
  scale: number
) {
  const x = (clientX - container.left - tx) / scale;  // Account for container offset, pan, and zoom
  const y = (clientY - container.top - ty) / scale;
  return { x, y };
}

function useNodeDrag(
  nodeId: string,
  scaleRef: React.MutableRefObject<number>,
  initial: { x: number; y: number },
  onUpdatePosition: (id: string, x: number, y: number) => void
) {
  const [localPos, setLocalPos] = useState(initial);
  const dragging = useRef(false);
  const start = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(
    null
  );

  useEffect(() => {
    setLocalPos(initial);
  }, [initial.x, initial.y]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = true;
    start.current = { sx: e.clientX, sy: e.clientY, ox: localPos.x, oy: localPos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !start.current) return;
    const dx = (e.clientX - start.current.sx) / scaleRef.current;
    const dy = (e.clientY - start.current.sy) / scaleRef.current;
    const newX = start.current.ox + dx;
    const newY = start.current.oy + dy;
    setLocalPos({ x: newX, y: newY });
    onUpdatePosition(nodeId, newX, newY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    start.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };
  return { pos: localPos, onPointerDown, onPointerMove, onPointerUp };
}

function Port({
  className,
  nodeId,
  isOutput,
  onStartConnection,
  onEndConnection
}: {
  className?: string;
  nodeId?: string;
  isOutput?: boolean;
  onStartConnection?: (nodeId: string) => void;
  onEndConnection?: (nodeId: string) => void;
}) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (isOutput && nodeId && onStartConnection) {
      onStartConnection(nodeId);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isOutput && nodeId && onEndConnection) {
      onEndConnection(nodeId);
    }
  };

  return (
    <div
      className={cx("nb-port", className)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerUp}
    />
  );
}



function CharacterNodeView({
  node,
  scaleRef,
  onChangeImage,
  onChangeLabel,
  onStartConnection,
  onUpdatePosition,
  onDelete,
}: {
  node: CharacterNode;
  scaleRef: React.MutableRefObject<number>;
  onChangeImage: (id: string, url: string) => void;
  onChangeLabel: (id: string, label: string) => void;
  onStartConnection: (nodeId: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
}) {
  const { pos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(
    node.id,
    scaleRef,
    { x: node.x, y: node.y },
    onUpdatePosition
  );

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files;
    if (f && f.length) {
      const [first] = await toDataUrls(f);
      if (first) onChangeImage(node.id, first);
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      const [first] = await toDataUrls(files);
      if (first) onChangeImage(node.id, first);
      return;
    }
    const text = e.clipboardData.getData("text");
    if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
      onChangeImage(node.id, text);
    }
  };

  return (
    <div
      className="nb-node absolute w-[340px] select-none"
      style={{ left: pos.x, top: pos.y }}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={onPaste}
    >
      <div
        className="nb-header cursor-grab active:cursor-grabbing rounded-t-[14px] px-3 py-2 flex items-center justify-between"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <input
          className="bg-transparent outline-none text-sm font-semibold tracking-wide flex-1"
          value={node.label || "CHARACTER"}
          onChange={(e) => onChangeLabel(node.id, e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon" className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this character node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port
            className="out"
            nodeId={node.id}
            isOutput={true}
            onStartConnection={onStartConnection}
          />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="aspect-[4/5] w-full rounded-xl bg-muted/30 grid place-items-center overflow-hidden border border-border/10">
          <img
            src={node.image}
            alt="character"
            className="h-full w-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
            draggable={false}
            onClick={async () => {
              try {
                const response = await fetch(node.image);
                const blob = await response.blob();
                await navigator.clipboard.write([
                  new ClipboardItem({ [blob.type]: blob })
                ]);
              } catch (error) {
                console.error('Failed to copy image:', error);
              }
            }}
            onContextMenu={async (e) => {
              e.preventDefault();
              try {
                const response = await fetch(node.image);
                const blob = await response.blob();
                await navigator.clipboard.write([
                  new ClipboardItem({ [blob.type]: blob })
                ]);

                // Show visual feedback
                const img = e.currentTarget;
                const originalFilter = img.style.filter;
                img.style.filter = "brightness(1.2)";

                setTimeout(() => {
                  img.style.filter = originalFilter;
                }, 500);
              } catch (error) {
                console.error('Failed to copy image:', error);
              }
            }}
            title="Click or right-click to copy image to clipboard"
          />
        </div>
        <div className="flex gap-2">
          <label className="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors rounded px-3 py-1 cursor-pointer">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const files = e.currentTarget.files;
                if (files && files.length > 0) {
                  const [first] = await toDataUrls(files);
                  if (first) onChangeImage(node.id, first);
                  // Reset input safely
                  try {
                    e.currentTarget.value = "";
                  } catch { }
                }
              }}
            />
          </label>
          <button
            className="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors rounded px-3 py-1"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
                  onChangeImage(node.id, text);
                }
              } catch { }
            }}
          >
            Paste URL
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeNodeView({
  node,
  scaleRef,
  allNodes,
  onDisconnect,
  onRun,
  onEndConnection,
  onStartConnection,
  onUpdatePosition,
  onDelete,
  onClearConnections,
}: {
  node: MergeNode;
  scaleRef: React.MutableRefObject<number>;
  allNodes: AnyNode[];
  onDisconnect: (mergeId: string, nodeId: string) => void;
  onRun: (mergeId: string) => void;
  onEndConnection: (mergeId: string) => void;
  onStartConnection: (nodeId: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onClearConnections: (mergeId: string) => void;
}) {
  const { pos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(
    node.id,
    scaleRef,
    { x: node.x, y: node.y },
    onUpdatePosition
  );


  return (
    <div className="nb-node absolute w-[420px]" style={{ left: pos.x, top: pos.y }}>
      <div
        className="nb-header cursor-grab active:cursor-grabbing rounded-t-[14px] px-3 py-2 flex items-center justify-between"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} />
        <Port
          className="in"
          nodeId={node.id}
          isOutput={false}
          onEndConnection={onEndConnection}
        />
        <div className="font-semibold tracking-wide text-sm flex-1 text-center">MERGE</div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this merge node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port
            className="out"
            nodeId={node.id}
            isOutput={true}
            onStartConnection={onStartConnection}
          />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="text-xs text-muted-foreground font-medium">Inputs</div>
        <div className="flex flex-wrap gap-2">
          {node.inputs.map((id) => {
            const inputNode = allNodes.find((n) => n.id === id);
            if (!inputNode) return null;

            // Get image and label based on node type
            let image: string | null = null;
            let label = "";

            if (inputNode.type === "CHARACTER") {
              image = (inputNode as CharacterNode).image;
              label = (inputNode as CharacterNode).label || "Character";
            } else if ((inputNode as any).output) {
              image = (inputNode as any).output;
              label = `${inputNode.type}`;
            } else if (inputNode.type === "MERGE" && (inputNode as MergeNode).output) {
              const mergeOutput = (inputNode as MergeNode).output;
              image = mergeOutput !== undefined ? mergeOutput : null;
              label = "Merged";
            } else {
              // Node without output yet
              label = `${inputNode.type} (pending)`;
            }

            return (
              <div key={id} className="flex items-center gap-2 bg-secondary/50 border border-border/50 text-secondary-foreground rounded px-2 py-1">
                {image && (
                  <div className="w-6 h-6 rounded overflow-hidden bg-muted">
                    <img
                      src={image}
                      className="w-full h-full object-contain cursor-pointer hover:opacity-80"
                      alt="inp"
                      onClick={async () => {
                        try {
                          const response = await fetch(image);
                          const blob = await response.blob();
                          await navigator.clipboard.write([
                            new ClipboardItem({ [blob.type]: blob })
                          ]);
                        } catch (error) {
                          console.error('Failed to copy image:', error);
                        }
                      }}
                      onContextMenu={async (e) => {
                        e.preventDefault();
                        try {
                          const response = await fetch(image);
                          const blob = await response.blob();
                          await navigator.clipboard.write([
                            new ClipboardItem({ [blob.type]: blob })
                          ]);

                          // Show visual feedback
                          const img = e.currentTarget;
                          const originalFilter = img.style.filter;
                          img.style.filter = "brightness(1.2)";

                          setTimeout(() => {
                            img.style.filter = originalFilter;
                          }, 300);
                        } catch (error) {
                          console.error('Failed to copy image:', error);
                        }
                      }}
                      title="Click or right-click to copy"
                    />
                  </div>
                )}
                <span className="text-xs">{label}</span>
                <button
                  className="text-[10px] text-red-300 hover:text-red-200"
                  onClick={() => onDisconnect(node.id, id)}
                >
                  remove
                </button>
              </div>
            );
          })}
        </div>
        {node.inputs.length === 0 && (
          <p className="text-xs text-white/40">Drag from any node's output port to connect</p>
        )}
        <div className="flex items-center gap-2">
          {node.inputs.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onClearConnections(node.id)}
              title="Clear all connections"
            >
              Clear
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onRun(node.id)}
            disabled={node.isRunning || node.inputs.length < 2}
          >
            {node.isRunning ? "Merging…" : "Merge"}
          </Button>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-white/70">Output</div>
          </div>
          <div className="w-full min-h-[200px] max-h-[400px] rounded-xl bg-black/40 grid place-items-center">
            {node.output ? (
              <img
                src={node.output}
                className="w-full h-auto max-h-[400px] object-contain rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                alt="output"
                onClick={async () => {
                  if (node.output) {
                    try {
                      const response = await fetch(node.output);
                      const blob = await response.blob();
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                      ]);
                    } catch (error) {
                      console.error('Failed to copy image:', error);
                    }
                  }
                }}
                onContextMenu={async (e) => {
                  e.preventDefault();
                  if (node.output) {
                    try {
                      const response = await fetch(node.output);
                      const blob = await response.blob();
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                      ]);

                      // Show visual feedback
                      const img = e.currentTarget;
                      const originalFilter = img.style.filter;
                      img.style.filter = "brightness(1.2)";

                      setTimeout(() => {
                        img.style.filter = originalFilter;
                      }, 500);
                    } catch (error) {
                      console.error('Failed to copy image:', error);
                    }
                  }
                }}
                title="Click or right-click to copy image to clipboard"
              />
            ) : (
              <span className="text-white/40 text-xs py-16">Run merge to see result</span>
            )}
          </div>
          {node.output && (
            <div className="mt-2">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = node.output as string;
                  link.download = `merge-${Date.now()}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                📥 Download Merged Image
              </Button>
            </div>
          )}
          {node.error && (
            <div className="mt-2">
              <div className="text-xs text-red-400">{node.error}</div>
              {node.error.includes("API key") && (
                <div className="text-xs text-white/50 mt-2 space-y-1">
                  <p>To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Get key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 hover:underline">Google AI Studio</a></li>
                    <li>Replace APi key placeholder with your key</li>
                    <li>Restart server (Ctrl+C, npm run dev)</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  const [nodes, setNodes] = useState<AnyNode[]>(() => [
    {
      id: uid(),
      type: "CHARACTER",
      x: 80,
      y: 120,
      image: DEFAULT_PERSON,
      label: "CHARACTER 1",
    } as CharacterNode,
  ]);


  // Viewport state
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // HF OAUTH CHECK
  useEffect(() => {
    (async () => {
      setIsCheckingAuth(true);
      try {
        // Check if already logged in (callback handles token exchange)
        const response = await fetch('/api/auth/callback', { method: 'GET' });
        if (response.ok) {
          const data = await response.json();
          setIsHfProLoggedIn(data.isLoggedIn);
          if (data.user) {
            setHfUser(data.user);
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    })();
  }, []);

  // HF PRO LOGIN HANDLER
  const handleHfProLogin = async () => {
    if (isHfProLoggedIn) {
      // Logout: clear the token
      try {
        await fetch('/api/auth/callback', { method: 'DELETE' });
        setIsHfProLoggedIn(false);
        setHfUser(null);
      } catch (error) {
        console.error('Logout error:', error);
      }
    } else {
      // Login with HF OAuth
      // Fetch OAuth login URL from server-side API (ensures correct redirect URL)
      try {
        const response = await fetch('/api/oauth-config');
        const { isConfigured, loginUrl, redirectUrl } = await response.json();

        console.log('OAuth Config from API:', {
          isConfigured,
          loginUrl: loginUrl ? 'present' : 'missing',
          redirectUrl
        });

        if (!isConfigured || !loginUrl) {
          console.error('OAuth not configured on server. Check Space settings.');
          alert('OAuth is not configured for this Space. Please ensure:\n1. hf_oauth: true is set in README.md\n2. Space has been rebuilt\n3. Check Space logs for OAuth configuration');
          return;
        }

        // Use the server-generated login URL directly
        // This ensures the redirect_uri uses the correct public Space URL
        window.location.href = loginUrl;
      } catch (error) {
        console.error('Failed to get OAuth config:', error);
        alert('Failed to initialize OAuth login. Please try again.');
      }
    }
  };

  // Connection dragging state
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number, y: number } | null>(null);

  // API Token state (restored for manual review)
  const [apiToken, setApiToken] = useState("");
  const [showHelpSidebar, setShowHelpSidebar] = useState(false);

  // Usage tracking state
  const [usage, setUsage] = useState<{ used: number; remaining: number; limit: number } | null>(null);

  // Processing Mode: 'nanobananapro' uses Gemini API, 'huggingface' uses HF models
  type ProcessingMode = 'nanobananapro' | 'huggingface';
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('nanobananapro');

  // Available HF models
  const HF_MODELS = {
    "FLUX.1-Kontext-dev": {
      id: "black-forest-labs/FLUX.1-Kontext-dev",
      name: "FLUX.1 Kontext",
      type: "image-to-image",
      description: "Advanced image editing with context understanding",
    },
    "Qwen-Image-Edit": {
      id: "Qwen/Qwen-Image-Edit",
      name: "Qwen Image Edit",
      type: "image-to-image",
      description: "Powerful image editing and manipulation",
    },
  };

  const [selectedHfModel, setSelectedHfModel] = useState<keyof typeof HF_MODELS>("Qwen-Image-Edit");


  // HF PRO AUTHENTICATION
  const [isHfProLoggedIn, setIsHfProLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hfUser, setHfUser] = useState<{ name?: string; username?: string; avatarUrl?: string } | null>(null);

  // Fetch usage on mount and when apiToken changes
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/usage');
        if (res.ok) {
          const data = await res.json();
          setUsage({ used: data.used, remaining: data.remaining, limit: data.limit });
        }
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      }
    };

    // Only fetch if not using own API key
    if (!apiToken) {
      fetchUsage();
    } else {
      setUsage(null); // Clear usage when using own key
    }
  }, [apiToken]);


  const characters = nodes.filter((n) => n.type === "CHARACTER") as CharacterNode[];
  const merges = nodes.filter((n) => n.type === "MERGE") as MergeNode[];

  // Editor actions
  const addCharacter = (at?: { x: number; y: number }) => {
    setNodes((prev) => [
      ...prev,
      {
        id: uid(),
        type: "CHARACTER",
        x: at ? at.x : 80 + Math.random() * 60,
        y: at ? at.y : 120 + Math.random() * 60,
        image: DEFAULT_PERSON,
        label: `CHARACTER ${prev.filter((n) => n.type === "CHARACTER").length + 1}`,
      } as CharacterNode,
    ]);
  };
  const addMerge = (at?: { x: number; y: number }) => {
    setNodes((prev) => [
      ...prev,
      {
        id: uid(),
        type: "MERGE",
        x: at ? at.x : 520,
        y: at ? at.y : 160,
        inputs: [],
      } as MergeNode,
    ]);
  };

  const setCharacterImage = (id: string, url: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id && n.type === "CHARACTER" ? { ...n, image: url } : n))
    );
  };
  const setCharacterLabel = (id: string, label: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id && n.type === "CHARACTER" ? { ...n, label } : n)));
  };

  const updateNodePosition = (id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const deleteNode = (id: string) => {
    setNodes((prev) => {
      // If it's a MERGE node, just remove it
      // If it's a CHARACTER node, also remove it from all MERGE inputs
      return prev
        .filter((n) => n.id !== id)
        .map((n) => {
          if (n.type === "MERGE") {
            const merge = n as MergeNode;
            return {
              ...merge,
              inputs: merge.inputs.filter((inputId) => inputId !== id),
            };
          }
          return n;
        });
    });
  };

  const clearMergeConnections = (mergeId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === mergeId && n.type === "MERGE"
          ? { ...n, inputs: [] }
          : n
      )
    );
  };

  // Update any node's properties
  const updateNode = (id: string, updates: any) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  };


  // Handle single input connections for new nodes
  const handleEndSingleConnection = (nodeId: string) => {
    if (draggingFrom) {
      // Find the source node
      const sourceNode = nodes.find(n => n.id === draggingFrom);
      if (sourceNode) {
        // Allow connections from ANY node that has an output port
        // This includes:
        // - CHARACTER nodes (always have an image)
        // - MERGE nodes (can have output after merging)
        // - Any processing node (BACKGROUND, CLOTHES, BLEND, etc.)
        // - Even unprocessed nodes (for configuration chaining)

        // All nodes can be connected for chaining
        setNodes(prev => prev.map(n =>
          n.id === nodeId ? { ...n, input: draggingFrom } : n
        ));
      }
      setDraggingFrom(null);
      setDragPos(null);
      // Re-enable text selection
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    }
  };

  // Helper to count pending configurations in chain
  const countPendingConfigurations = (startNodeId: string): number => {
    let count = 0;
    const visited = new Set<string>();

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Check if this node has configuration but no output
      if (!(node as any).output && node.type !== "CHARACTER" && node.type !== "MERGE") {
        const config = getNodeConfiguration(node);
        if (Object.keys(config).length > 0) {
          count++;
        }
      }

      // Check upstream
      const upstreamId = (node as any).input;
      if (upstreamId) {
        traverse(upstreamId);
      }
    };

    traverse(startNodeId);
    return count;
  };

  // Helper to extract configuration from a node
  const getNodeConfiguration = (node: AnyNode): Record<string, unknown> => {
    const config: Record<string, unknown> = {};

    switch (node.type) {
      case "BACKGROUND":
        if ((node as BackgroundNode).backgroundType) {
          const bgNode = node as BackgroundNode;
          config.backgroundType = bgNode.backgroundType;
          config.backgroundColor = bgNode.backgroundColor;
          config.backgroundImage = bgNode.backgroundImage;
          config.customBackgroundImage = bgNode.customBackgroundImage;
          config.customPrompt = bgNode.customPrompt;

          // Gradient properties
          if (bgNode.backgroundType === "gradient") {
            config.gradientDirection = bgNode.gradientDirection;
            config.gradientStartColor = bgNode.gradientStartColor;
            config.gradientEndColor = bgNode.gradientEndColor;
          }

          // City scene properties
          if (bgNode.backgroundType === "city") {
            config.citySceneType = bgNode.citySceneType;
            config.cityTimeOfDay = bgNode.cityTimeOfDay;
          }

          // Photo studio properties
          if (bgNode.backgroundType === "photostudio") {
            config.studioSetup = bgNode.studioSetup;
            config.studioBackgroundColor = bgNode.studioBackgroundColor;
            config.studioLighting = bgNode.studioLighting;
            config.faceCamera = bgNode.faceCamera;
          }
        }
        break;
      case "CLOTHES":
        if ((node as ClothesNode).clothesPrompt) {
          config.clothesPrompt = (node as ClothesNode).clothesPrompt;
        }
        if ((node as ClothesNode).clothesImage) {
          config.clothesImage = (node as ClothesNode).clothesImage;
        }
        break;
      case "STYLE":
        if ((node as StyleNode).stylePreset) {
          config.stylePreset = (node as StyleNode).stylePreset;
          config.styleStrength = (node as StyleNode).styleStrength;
        }
        break;
      case "EDIT":
        if ((node as EditNode).editPrompt) {
          config.editPrompt = (node as EditNode).editPrompt;
        }
        break;
      case "CAMERA":
        const cam = node as CameraNode;
        if (cam.focalLength && cam.focalLength !== "None") config.focalLength = cam.focalLength;
        if (cam.aperture && cam.aperture !== "None") config.aperture = cam.aperture;
        if (cam.shutterSpeed && cam.shutterSpeed !== "None") config.shutterSpeed = cam.shutterSpeed;
        if (cam.whiteBalance && cam.whiteBalance !== "None") config.whiteBalance = cam.whiteBalance;
        if (cam.angle && cam.angle !== "None") config.angle = cam.angle;
        if (cam.iso && cam.iso !== "None") config.iso = cam.iso;
        if (cam.filmStyle && cam.filmStyle !== "None") config.filmStyle = cam.filmStyle;
        if (cam.lighting && cam.lighting !== "None") config.lighting = cam.lighting;
        if (cam.bokeh && cam.bokeh !== "None") config.bokeh = cam.bokeh;
        if (cam.composition && cam.composition !== "None") config.composition = cam.composition;
        if (cam.aspectRatio && cam.aspectRatio !== "None") config.aspectRatio = cam.aspectRatio;
        if (cam.motionBlur && cam.motionBlur !== "None") config.motionBlur = cam.motionBlur;
        break;
      case "AGE":
        if ((node as AgeNode).targetAge) {
          config.targetAge = (node as AgeNode).targetAge;
        }
        break;
      case "FACE":
        const face = node as FaceNode;
        if (face.faceOptions) {
          const opts: Record<string, unknown> = {};
          if (face.faceOptions.removePimples) opts.removePimples = true;
          if (face.faceOptions.addSunglasses) opts.addSunglasses = true;
          if (face.faceOptions.addHat) opts.addHat = true;
          if (face.faceOptions.changeHairstyle && face.faceOptions.changeHairstyle !== "None") {
            opts.changeHairstyle = face.faceOptions.changeHairstyle;
          }
          if (face.faceOptions.facialExpression && face.faceOptions.facialExpression !== "None") {
            opts.facialExpression = face.faceOptions.facialExpression;
          }
          if (face.faceOptions.beardStyle && face.faceOptions.beardStyle !== "None") {
            opts.beardStyle = face.faceOptions.beardStyle;
          }
          if (Object.keys(opts).length > 0) {
            config.faceOptions = opts;
          }
        }
        break;
      case "LIGHTNING":
        if ((node as LightningNode).lightingPrompt && (node as LightningNode).selectedLighting) {
          config.lightingPrompt = (node as LightningNode).lightingPrompt;
          config.selectedLighting = (node as LightningNode).selectedLighting;
        }
        break;
      case "POSES":
        if ((node as PosesNode).posePrompt && (node as PosesNode).selectedPose) {
          config.posePrompt = (node as PosesNode).posePrompt;
          config.selectedPose = (node as PosesNode).selectedPose;
        }
        break;
    }

    return config;
  };

  // Process node with API
  const processNode = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.error("Node not found:", nodeId);
      return;
    }

    // Get input image and collect all configurations from chain
    let inputImage: string | null = null;
    let accumulatedParams: any = {};
    const processedNodes: string[] = []; // Track which nodes' configs we're applying
    const inputId = (node as any).input;

    if (inputId) {
      // Track unprocessed MERGE nodes that need to be executed
      const unprocessedMerges: MergeNode[] = [];

      // Find the source image by traversing the chain backwards
      const findSourceImage = (currentNodeId: string, visited: Set<string> = new Set()): string | null => {
        if (visited.has(currentNodeId)) return null;
        visited.add(currentNodeId);

        const currentNode = nodes.find(n => n.id === currentNodeId);
        if (!currentNode) return null;

        // If this is a CHARACTER node, return its image
        if (currentNode.type === "CHARACTER") {
          return (currentNode as CharacterNode).image;
        }

        // If this is a MERGE node with output, return its output
        if (currentNode.type === "MERGE" && (currentNode as MergeNode).output) {
          return (currentNode as MergeNode).output || null;
        }

        // If any node has been processed, return its output
        if ((currentNode as any).output) {
          return (currentNode as any).output;
        }

        // For MERGE nodes without output, we need to process them first
        if (currentNode.type === "MERGE") {
          const merge = currentNode as MergeNode;
          if (!merge.output && merge.inputs.length >= 2) {
            // Mark this merge for processing
            unprocessedMerges.push(merge);
            // For now, return null - we'll process the merge first
            return null;
          } else if (merge.inputs.length > 0) {
            // Try to get image from first input if merge can't be executed
            const firstInput = merge.inputs[0];
            const inputImage = findSourceImage(firstInput, visited);
            if (inputImage) return inputImage;
          }
        }

        // Otherwise, check upstream
        const upstreamId = (currentNode as any).input;
        if (upstreamId) {
          return findSourceImage(upstreamId, visited);
        }

        return null;
      };

      // Collect all configurations from unprocessed nodes in the chain
      const collectConfigurations = (currentNodeId: string, visited: Set<string> = new Set()): any => {
        if (visited.has(currentNodeId)) return {};
        visited.add(currentNodeId);

        const currentNode = nodes.find(n => n.id === currentNodeId);
        if (!currentNode) return {};

        let configs: any = {};

        // First, collect from upstream nodes
        const upstreamId = (currentNode as any).input;
        if (upstreamId) {
          configs = collectConfigurations(upstreamId, visited);
        }

        // Add this node's configuration only if:
        // 1. It's the current node being processed, OR
        // 2. It hasn't been processed yet (no output) AND it's not the current node
        const shouldIncludeConfig =
          currentNodeId === nodeId || // Always include current node's config
          (!(currentNode as any).output && currentNodeId !== nodeId); // Include unprocessed intermediate nodes

        if (shouldIncludeConfig) {
          const nodeConfig = getNodeConfiguration(currentNode);
          if (Object.keys(nodeConfig).length > 0) {
            configs = { ...configs, ...nodeConfig };
            // Track unprocessed intermediate nodes
            if (currentNodeId !== nodeId && !(currentNode as any).output) {
              processedNodes.push(currentNodeId);
            }
          }
        }

        return configs;
      };

      // Find the source image
      inputImage = findSourceImage(inputId);

      // If we found unprocessed merges, we need to execute them first
      if (unprocessedMerges.length > 0 && !inputImage) {

        // Process each merge node
        for (const merge of unprocessedMerges) {
          // Set loading state for the merge
          setNodes(prev => prev.map(n =>
            n.id === merge.id ? { ...n, isRunning: true, error: null } : n
          ));

          try {
            const mergeOutput = await executeMerge(merge);

            // Update the merge node with output
            setNodes(prev => prev.map(n =>
              n.id === merge.id ? { ...n, output: mergeOutput || undefined, isRunning: false, error: null } : n
            ));

            // Track that we processed this merge as part of the chain
            processedNodes.push(merge.id);

            // Now use this as our input image if it's the direct input
            if (inputId === merge.id) {
              inputImage = mergeOutput;
            }
          } catch (e: any) {
            console.error("Auto-merge error:", e);
            setNodes(prev => prev.map(n =>
              n.id === merge.id ? { ...n, isRunning: false, error: e?.message || "Merge failed" } : n
            ));
            // Abort the main processing if merge failed
            setNodes(prev => prev.map(n =>
              n.id === nodeId ? { ...n, error: "Failed to process upstream MERGE node", isRunning: false } : n
            ));
            return;
          }
        }

        // After processing merges, try to find the source image again
        if (!inputImage) {
          inputImage = findSourceImage(inputId);
        }
      }

      // Collect configurations from the chain
      accumulatedParams = collectConfigurations(inputId, new Set());
    }

    if (!inputImage) {
      const errorMsg = inputId
        ? "No source image found in the chain. Connect to a CHARACTER node or processed node."
        : "No input connected. Connect an image source to this node.";
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, error: errorMsg, isRunning: false } : n
      ));
      return;
    }

    // Add current node's configuration
    const currentNodeConfig = getNodeConfiguration(node);
    const params = { ...accumulatedParams, ...currentNodeConfig };

    // Count how many unprocessed nodes we're combining
    const unprocessedNodeCount = Object.keys(params).length > 0 ?
      (processedNodes.length + 1) : 1;

    // Show info about batch processing
    if (unprocessedNodeCount > 1) {
    } else {
    }

    // Set loading state for all nodes being processed
    const startTime = Date.now();
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId || processedNodes.includes(n.id)) {
        return { ...n, isRunning: true, error: null, startTime, executionTime: undefined };
      }
      return n;
    }));

    try {
      // Validate image data before sending
      if (inputImage && inputImage.length > 10 * 1024 * 1024) { // 10MB limit warning
        console.warn("Large input image detected, size:", (inputImage.length / (1024 * 1024)).toFixed(2) + "MB");
      }

      // Check if params contains custom images and validate them

      // Removed clothesImage validation as we now use text prompts


      if (params.customBackgroundImage) {
        // Validate it's a proper data URL
        if (!params.customBackgroundImage.startsWith('data:') && !params.customBackgroundImage.startsWith('http') && !params.customBackgroundImage.startsWith('/')) {
          throw new Error("Invalid background image format. Please upload a valid image.");
        }
      }

      // Log request details for debugging

      // Ensure inputImage is a Data URL (convert Blob URL if needed)
      // This fixes "invalid image url" errors when passing blob: URLs to server
      if (inputImage && inputImage.startsWith('blob:')) {
        try {
          const blobRes = await fetch(inputImage);
          const blob = await blobRes.blob();
          inputImage = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to convert blob URL:", e);
        }
      }

      // Conditionally use HuggingFace or Gemini API based on processing mode
      let res: Response;

      if (processingMode === 'huggingface') {
        // Use HuggingFace models
        if (!isHfProLoggedIn) {
          throw new Error("Please login with HuggingFace to use HF models. Click 'Login with HuggingFace' in the header.");
        }

        // Debug: Log what we're sending
        console.log('[HF Debug] Sending to /api/hf-process:', {
          hasImage: !!inputImage,
          imageType: inputImage ? (inputImage.startsWith('data:') ? 'dataURL' : inputImage.startsWith('blob:') ? 'blobURL' : inputImage.startsWith('http') ? 'httpURL' : 'unknown') : 'null',
          imagePreview: inputImage?.substring(0, 80),
          model: selectedHfModel,
        });

        res = await fetch("/api/hf-process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "COMBINED",
            model: selectedHfModel,
            image: inputImage,
            params
          }),
        });
      } else {
        // Use Nano Banana (Gemini API)
        res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "COMBINED",
            image: inputImage,
            params,
            apiToken: apiToken || undefined
          }),
        });
      }

      // Check if response is actually JSON before parsing
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await res.text();
        console.error("Non-JSON response received:", textResponse);
        throw new Error("Server returned an error page instead of JSON. Check your API key configuration.");
      }

      const data = await res.json();
      if (!res.ok) {
        // Handle both string and object error formats
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : data.error?.message || JSON.stringify(data.error) || "Processing failed";
        throw new Error(errorMessage);
      }

      // Only update the current node with the output
      // Don't show output in intermediate nodes - they were just used for configuration
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      setNodes(prev => prev.map(n => {
        if (n.id === nodeId) {
          // Only the current node gets the final output displayed
          return { ...n, output: data.image, isRunning: false, error: null, executionTime };
        } else if (processedNodes.includes(n.id)) {
          // Mark intermediate nodes as no longer running but don't give them output
          // This way they remain unprocessed visually but their configs were used
          return { ...n, isRunning: false, error: null, executionTime };
        }
        return n;
      }));

      // Update usage from API response
      if (data.usage) {
        setUsage(data.usage);
      }

      // Add to node's history
      const description = unprocessedNodeCount > 1
        ? `Combined ${unprocessedNodeCount} transformations`
        : `${node.type} transformation`;


      if (unprocessedNodeCount > 1) {
      }
    } catch (e: any) {
      console.error("Process error:", e);
      // Clear loading state for all nodes
      setNodes(prev => prev.map(n => {
        if (n.id === nodeId || processedNodes.includes(n.id)) {
          return { ...n, isRunning: false, error: e?.message || "Error" };
        }
        return n;
      }));
    }
  };

  const connectToMerge = (mergeId: string, nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === mergeId && n.type === "MERGE"
          ? { ...n, inputs: Array.from(new Set([...(n as MergeNode).inputs, nodeId])) }
          : n
      )
    );
  };

  // Connection drag handlers
  const handleStartConnection = (nodeId: string) => {
    setDraggingFrom(nodeId);
    // Prevent text selection during dragging
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  };

  const handleEndConnection = (mergeId: string) => {
    if (draggingFrom) {
      // Allow connections from any node type that could have an output
      const sourceNode = nodes.find(n => n.id === draggingFrom);
      if (sourceNode) {
        // Allow connections from:
        // - CHARACTER nodes (always have an image)
        // - Any node with an output (processed nodes)
        // - Any processing node (for future processing)
        connectToMerge(mergeId, draggingFrom);
      }
      setDraggingFrom(null);
      setDragPos(null);
      // Re-enable text selection
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingFrom) {
      const rect = containerRef.current!.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, tx, ty, scale);
      setDragPos(world);
    }
  };

  const handlePointerUp = () => {
    if (draggingFrom) {
      setDraggingFrom(null);
      setDragPos(null);
      // Re-enable text selection
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    }
  };
  const disconnectFromMerge = (mergeId: string, nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === mergeId && n.type === "MERGE"
          ? { ...n, inputs: (n as MergeNode).inputs.filter((i) => i !== nodeId) }
          : n
      )
    );
  };

  const executeMerge = async (merge: MergeNode): Promise<string | null> => {
    // Get images from merge inputs - now accepts any node type
    const mergeImages: string[] = [];
    const inputData: { image: string; label: string }[] = [];

    for (const inputId of merge.inputs) {
      const inputNode = nodes.find(n => n.id === inputId);
      if (inputNode) {
        let image: string | null = null;
        let label = "";

        if (inputNode.type === "CHARACTER") {
          image = (inputNode as CharacterNode).image;
          label = (inputNode as CharacterNode).label || "";
        } else if ((inputNode as any).output) {
          // Any processed node with output
          image = (inputNode as any).output;
          label = `${inputNode.type} Output`;
        } else if (inputNode.type === "MERGE" && (inputNode as MergeNode).output) {
          // Another merge node's output
          const mergeOutput = (inputNode as MergeNode).output;
          image = mergeOutput !== undefined ? mergeOutput : null;
          label = "Merged Image";
        }

        if (image) {
          // Validate image format
          if (!image.startsWith('data:') && !image.startsWith('http') && !image.startsWith('/')) {
            console.error(`Invalid image format for ${label}:`, image.substring(0, 100));
            continue; // Skip invalid images
          }
          mergeImages.push(image);
          inputData.push({ image, label: label || `Input ${mergeImages.length}` });
        }
      }
    }

    if (mergeImages.length < 2) {
      throw new Error("Not enough valid inputs for merge. Need at least 2 images.");
    }

    // Log merge details for debugging

    const prompt = generateMergePrompt(inputData);

    // ORIGINAL MERGE LOGIC RESTORED (HF processing commented out)
    /*
    const res = await fetch("/api/hf-process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        type: "MERGE", 
        images: mergeImages, 
        prompt 
      }),
    });
    */

    // Use the process route instead of merge route
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "MERGE",
        images: mergeImages,
        prompt,
        apiToken: apiToken || undefined
      }),
    });

    // Check if response is actually JSON before parsing
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const textResponse = await res.text();
      console.error("Non-JSON response received:", textResponse);
      throw new Error("Server returned an error page instead of JSON. Check your API key configuration.");
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Merge failed");
    }

    return data.image || (data.images?.[0] as string) || null;
  };

  const runMerge = async (mergeId: string) => {
    // Check if using HuggingFace mode - MERGE is not supported
    if (processingMode === 'huggingface') {
      setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? {
        ...n,
        error: "MERGE requires Nano Banana mode. HuggingFace models only accept single images. Please switch to '🍌 Nano Banana' in the header and enter your Gemini API key."
      } : n)));
      return;
    }

    setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, isRunning: true, error: null } : n)));
    try {
      const merge = (nodes.find((n) => n.id === mergeId) as MergeNode) || null;
      if (!merge) return;

      // Get input nodes with their labels - now accepts any node type
      const inputData = merge.inputs
        .map((id, index) => {
          const inputNode = nodes.find((n) => n.id === id);
          if (!inputNode) return null;

          // Support CHARACTER nodes, processed nodes, and MERGE outputs
          let image: string | null = null;
          let label = "";

          if (inputNode.type === "CHARACTER") {
            image = (inputNode as CharacterNode).image;
            label = (inputNode as CharacterNode).label || `CHARACTER ${index + 1}`;
          } else if ((inputNode as any).output) {
            // Any processed node with output
            image = (inputNode as any).output;
            label = `${inputNode.type} Output ${index + 1}`;
          } else if (inputNode.type === "MERGE" && (inputNode as MergeNode).output) {
            // Another merge node's output
            const mergeOutput = (inputNode as MergeNode).output;
            image = mergeOutput !== undefined ? mergeOutput : null;
            label = `Merged Image ${index + 1}`;
          }

          if (!image) return null;

          return { image, label };
        })
        .filter(Boolean) as { image: string; label: string }[];

      if (inputData.length < 2) throw new Error("Connect at least two nodes with images (CHARACTER nodes or processed nodes).");

      // Debug: Log what we're sending

      // Generate dynamic prompt based on number of inputs
      const prompt = generateMergePrompt(inputData);
      const imgs = inputData.map(d => d.image);

      // ORIGINAL RUNMERGE LOGIC RESTORED (HF processing commented out)
      /*
      if (!isHfProLoggedIn) {
        throw new Error("Please login with HF Pro to use fal.ai processing");
      }

      const res = await fetch("/api/hf-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "MERGE",
          images: imgs, 
          prompt
        }),
      });
      */

      // Use the process route with MERGE type
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MERGE",
          images: imgs,
          prompt,
          apiToken: apiToken || undefined
        }),
      });

      // Check if response is actually JSON before parsing
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await res.text();
        console.error("Non-JSON response received:", textResponse);
        throw new Error("Server returned an error page instead of JSON. Check your API key configuration.");
      }

      const js = await res.json();
      if (!res.ok) {
        // Show more helpful error messages
        const errorMsg = js.error || "Merge failed";
        if (errorMsg.includes("API key")) {
          throw new Error("API key not configured. Add GOOGLE_API_KEY to .env.local");
        }
        throw new Error(errorMsg);
      }
      const out = js.image || (js.images?.[0] as string) || null;
      setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, output: out, isRunning: false } : n)));

      // Update usage from API response
      if (js.usage) {
        setUsage(js.usage);
      }

      // Add merge result to node's history
      if (out) {
        const inputLabels = merge.inputs.map((id, index) => {
          const inputNode = nodes.find(n => n.id === id);
          if (inputNode?.type === "CHARACTER") {
            return (inputNode as CharacterNode).label || `Character ${index + 1}`;
          }
          return `${inputNode?.type || 'Node'} ${index + 1}`;
        });

      }
    } catch (e: any) {
      console.error("Merge error:", e);
      setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, isRunning: false, error: e?.message || "Error" } : n)));
    }
  };

  // Calculate SVG bounds for connection lines
  const svgBounds = useMemo(() => {
    let minX = 0, minY = 0, maxX = 1000, maxY = 1000;
    nodes.forEach(node => {
      minX = Math.min(minX, node.x - 100);
      minY = Math.min(minY, node.y - 100);
      maxX = Math.max(maxX, node.x + 500);
      maxY = Math.max(maxY, node.y + 500);
    });
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [nodes]);

  // Connection paths with bezier curves
  const connectionPaths = useMemo(() => {
    const getNodeOutputPort = (n: AnyNode) => {
      // Different nodes have different widths
      const widths: Record<string, number> = {
        CHARACTER: 340,
        MERGE: 420,
        BACKGROUND: 320,
        CLOTHES: 320,
        BLEND: 320,
        EDIT: 320,
        CAMERA: 360,
        AGE: 280,
        FACE: 340,
      };
      const width = widths[n.type] || 320;
      return { x: n.x + width - 10, y: n.y + 25 };
    };

    const getNodeInputPort = (n: AnyNode) => ({ x: n.x + 10, y: n.y + 25 });

    const createPath = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const controlOffset = Math.min(200, Math.max(50, distance * 0.3));
      return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
    };

    const paths: { path: string; active?: boolean; processing?: boolean }[] = [];

    // Handle all connections
    for (const node of nodes) {
      if (node.type === "MERGE") {
        // MERGE node with multiple inputs
        const merge = node as MergeNode;
        for (const inputId of merge.inputs) {
          const inputNode = nodes.find(n => n.id === inputId);
          if (inputNode) {
            const start = getNodeOutputPort(inputNode);
            const end = getNodeInputPort(node);
            const isProcessing = merge.isRunning; // Only animate to the currently processing merge node
            paths.push({
              path: createPath(start.x, start.y, end.x, end.y),
              processing: isProcessing
            });
          }
        }
      } else if ((node as any).input) {
        // Single input nodes
        const inputId = (node as any).input;
        const inputNode = nodes.find(n => n.id === inputId);
        if (inputNode) {
          const start = getNodeOutputPort(inputNode);
          const end = getNodeInputPort(node);
          const isProcessing = (node as any).isRunning; // Only animate to the currently processing node
          paths.push({
            path: createPath(start.x, start.y, end.x, end.y),
            processing: isProcessing
          });
        }
      }
    }

    // Dragging path
    if (draggingFrom && dragPos) {
      const sourceNode = nodes.find(n => n.id === draggingFrom);
      if (sourceNode) {
        const start = getNodeOutputPort(sourceNode);
        paths.push({
          path: createPath(start.x, start.y, dragPos.x, dragPos.y),
          active: true
        });
      }
    }

    return paths;
  }, [nodes, draggingFrom, dragPos]);

  // Panning & zooming
  const isPanning = useRef(false);
  const panStart = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only pan if clicking directly on the background
    if (e.target !== e.currentTarget && !((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "line")) return;
    isPanning.current = true;
    panStart.current = { sx: e.clientX, sy: e.clientY, ox: tx, oy: ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBackgroundPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current || !panStart.current) return;
    const dx = e.clientX - panStart.current.sx;
    const dy = e.clientY - panStart.current.sy;
    setTx(panStart.current.ox + dx);
    setTy(panStart.current.oy + dy);
  };
  const onBackgroundPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isPanning.current = false;
    panStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const oldScale = scaleRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(2.5, Math.max(0.25, oldScale * factor));
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY, rect, tx, ty, oldScale);
    // keep cursor anchored while zooming
    const ntx = e.clientX - rect.left - wx * newScale;
    const nty = e.clientY - rect.top - wy * newScale;
    setTx(ntx);
    setTy(nty);
    setScale(newScale);
  };

  // Context menu for adding nodes
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [menuWorld, setMenuWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const world = screenToWorld(e.clientX, e.clientY, rect, tx, ty, scale);
    setMenuWorld(world);

    // Menu dimensions
    const menuWidth = 224; // w-56 = 224px
    const menuHeight = 320; // Approximate height with max-h-[300px] + padding

    // Calculate position relative to container
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // Adjust if menu would go off right edge
    if (x + menuWidth > rect.width) {
      x = rect.width - menuWidth - 10;
    }

    // Adjust if menu would go off bottom edge  
    if (y + menuHeight > rect.height) {
      y = rect.height - menuHeight - 10;
    }

    // Ensure minimum margins from edges
    x = Math.max(10, x);
    y = Math.max(10, y);

    setMenuPos({ x, y });
    setMenuOpen(true);
  };

  const addFromMenu = (kind: NodeType) => {
    const commonProps = {
      id: uid(),
      x: menuWorld.x,
      y: menuWorld.y,
    };

    switch (kind) {
      case "CHARACTER":
        addCharacter(menuWorld);
        break;
      case "MERGE":
        addMerge(menuWorld);
        break;
      case "BACKGROUND":
        setNodes(prev => [...prev, { ...commonProps, type: "BACKGROUND", backgroundType: "color" } as BackgroundNode]);
        break;
      case "CLOTHES":
        setNodes(prev => [...prev, { ...commonProps, type: "CLOTHES" } as ClothesNode]);
        break;
      case "BLEND":
        setNodes(prev => [...prev, { ...commonProps, type: "BLEND", blendStrength: 50 } as BlendNode]);
        break;
      case "STYLE":
        setNodes(prev => [...prev, { ...commonProps, type: "STYLE", styleStrength: 50 } as StyleNode]);
        break;
      case "CAMERA":
        setNodes(prev => [...prev, { ...commonProps, type: "CAMERA" } as CameraNode]);
        break;
      case "AGE":
        setNodes(prev => [...prev, { ...commonProps, type: "AGE", targetAge: 30 } as AgeNode]);
        break;
      case "FACE":
        setNodes(prev => [...prev, { ...commonProps, type: "FACE", faceOptions: {} } as FaceNode]);
        break;
      case "EDIT":
        setNodes(prev => [...prev, { ...commonProps, type: "EDIT" } as EditNode]);
        break;
      case "LIGHTNING":
        setNodes(prev => [...prev, { ...commonProps, type: "LIGHTNING", lightingStrength: 75 } as LightningNode]);
        break;
      case "POSES":
        setNodes(prev => [...prev, { ...commonProps, type: "POSES", poseStrength: 60 } as PosesNode]);
        break;
    }
    setMenuOpen(false);
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-card/70 backdrop-blur">
        <h1 className="text-lg font-semibold tracking-wide">
          <span className="mr-2" aria-hidden>🍌</span>Nano Banana Editor
        </h1>
        <div className="flex items-center gap-3">
          {/* Processing Mode Toggle */}
          <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${processingMode === 'nanobananapro'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => setProcessingMode('nanobananapro')}
              title="Use Google Gemini API - supports all features including MERGE"
            >
              🍌 Nano Banana
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${processingMode === 'huggingface'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => setProcessingMode('huggingface')}
              title="Use HuggingFace models - requires HF login"
            >
              🤗 HuggingFace
            </button>
          </div>

          {/* Conditional UI based on processing mode */}
          {processingMode === 'nanobananapro' ? (
            <>
              <div className="h-6 w-px bg-border" />
              {/* Usage info when not using own API key */}
              {!apiToken && usage && (
                <div className={`text-xs px-2 py-1 rounded-md ${usage.remaining > 5
                  ? 'bg-green-500/20 text-green-400'
                  : usage.remaining > 0
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
                  }`}>
                  {usage.remaining}/{usage.limit} free requests
                </div>
              )}
              {apiToken && (
                <div className="text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-400">
                  Using your API key ✓
                </div>
              )}
              <label htmlFor="api-token" className="text-sm font-medium text-muted-foreground">
                API Key:
              </label>
              <Input
                id="api-token"
                type="password"
                placeholder={apiToken ? "Your key is set" : "Optional - using free tier"}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-48"
              />
            </>
          ) : (
            <>
              <div className="h-6 w-px bg-border" />
              {/* HF Login Button / User Info */}
              {isHfProLoggedIn && hfUser ? (
                <div className="flex items-center gap-2">
                  {hfUser.avatarUrl && (
                    <img
                      src={hfUser.avatarUrl}
                      alt={hfUser.name || 'User'}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-sm font-medium">{hfUser.name || hfUser.username}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleHfProLogin}
                  >
                    Logout
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8"
                  onClick={handleHfProLogin}
                  disabled={isCheckingAuth}
                >
                  {isCheckingAuth ? "Checking..." : "Login with HuggingFace"}
                </Button>
              )}

              {/* Model Selector - only show when logged in */}
              {isHfProLoggedIn && (
                <>
                  <label htmlFor="hf-model" className="text-sm font-medium text-muted-foreground">
                    Model:
                  </label>
                  <select
                    id="hf-model"
                    value={selectedHfModel}
                    onChange={(e) => setSelectedHfModel(e.target.value as keyof typeof HF_MODELS)}
                    className="h-8 px-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Object.entries(HF_MODELS).map(([key, model]) => (
                      <option key={key} value={key}>
                        {model.name} ({model.type})
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}

          <div className="h-6 w-px bg-border" />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3"
            type="button"
            onClick={() => setShowHelpSidebar(true)}
          >
            Help
          </Button>
        </div>
      </header>

      {/* Help Sidebar */}
      {showHelpSidebar && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setShowHelpSidebar(false)}
          />
          {/* Sidebar */}
          <div className="fixed right-0 top-0 h-full w-96 bg-card/95 backdrop-blur border-l border-border/60 shadow-xl z-[9999] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Help & Guide</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowHelpSidebar(false)}
                >
                  <span className="text-lg">×</span>
                </Button>
              </div>

              <div className="space-y-6">
                {/* Processing Modes Explanation */}
                <div>
                  <h3 className="font-semibold mb-3 text-foreground">⚙️ Processing Modes</h3>
                  <div className="text-sm text-muted-foreground space-y-3">
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <p className="font-medium text-primary mb-2">🍌 Nano Banana (Gemini API)</p>
                      <p>Uses Google's Gemini API. <strong>Supports ALL nodes</strong> including MERGE for combining multiple images into group photos.</p>
                      <p className="mt-1 text-xs">Requires a Google Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AI Studio</a>.</p>
                    </div>
                    <div className="p-3 bg-secondary border border-border rounded-lg">
                      <p className="font-medium text-secondary-foreground mb-2">🤗 HuggingFace Models</p>
                      <p>Uses HuggingFace inference API with models like FLUX.1-Kontext and Qwen-Image-Edit. Supports single-image editing nodes.</p>
                      <p className="mt-1 text-xs">Requires HuggingFace login. Uses your HF inference credits.</p>
                    </div>
                  </div>
                </div>

                {/* MERGE Warning */}
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <h4 className="font-semibold text-destructive mb-2">⚠️ MERGE Node Limitation</h4>
                  <p className="text-sm text-muted-foreground">
                    The <strong>MERGE</strong> node requires <strong>Nano Banana</strong> because it combines multiple images into one cohesive group photo. HuggingFace models only accept single images, so MERGE won't work in HuggingFace mode.
                  </p>
                </div>

                {/* Available HF Models */}
                <div>
                  <h3 className="font-semibold mb-3 text-foreground">🤖 HuggingFace Models</h3>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium">FLUX.1 Kontext</p>
                      <p className="text-xs">Image editing with context understanding</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium">Qwen Image Edit</p>
                      <p className="text-xs">Powerful image editing and manipulation</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium">FLUX.1 Dev</p>
                      <p className="text-xs">Text-to-image generation (for CHARACTER nodes)</p>
                    </div>
                  </div>
                </div>

                {/* How to Use */}
                <div>
                  <h3 className="font-semibold mb-3 text-foreground">🎨 How to Use the Editor</h3>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>• <strong>Adding Nodes:</strong> Right-click on the canvas to add nodes</p>
                    <p>• <strong>Character Nodes:</strong> Upload or drag images as starting points</p>
                    <p>• <strong>Merge Nodes:</strong> Connect multiple characters (Nano Banana only)</p>
                    <p>• <strong>Editing Nodes:</strong> Background, Style, Face, Age, Camera, etc.</p>
                    <p>• <strong>Connecting:</strong> Drag from output port to input port</p>
                  </div>
                </div>

                {/* Privacy */}
                <div className="p-4 bg-muted border border-border rounded-lg">
                  <h4 className="font-semibold text-foreground mb-2">🔒 Privacy & Security</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>• Gemini API keys are stored locally in your browser</p>
                    <p>• HuggingFace tokens are stored in secure HTTP-only cookies</p>
                    <p>• All processing happens through official APIs</p>
                    <p>• No data is stored on our servers</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        ref={containerRef}
        className="relative w-full h-[calc(100svh-56px)] overflow-hidden nb-canvas"
        style={{
          imageRendering: "auto",
          transform: "translateZ(0)",
          willChange: "contents"
        }}
        onContextMenu={onContextMenu}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={(e) => {
          onBackgroundPointerMove(e);
          handlePointerMove(e);
        }}
        onPointerUp={(e) => {
          onBackgroundPointerUp(e);
          handlePointerUp();
        }}
        onPointerLeave={(e) => {
          onBackgroundPointerUp(e);
          handlePointerUp();
        }}
        onWheel={onWheel}
      >
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: "0 0",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden"
          }}
        >
          <svg
            className="absolute pointer-events-none z-0"
            style={{
              left: `${svgBounds.x}px`,
              top: `${svgBounds.y}px`,
              width: `${svgBounds.width}px`,
              height: `${svgBounds.height}px`
            }}
            viewBox={`${svgBounds.x} ${svgBounds.y} ${svgBounds.width} ${svgBounds.height}`}
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {connectionPaths.map((p, idx) => (
              <path
                key={idx}
                className={p.processing ? "connection-processing connection-animated" : ""}
                d={p.path}
                fill="none"
                stroke={p.processing ? undefined : (p.active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))")}
                strokeWidth={p.processing ? undefined : "2.5"}
                strokeDasharray={p.active && !p.processing ? "5,5" : undefined}
                style={p.active && !p.processing ? undefined : (!p.processing ? { opacity: 0.9 } : {})}
              />
            ))}
          </svg>

          <div className="relative z-10">
            {nodes.map((node) => {
              switch (node.type) {
                case "CHARACTER":
                  return (
                    <CharacterNodeView
                      key={node.id}
                      node={node as CharacterNode}
                      scaleRef={scaleRef}
                      onChangeImage={setCharacterImage}
                      onChangeLabel={setCharacterLabel}
                      onStartConnection={handleStartConnection}
                      onUpdatePosition={updateNodePosition}
                      onDelete={deleteNode}
                    />
                  );
                case "MERGE":
                  return (
                    <MergeNodeView
                      key={node.id}
                      node={node as MergeNode}
                      scaleRef={scaleRef}
                      allNodes={nodes}
                      onDisconnect={disconnectFromMerge}
                      onRun={runMerge}
                      onEndConnection={handleEndConnection}
                      onStartConnection={handleStartConnection}
                      onUpdatePosition={updateNodePosition}
                      onDelete={deleteNode}
                      onClearConnections={clearMergeConnections}
                    />
                  );
                case "BACKGROUND":
                  return (
                    <BackgroundNodeView
                      key={node.id}
                      node={node as BackgroundNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "CLOTHES":
                  return (
                    <ClothesNodeView
                      key={node.id}
                      node={node as ClothesNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "STYLE":
                  return (
                    <StyleNodeView
                      key={node.id}
                      node={node as StyleNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "EDIT":
                  return (
                    <EditNodeView
                      key={node.id}
                      node={node as EditNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "CAMERA":
                  return (
                    <CameraNodeView
                      key={node.id}
                      node={node as CameraNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "AGE":
                  return (
                    <AgeNodeView
                      key={node.id}
                      node={node as AgeNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "FACE":
                  return (
                    <FaceNodeView
                      key={node.id}
                      node={node as FaceNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "LIGHTNING":
                  return (
                    <LightningNodeView
                      key={node.id}
                      node={node as LightningNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                case "POSES":
                  return (
                    <PosesNodeView
                      key={node.id}
                      node={node as PosesNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                    />
                  );
                default:
                  return null;
              }
            })}
          </div>
        </div>

        {menuOpen && (
          <div
            className="absolute z-50 rounded-xl border border-border bg-popover/95 backdrop-blur p-1 w-56 shadow-2xl text-popover-foreground"
            style={{ left: menuPos.x, top: menuPos.y }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="px-3 py-2 text-xs text-muted-foreground">Add node</div>
            <div
              className="max-h-[300px] overflow-y-auto scrollbar-thin pr-1"
              onWheel={(e) => e.stopPropagation()}
            >
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("CHARACTER")}>CHARACTER</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("MERGE")}>MERGE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("BACKGROUND")}>BACKGROUND</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("CLOTHES")}>CLOTHES</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("STYLE")}>STYLE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("EDIT")}>EDIT</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("CAMERA")}>CAMERA</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("AGE")}>AGE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("FACE")}>FACE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("LIGHTNING")}>LIGHTNING</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("POSES")}>POSES</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

