/**
 * PORTRAIT EDITOR - MAIN APPLICATION COMPONENT
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
// Framer Motion for smooth animations
import { motion } from "framer-motion";
// Provider icons (lobehub)
import Gemini from '@lobehub/icons/es/Gemini';
import OpenAI from '@lobehub/icons/es/OpenAI';
import HuggingFace from '@lobehub/icons/es/HuggingFace';
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
  AngleNodeView,       // Camera angle modifications
  NodeTimer,           // Timer component
  setCanvasScale,      // Keeps node-drag deltas zoom-corrected
} from "./nodes";
// UI components from shadcn/ui library
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
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
type NodeType = "CHARACTER" | "MERGE" | "BACKGROUND" | "CLOTHES" | "STYLE" | "EDIT" | "CAMERA" | "AGE" | "FACE" | "BLEND" | "LIGHTNING" | "POSES" | "ANGLE";

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
  input?: string;
  output?: string;
  focalLength?: string;
  aperture?: string;
  whiteBalance?: string;
  angle?: string;
  filmStyle?: string;
  lightingSetup?: string;      // Geometry: Rembrandt, Split, Butterfly, etc.
  lightingQuality?: string;    // Character: soft/hard, golden hour, high/low key
  bokeh?: string;              // Lens character (anamorphic, petzval, mirror)
  composition?: string;
  aspectRatio?: string;
  motionBlur?: string;
  isRunning?: boolean;
  error?: string | null;
};

/**
 * ANGLE node - Adjusts camera angle/position visually
 * Allows users to specify the camera position by moving a camera icon on a 2D plane
 */
type AngleNode = NodeBase & {
  type: "ANGLE";
  input?: string;              // Source node ID
  output?: string;             // Image with angle applied
  cameraX?: number;            // Yaw — horizontal orbit around subject (-1 to 1)
  cameraY?: number;            // Pitch — vertical orbit around subject (-1 to 1)
  cameraZ?: number;            // Distance — closer (0) to farther (1)
  isRunning?: boolean;         // Processing state
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
type AnyNode = CharacterNode | MergeNode | BackgroundNode | ClothesNode | StyleNode | EditNode | CameraNode | AgeNode | FaceNode | BlendNode | LightningNode | PosesNode | AngleNode;

/* ========================================
   CONSTANTS AND UTILITY FUNCTIONS
   ======================================== */

/**
 * Default placeholder image for new CHARACTER nodes
 * Uses Unsplash image as a starting point before users upload their own images
 */
const DEFAULT_PERSON = "/reo.png";
const CHARACTER_GLASS_VIDEO_SRC = "https://d8j0ntlcm91z4.cloudfront.net/user_34DpnLwtmxkLgtVe8psPn1j2G8i/hf_20260510_115212_9d7d0835-d6dd-4287-823d-9c5313f88aba.mp4";

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

// Rendered width of each node type — must stay in sync with the w-[...px]
// classes on the node view components. Used to position connection lines.
const NODE_WIDTHS: Record<string, number> = {
  CHARACTER: 340,
  MERGE: 420,
  BACKGROUND: 320,
  CLOTHES: 320,
  EDIT: 320,
  CAMERA: 360,
  AGE: 280,
  FACE: 340,
  STYLE: 320,
  LIGHTNING: 320,
  POSES: 320,
  ANGLE: 320,
};

// Port centers measured from the rendered header layout (px-3 py-2 header,
// 11px port): 12px padding + half port + border = 18.5 in, 19 down
const getNodeOutputPortPos = (n: AnyNode) => ({
  x: n.x + (NODE_WIDTHS[n.type] || 320) - 18.5,
  y: n.y + 19,
});
const getNodeInputPortPos = (n: AnyNode) => ({ x: n.x + 18.5, y: n.y + 19 });

// While dragging a connection, the line snaps to an input port within this
// distance (screen pixels — divided by zoom before comparing in world units)
const SNAP_RADIUS_PX = 48;

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
  connected,
  onStartConnection,
  onEndConnection,
  onDisconnect,
}: {
  className?: string;
  nodeId?: string;
  isOutput?: boolean;
  connected?: boolean;
  onStartConnection?: (nodeId: string) => void;
  onEndConnection?: (nodeId: string) => void;
  onDisconnect?: (nodeId: string) => void;
}) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (isOutput && nodeId && onStartConnection) {
      onStartConnection(nodeId);
    } else if (!isOutput && connected && nodeId && onDisconnect) {
      onDisconnect(nodeId);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Connect only when the user RELEASES on an input port (drag & drop).
    // Releases on output ports bubble up so the canvas can end the drag.
    if (!isOutput && nodeId && onEndConnection) {
      e.stopPropagation();
      onEndConnection(nodeId);
    }
  };

  return (
    <div
      className={cx("nb-port", className, isOutput ? "out" : "in", connected && "nb-port--connected")}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      title={
        isOutput
          ? "Drag from here to connect to another node's input"
          : connected
            ? "Pull to disconnect"
            : "Drop a connection here"
      }
    />
  );
}



function CharacterNodeView({
  node,
  scaleRef,
  outputConnected,
  onChangeImage,
  onChangeLabel,
  onStartConnection,
  onUpdatePosition,
  onDelete,
}: {
  node: CharacterNode;
  scaleRef: React.MutableRefObject<number>;
  outputConnected?: boolean;
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

  const [editingLabel, setEditingLabel] = useState(false);

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
      className="nb-node nb-character-node absolute w-[340px] select-none overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={onPaste}
    >
      <video
        className="nb-character-video"
        src={CHARACTER_GLASS_VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="nb-character-glass" aria-hidden="true" />
      <div
        className="nb-header relative z-10 cursor-grab active:cursor-grabbing rounded-t-[14px] px-3 py-2 flex items-center justify-between"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {editingLabel ? (
          <input
            autoFocus
            className="bg-transparent outline-none text-sm font-semibold tracking-wide flex-1 border-b border-white/20 focus:border-white/50 text-white/90 placeholder:text-white/50"
            value={node.label || ""}
            placeholder="CHARACTER"
            onChange={(e) => onChangeLabel(node.id, e.target.value)}
            onBlur={() => setEditingLabel(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-sm font-semibold tracking-wide flex-1 cursor-text truncate"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setEditingLabel(true);
            }}
            title="Click to rename"
          >
            {node.label || "CHARACTER"}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Port
            className="out"
            nodeId={node.id}
            isOutput={true}
            connected={outputConnected}
            onStartConnection={onStartConnection}
          />
        </div>
      </div>
      <div className="relative z-10 p-3 space-y-3">
        <label
          className="aspect-[4/5] w-full rounded-xl bg-black/20 grid place-items-center overflow-hidden border border-white/15 cursor-pointer group relative shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          title="Click to upload, drag an image here, or right-click to copy"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const files = e.currentTarget.files;
              if (files && files.length > 0) {
                const [first] = await toDataUrls(files);
                if (first) onChangeImage(node.id, first);
                try {
                  e.currentTarget.value = "";
                } catch { }
              }
            }}
          />
          <img
            src={node.image}
            alt="character"
            className="h-full w-full object-contain group-hover:opacity-80 transition-opacity"
            draggable={false}
            onContextMenu={async (e) => {
              e.preventDefault();
              try {
                const response = await fetch(node.image);
                const blob = await response.blob();
                await navigator.clipboard.write([
                  new ClipboardItem({ [blob.type]: blob })
                ]);

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
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-white/80 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-center">
            Click or drop image to replace
          </div>
        </label>
      </div>
    </div>
  );
}

function MergeNodeView({
  node,
  scaleRef,
  allNodes,
  outputConnected,
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
  onRun: (mergeId: string) => void;
  onEndConnection: (mergeId: string) => void;
  onStartConnection: (nodeId: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onClearConnections: (mergeId: string) => void;
  outputConnected?: boolean;
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
          connected={node.inputs.length > 0}
          onEndConnection={onEndConnection}
          onDisconnect={() => onClearConnections(node.id)}
        />
        <div className="font-semibold tracking-wide text-sm flex-1 text-center">MERGE</div>
        <div className="flex items-center gap-2">
          <Port
            className="out"
            nodeId={node.id}
            isOutput={true}
            connected={outputConnected}
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
              </div>
            );
          })}
        </div>
        {node.inputs.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Drag from any node's output port to connect</p>
        )}
        <div className="flex items-center gap-2">
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
            <div className="text-xs text-muted-foreground">Output</div>
          </div>
          <div className="w-full min-h-[200px] max-h-[400px] rounded-xl bg-muted/40 dark:bg-black/40 grid place-items-center">
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
              <span className="text-muted-foreground/70 text-xs py-16">Run merge to see result</span>
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
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
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
    setCanvasScale(scale);
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
          // Returning from HF login: make sure HuggingFace is the active mode
          if (data.isLoggedIn) setProcessingMode('huggingface');
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
  // Mirrors of the state above for window-level pointer listeners, which
  // would otherwise see stale values from the closure they were created in
  const draggingFromRef = useRef<string | null>(null);
  const dragPosRef = useRef<{ x: number, y: number } | null>(null);

  // API Token state - REQUIRED for all users (no free tier)
  const [apiToken, setApiToken] = useState("");
  const [openaiApiToken, setOpenaiApiToken] = useState("");
  const [showHelpSidebar, setShowHelpSidebar] = useState(false);

  // Accent colour — persisted to localStorage, applied via CSS variable override
  const ACCENT_COLORS = [
    { name: "Red",    hsl: "0 75% 55%" },
    { name: "Orange", hsl: "24 88% 52%" },
    { name: "Amber",  hsl: "43 96% 48%" },
    { name: "Lime",   hsl: "84 60% 42%" },
    { name: "Teal",   hsl: "172 58% 40%" },
    { name: "Sky",    hsl: "200 80% 50%" },
    { name: "Blue",   hsl: "217 80% 58%" },
    { name: "Violet", hsl: "263 68% 60%" },
    { name: "Pink",   hsl: "328 68% 57%" },
    { name: "Rose",   hsl: "350 72% 54%" },
  ] as const;
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("nb-accent") || "0 75% 55%";
    }
    return "0 75% 55%";
  });
  useEffect(() => {
    document.documentElement.style.setProperty("--primary", accentColor);
    localStorage.setItem("nb-accent", accentColor);
  }, [accentColor]);

  // Processing Mode: 'gpt' uses OpenAI, 'gemini' uses Gemini, 'huggingface' uses HF models
  type ProcessingMode = 'gpt' | 'gemini' | 'huggingface';
  // HuggingFace is the default. The OAuth login is a full-page redirect, so
  // defaulting here also keeps HF selected when the user comes back logged in.
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('huggingface');

  // Image generation models (Gemini + OpenAI)
  const IMAGE_MODELS = {
    "gemini-2.5-flash-image":         { provider: "gemini" as const, label: "Gemini 2.5 Flash Image" },
    "gemini-3-pro-image-preview":     { provider: "gemini" as const, label: "Gemini 3 Pro Image" },
    "gemini-3.1-flash-image-preview": { provider: "gemini" as const, label: "Gemini 3.1 Flash Image" },
    "gpt-image-1":                    { provider: "openai" as const, label: "GPT Image 1" },
  } as const;
  type ImageModelKey = keyof typeof IMAGE_MODELS;
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModelKey>("gemini-2.5-flash-image");

  // Switch processing mode and reset selected model to that provider's default
  const switchProcessingMode = (mode: ProcessingMode) => {
    setProcessingMode(mode);
    if (mode === 'gemini') setSelectedImageModel('gemini-2.5-flash-image');
    else if (mode === 'gpt') setSelectedImageModel('gpt-image-1');
  };

  // Available HF models
  const HF_MODELS = {
    "Qwen-Image-2.1": {
      id: "Qwen/Qwen-Image-2.1",
      name: "Qwen Image 2.1",
      type: "image-to-image",
      description: "Latest Qwen image editing and generation model",
    },
  };

  const [selectedHfModel, setSelectedHfModel] = useState<keyof typeof HF_MODELS>("Qwen-Image-2.1");


  // HF PRO AUTHENTICATION
  const [isHfProLoggedIn, setIsHfProLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hfUser, setHfUser] = useState<{ name?: string; username?: string; avatarUrl?: string } | null>(null);


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
      // Remove the node and clean up every connection that referenced it:
      // MERGE nodes drop it from their inputs[], single-input nodes clear
      // their input pointer so they don't keep a dangling connection.
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
          if ((n as any).input === id) {
            return { ...n, input: undefined };
          }
          return n;
        });
    });
  };

  const duplicateNode = (id: string) => {
    setNodes((prev) => {
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      const copy: any = {
        ...src,
        id: uid(),
        x: src.x + 40,
        y: src.y + 40,
        // Drop transient/processed state from the duplicate
        input: undefined,
        inputs: src.type === "MERGE" ? [] : (src as any).inputs,
        output: undefined,
        isRunning: false,
        startTime: undefined,
        executionTime: undefined,
        error: null,
      };
      return [...prev, copy];
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


  // Check whether `targetId` is reachable upstream from `sourceId`.
  // Used to reject connections that would create a cycle: if the node we
  // want to feed INTO is already an ancestor of the source, the new edge
  // would close a loop (A -> ... -> B -> A).
  const isReachableUpstream = (sourceId: string, targetId: string): boolean => {
    const visited = new Set<string>();
    const walk = (id: string): boolean => {
      if (id === targetId) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      const n = nodes.find(nd => nd.id === id);
      if (!n) return false;
      const single = (n as any).input;
      if (typeof single === "string" && walk(single)) return true;
      const multi = (n as any).inputs;
      if (Array.isArray(multi)) {
        for (const upstreamId of multi) {
          if (walk(upstreamId)) return true;
        }
      }
      return false;
    };
    return walk(sourceId);
  };

  const finishConnectionDrag = () => {
    setDraggingFrom(null);
    setDragPos(null);
    draggingFromRef.current = null;
    dragPosRef.current = null;
    document.body.classList.remove('nb-connecting');
    // Re-enable text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  };

  // Find the input port within snapping distance of the drag position,
  // skipping the source node, nodes without inputs, and invalid targets
  const findSnapTarget = (pos: { x: number; y: number }, sourceId: string): AnyNode | null => {
    const radius = SNAP_RADIUS_PX / (scaleRef.current || 1);
    let best: AnyNode | null = null;
    let bestDist = radius;
    for (const n of nodes) {
      if (n.id === sourceId || n.type === "CHARACTER") continue;
      if (isReachableUpstream(sourceId, n.id)) continue; // would create a loop
      const p = getNodeInputPortPos(n);
      const d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  };

  // Complete the drag: connect to the snapped input port if one is close
  // enough, otherwise cancel. Used by the canvas and the window fallback.
  const completeConnectionDrag = () => {
    const sourceId = draggingFromRef.current;
    const pos = dragPosRef.current;
    if (sourceId && pos) {
      const target = findSnapTarget(pos, sourceId);
      if (target) {
        if (target.type === "MERGE") {
          handleEndConnection(target.id);
        } else {
          handleEndSingleConnection(target.id);
        }
        return;
      }
    }
    finishConnectionDrag();
  };

  // Safety net: finish the drag even when the pointer is released outside
  // the canvas (over the header, another window edge, etc.)
  useEffect(() => {
    if (!draggingFrom) return;
    const onWindowPointerUp = () => completeConnectionDrag();
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingFrom, nodes]);

  // Handle single input connections for new nodes
  const handleEndSingleConnection = (nodeId: string) => {
    if (draggingFrom) {
      const sourceId = draggingFrom;
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (sourceNode) {
        // Reject self-connections and connections that would create a loop
        if (sourceId === nodeId || isReachableUpstream(sourceId, nodeId)) {
          setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, error: "Invalid connection: this would create a loop." } : n
          ));
        } else {
          // Allow connections from ANY node that has an output port:
          // CHARACTER, MERGE, and processing nodes (even unprocessed ones,
          // for configuration chaining)
          setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, input: sourceId, error: null } : n
          ));
        }
      }
      finishConnectionDrag();
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
        if (cam.whiteBalance && cam.whiteBalance !== "None") config.whiteBalance = cam.whiteBalance;
        if (cam.angle && cam.angle !== "None") config.angle = cam.angle;
        if (cam.filmStyle && cam.filmStyle !== "None") config.filmStyle = cam.filmStyle;
        // Combine setup + quality into a single 'lighting' string the API already understands
        {
          const parts = [cam.lightingSetup, cam.lightingQuality].filter((v): v is string => !!v && v !== "None");
          if (parts.length) config.lighting = parts.join(", ");
        }
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
      case "ANGLE":
        const angleNode = node as AngleNode;
        if (angleNode.cameraX !== undefined && angleNode.cameraY !== undefined) {
          config.cameraX = angleNode.cameraX;
          config.cameraY = angleNode.cameraY;
          if (angleNode.cameraZ !== undefined) {
            config.cameraZ = angleNode.cameraZ;
          }
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
      // Outputs of merges executed during this run. setNodes is async, so the
      // `nodes` array in this closure never sees those outputs — this map does.
      const mergeOutputs = new Map<string, string>();

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

        // If this MERGE was executed earlier in this run, use that output
        if (currentNode.type === "MERGE" && mergeOutputs.has(currentNodeId)) {
          return mergeOutputs.get(currentNodeId) || null;
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
            // Mark this merge for processing (only once)
            if (!unprocessedMerges.some(m => m.id === merge.id)) {
              unprocessedMerges.push(merge);
            }
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

            // Track that we processed this merge as part of the chain.
            // Record the output locally too: the setNodes update above won't
            // be visible to findSourceImage's stale `nodes` closure.
            processedNodes.push(merge.id);
            if (mergeOutput) {
              mergeOutputs.set(merge.id, mergeOutput);
            }

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
        // Use HuggingFace models (requires OAuth login)
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
        // Use Gemini / OpenAI API
        res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "COMBINED",
            image: inputImage,
            params,
            model: selectedImageModel,
            apiToken: processingMode === "gemini" ? (apiToken || undefined) : undefined,
            openaiApiToken: processingMode === "gpt" ? (openaiApiToken || undefined) : undefined,
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
    draggingFromRef.current = nodeId;
    // Anchor the preview line at the output port so it doesn't jump
    const sourceNode = nodes.find(n => n.id === nodeId);
    if (sourceNode) {
      const p = getNodeOutputPortPos(sourceNode);
      setDragPos(p);
      dragPosRef.current = p;
    }
    // Lets CSS highlight all droppable input ports during the drag
    document.body.classList.add('nb-connecting');
    // Prevent text selection during dragging
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  };

  const handleEndConnection = (mergeId: string) => {
    if (draggingFrom) {
      const sourceId = draggingFrom;
      // Allow connections from any node type that could have an output
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (sourceNode) {
        // Reject self-connections and connections that would create a loop
        if (sourceId === mergeId || isReachableUpstream(sourceId, mergeId)) {
          setNodes(prev => prev.map(n =>
            n.id === mergeId ? { ...n, error: "Invalid connection: this would create a loop." } : n
          ));
        } else {
          // Allow connections from CHARACTER nodes, processed nodes,
          // and processing nodes (for future processing)
          connectToMerge(mergeId, sourceId);
        }
      }
      finishConnectionDrag();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Read the ref, not state: a move can arrive before the pointerdown's
    // state update has rendered, and it must not be dropped
    if (draggingFromRef.current) {
      const rect = containerRef.current!.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect, tx, ty, scale);
      setDragPos(world);
      dragPosRef.current = world;
    }
  };

  const handlePointerUp = () => {
    if (draggingFrom) {
      // Connect if released near an input port, otherwise cancel
      completeConnectionDrag();
    }
  };
  // Resolve the nearest available image for a node feeding a MERGE:
  // a CHARACTER image, the node's own output, or the nearest upstream
  // image reached through unprocessed single-input nodes.
  const resolveUpstreamImage = (startId: string): { image: string | null; label: string } => {
    const visited = new Set<string>();
    let id: string | undefined = startId;
    while (id && !visited.has(id)) {
      visited.add(id);
      const n = nodes.find(nd => nd.id === id);
      if (!n) break;
      if (n.type === "CHARACTER") {
        return { image: (n as CharacterNode).image, label: (n as CharacterNode).label || "" };
      }
      const out = (n as any).output;
      if (out) {
        return { image: out, label: n.type === "MERGE" ? "Merged Image" : `${n.type} Output` };
      }
      // An unprocessed MERGE has no single upstream image to fall back to
      if (n.type === "MERGE") break;
      id = (n as any).input;
    }
    return { image: null, label: "" };
  };

  const executeMerge = async (merge: MergeNode): Promise<string | null> => {
    // Get images from merge inputs - now accepts any node type, including
    // chains where the image sits further upstream of an unprocessed node
    const mergeImages: string[] = [];
    const inputData: { image: string; label: string }[] = [];

    for (const inputId of merge.inputs) {
      const { image, label } = resolveUpstreamImage(inputId);

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
        model: selectedImageModel,
        apiToken: processingMode === "gemini" ? (apiToken || undefined) : undefined,
        openaiApiToken: processingMode === "gpt" ? (openaiApiToken || undefined) : undefined,
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
        error: "MERGE requires a multi-image model. HuggingFace models only accept single images. Please switch to Gemini or GPT in the header and enter your API key."
      } : n)));
      return;
    }

    setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, isRunning: true, error: null } : n)));
    try {
      const merge = (nodes.find((n) => n.id === mergeId) as MergeNode) || null;
      if (!merge) return;

      // Get input nodes with their labels - now accepts any node type,
      // resolving images through chains of unprocessed nodes
      const inputData = merge.inputs
        .map((id, index) => {
          const { image, label } = resolveUpstreamImage(id);
          if (!image) return null;
          return { image, label: label || `Input ${index + 1}` };
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
          model: selectedImageModel,
          apiToken: processingMode === "gemini" ? (apiToken || undefined) : undefined,
          openaiApiToken: processingMode === "gpt" ? (openaiApiToken || undefined) : undefined,
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
    // Keep the connection-drag preview line inside the SVG canvas
    if (dragPos) {
      minX = Math.min(minX, dragPos.x - 100);
      minY = Math.min(minY, dragPos.y - 100);
      maxX = Math.max(maxX, dragPos.x + 100);
      maxY = Math.max(maxY, dragPos.y + 100);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [nodes, dragPos]);

  // Connection paths with bezier curves
  const connectionPaths = useMemo(() => {
    const createPath = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const controlOffset = Math.min(200, Math.max(50, distance * 0.3));
      return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
    };

    const paths: { path: string; active?: boolean; snapped?: boolean; processing?: boolean }[] = [];
    let snapPoint: { x: number; y: number } | null = null;

    // Handle all connections
    for (const node of nodes) {
      if (node.type === "MERGE") {
        // MERGE node with multiple inputs
        const merge = node as MergeNode;
        for (const inputId of merge.inputs) {
          const inputNode = nodes.find(n => n.id === inputId);
          if (inputNode) {
            const start = getNodeOutputPortPos(inputNode);
            const end = getNodeInputPortPos(node);
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
          const start = getNodeOutputPortPos(inputNode);
          const end = getNodeInputPortPos(node);
          const isProcessing = (node as any).isRunning; // Only animate to the currently processing node
          paths.push({
            path: createPath(start.x, start.y, end.x, end.y),
            processing: isProcessing
          });
        }
      }
    }

    // Dragging preview: snap to a valid input port when close enough so the
    // user can see exactly where the connection will land before releasing
    if (draggingFrom && dragPos) {
      const sourceNode = nodes.find(n => n.id === draggingFrom);
      if (sourceNode) {
        const start = getNodeOutputPortPos(sourceNode);
        const snapTarget = findSnapTarget(dragPos, draggingFrom);
        const end = snapTarget ? getNodeInputPortPos(snapTarget) : dragPos;
        if (snapTarget) snapPoint = end;
        paths.push({
          path: createPath(start.x, start.y, end.x, end.y),
          active: true,
          snapped: !!snapTarget
        });
      }
    }

    return { paths, snapPoint };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, draggingFrom, dragPos, scale]);

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

  // Pan/zoom refs so the native wheel listener never reads stale state
  const txRef = useRef(tx);
  const tyRef = useRef(ty);
  useEffect(() => {
    txRef.current = tx;
    tyRef.current = ty;
  }, [tx, ty]);

  // Wheel behaviour (registered natively with passive:false so we can
  // preventDefault the browser's own Ctrl+wheel page zoom):
  //   wheel             -> pan up/down (trackpads also pan sideways)
  //   Shift + wheel     -> pan left/right
  //   Ctrl/Cmd + wheel  -> zoom at cursor (trackpad pinch sends this too)
  // Wheel events over scrollable content (node panels, the right-click menu,
  // textareas) scroll that content instead of panning the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Walk up from the event target looking for an element that can still
    // scroll in the wheel direction — if found, the browser handles it.
    const findScrollableTarget = (start: EventTarget | null, deltaY: number): HTMLElement | null => {
      let cur = start instanceof Element ? start : null;
      while (cur && cur !== el) {
        if (cur instanceof HTMLElement) {
          const style = getComputedStyle(cur);
          const scrollableY = /(auto|scroll)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight + 1;
          if (scrollableY) {
            const canScrollMore = deltaY > 0
              ? cur.scrollTop + cur.clientHeight < cur.scrollHeight - 1
              : cur.scrollTop > 0;
            if (canScrollMore) return cur;
          }
        }
        cur = cur.parentElement;
      }
      return null;
    };

    // Batch pan updates to one React commit per frame — applying every wheel
    // event individually makes fast scrolling feel choppy on a big canvas
    const panAccum = { x: 0, y: 0 };
    let rafId: number | null = null;
    const applyPan = () => {
      rafId = null;
      txRef.current -= panAccum.x;
      tyRef.current -= panAccum.y;
      panAccum.x = 0;
      panAccum.y = 0;
      setTx(txRef.current);
      setTy(tyRef.current);
    };
    const schedulePan = (dx: number, dy: number) => {
      panAccum.x += dx;
      panAccum.y += dy;
      if (rafId === null) rafId = requestAnimationFrame(applyPan);
    };

    const onWheelNative = (e: WheelEvent) => {
      // Normalize line/page delta modes (Firefox) to pixels
      const norm = (v: number) => (e.deltaMode === 1 ? v * 16 : e.deltaMode === 2 ? v * 100 : v);

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const oldScale = scaleRef.current;
        const factor = Math.exp(-norm(e.deltaY) * 0.0015);
        const newScale = Math.min(2.5, Math.max(0.25, oldScale * factor));
        // keep cursor anchored while zooming
        const wx = (e.clientX - rect.left - txRef.current) / oldScale;
        const wy = (e.clientY - rect.top - tyRef.current) / oldScale;
        const ntx = e.clientX - rect.left - wx * newScale;
        const nty = e.clientY - rect.top - wy * newScale;
        txRef.current = ntx;
        tyRef.current = nty;
        scaleRef.current = newScale;
        setTx(ntx);
        setTy(nty);
        setScale(newScale);
        return;
      }

      // Let scrollable content under the cursor consume the wheel first
      if (findScrollableTarget(e.target, norm(e.deltaY))) {
        return; // no preventDefault — browser scrolls the element natively
      }

      // Anywhere over a floating menu/popup: never pan the canvas underneath,
      // even when its list is already scrolled to the end
      if (e.target instanceof Element && e.target.closest('.nb-overlay')) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (e.shiftKey) {
        // Some devices report shift+wheel as deltaX, others as deltaY
        schedulePan(norm(e.deltaY !== 0 ? e.deltaY : e.deltaX), 0);
      } else {
        schedulePan(norm(e.deltaX), norm(e.deltaY));
      }
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Context menu for adding nodes
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [menuWorld, setMenuWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Per-node context menu (Duplicate / Delete)
  const [nodeMenu, setNodeMenu] = useState<{ open: boolean; x: number; y: number; nodeId: string | null }>({
    open: false, x: 0, y: 0, nodeId: null,
  });

  const openNodeContextMenu = (nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    const baseX = rect ? e.clientX - rect.left : e.clientX;
    const baseY = rect ? e.clientY - rect.top : e.clientY;
    const menuW = 160;
    const menuH = 88;
    const maxW = rect ? rect.width : window.innerWidth;
    const maxH = rect ? rect.height : window.innerHeight;
    const x = Math.max(8, Math.min(baseX, maxW - menuW - 8));
    const y = Math.max(8, Math.min(baseY, maxH - menuH - 8));
    setMenuOpen(false);
    setNodeMenu({ open: true, x, y, nodeId });
  };

  const closeNodeMenu = () => setNodeMenu((m) => ({ ...m, open: false, nodeId: null }));

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
      case "ANGLE":
        setNodes(prev => [...prev, { ...commonProps, type: "ANGLE", cameraX: 0, cameraY: 0, cameraZ: 0.5 } as AngleNode]);
        break;
    }
    setMenuOpen(false);
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-card/70 backdrop-blur">
        <h1 className="text-lg font-semibold tracking-wide">
          <span className="mr-2" aria-hidden>🖼️</span>Portrait Editor
        </h1>
        <div className="flex items-center gap-3">
          {/* Processing Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-card rounded-lg relative border border-border shadow-sm">
            {(['gpt', 'gemini', 'huggingface'] as const).map((mode) => (
              <button
                key={mode}
                className={`relative px-4 py-1.5 text-sm font-medium rounded-md transition-colors z-10 ${
                  processingMode === mode
                    ? 'text-primary-foreground'
                    : 'text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
                onClick={() => switchProcessingMode(mode)}
                title={
                  mode === 'gpt' ? "Use OpenAI GPT image models" :
                  mode === 'gemini' ? "Use Google Gemini image models - supports all features including MERGE" :
                  "Use HuggingFace models - requires HF login"
                }
              >
                {processingMode === mode && (
                  <motion.div
                    layoutId="active-mode-pill"
                    className="absolute inset-0 bg-primary rounded-md shadow-sm border border-primary/50 -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {mode === 'gpt' && <OpenAI size={14} />}
                  {mode === 'gemini' && <Gemini.Color size={14} />}
                  {mode === 'huggingface' && <HuggingFace.Color size={14} />}
                  <span>{mode === 'gpt' ? 'GPT' : mode === 'gemini' ? 'Gemini' : 'HuggingFace'}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Conditional UI based on processing mode */}
          {processingMode === 'gemini' ? (
            <>
              <div className="h-6 w-px bg-border" />
              <Select
                id="image-model"
                value={selectedImageModel}
                onChange={(e) => setSelectedImageModel(e.target.value as ImageModelKey)}
                className="w-52"
              >
                {Object.entries(IMAGE_MODELS)
                  .filter(([, m]) => m.provider === 'gemini')
                  .map(([key, model]) => (
                    <option key={key} value={key}>{model.label}</option>
                  ))}
              </Select>

              {apiToken ? (
                <div className="text-xs px-2 py-1 rounded-md bg-green-500/20 text-green-400">
                  Gemini key set ✓
                </div>
              ) : (
                <div className="text-xs px-2 py-1 rounded-md bg-red-500/20 text-red-400">
                  Gemini key required
                </div>
              )}
              <Input
                id="api-token"
                type="password"
                placeholder="Gemini API key"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-44"
              />
            </>
          ) : processingMode === 'gpt' ? (
            <>
              <div className="h-6 w-px bg-border" />
              <Select
                id="image-model"
                value={selectedImageModel}
                onChange={(e) => setSelectedImageModel(e.target.value as ImageModelKey)}
                className="w-44"
              >
                {Object.entries(IMAGE_MODELS)
                  .filter(([, m]) => m.provider === 'openai')
                  .map(([key, model]) => (
                    <option key={key} value={key}>{model.label}</option>
                  ))}
              </Select>

              {openaiApiToken ? (
                <div className="text-xs px-2 py-1 rounded-md bg-green-500/20 text-green-400">
                  OpenAI key set ✓
                </div>
              ) : (
                <div className="text-xs px-2 py-1 rounded-md bg-red-500/20 text-red-400">
                  OpenAI key required
                </div>
              )}
              <Input
                id="openai-token"
                type="password"
                placeholder="OpenAI API key"
                value={openaiApiToken}
                onChange={(e) => setOpenaiApiToken(e.target.value)}
                className="w-44"
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
            className="fixed inset-0 bg-black/60 z-[9998]"
            onClick={() => setShowHelpSidebar(false)}
          />
          {/* Sidebar */}
          <div className="fixed right-0 top-0 h-full w-[26rem] bg-card border-l border-border shadow-2xl z-[9999] overflow-y-auto scrollbar-thin">
            <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between sticky top-0 bg-card z-10">
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">Help &amp; Guide</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Modes, models, shortcuts &amp; tips</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-md hover:bg-muted"
                onClick={() => setShowHelpSidebar(false)}
                aria-label="Close help"
              >
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>

            <div className="p-6 space-y-7">
              {/* Accent colour */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Accent Colour</h3>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_COLORS.map((c) => {
                    const isActive = accentColor === c.hsl;
                    return (
                      <button
                        key={c.hsl}
                        title={c.name}
                        onClick={() => setAccentColor(c.hsl)}
                        className="w-8 h-8 rounded-full border-2 transition-all duration-150 hover:scale-110 focus:outline-none flex items-center justify-center"
                        style={{
                          backgroundColor: `hsl(${c.hsl})`,
                          borderColor: isActive ? "rgba(255,255,255,0.9)" : "transparent",
                          boxShadow: isActive ? `0 0 0 3px hsl(${c.hsl} / 0.55)` : undefined,
                        }}
                      >
                        {isActive && (
                          <svg
                            viewBox="0 0 10 8"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="white"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.7))" }}
                          >
                            <path d="M1 4l3 3 5-6" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Quick start */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick start</h3>
                <ol className="text-sm text-foreground/90 space-y-2 list-decimal list-inside marker:text-muted-foreground">
                  <li>Pick a mode in the navbar — <strong>GPT</strong>, <strong>Gemini</strong>, or <strong>HuggingFace</strong>.</li>
                  <li>Paste the matching API key (kept in memory only — cleared on refresh).</li>
                  <li>Right-click blank canvas to add a Character or any other node.</li>
                  <li>Right-click any node to duplicate it or delete it.</li>
                  <li>Drag from a green output port to a red input port to wire nodes together.</li>
                  <li>Click <strong>Run</strong> on a node to process the chain up to that point.</li>
                </ol>
              </section>

              {/* Canvas controls */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Canvas controls</h3>
                <div className="p-3 rounded-lg border border-border bg-muted/40">
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li><strong className="text-foreground">Zoom in / out</strong> — hold <kbd className="text-xs px-1.5 py-0.5 rounded bg-background/60 border border-border/60">Ctrl</kbd> (or <kbd className="text-xs px-1.5 py-0.5 rounded bg-background/60 border border-border/60">Cmd</kbd> on Mac) and scroll the mouse wheel. Pinch on a trackpad works too. Zoom centres on your cursor.</li>
                    <li><strong className="text-foreground">Scroll up / down</strong> — just scroll the mouse wheel.</li>
                    <li><strong className="text-foreground">Scroll left / right</strong> — hold <kbd className="text-xs px-1.5 py-0.5 rounded bg-background/60 border border-border/60">Shift</kbd> and scroll.</li>
                    <li><strong className="text-foreground">Pan freely</strong> — click and drag any empty canvas area.</li>
                    <li><strong className="text-foreground">Move a node</strong> — drag it by its header.</li>
                    <li><strong className="text-foreground">Connect nodes</strong> — drag from a green port; the line snaps to a red input port when you get close, then release.</li>
                    <li><strong className="text-foreground">Disconnect</strong> — grab the red input port and pull the connection off.</li>
                    <li>Scrolling while hovering a node panel or menu with its own scrollbar scrolls that content instead of the canvas.</li>
                  </ul>
                </div>
              </section>

              {/* Processing Modes */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Processing Modes</h3>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-border bg-muted/40">
                    <p className="font-medium text-foreground mb-1 flex items-center gap-2">
                      <OpenAI size={16} /> GPT <span className="text-xs text-muted-foreground font-normal">(OpenAI)</span>
                    </p>
                    <p className="text-sm text-muted-foreground">Calls the OpenAI Responses API with the <code className="text-xs px-1 py-0.5 rounded bg-background/60 border border-border/60">image_generation</code> tool. Supports text-to-image and image edit nodes including MERGE.</p>
                    <p className="text-xs text-muted-foreground mt-2">Model: <strong className="text-foreground">gpt-image-1</strong>. Get a key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a>.</p>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-muted/40">
                    <p className="font-medium text-foreground mb-1 flex items-center gap-2">
                      <Gemini.Color size={16} /> Gemini <span className="text-xs text-muted-foreground font-normal">(Google)</span>
                    </p>
                    <p className="text-sm text-muted-foreground">Google Gemini image models. Pick from the model dropdown — Flash for speed, Pro for quality, preview variants for the latest.</p>
                    <p className="text-xs text-muted-foreground mt-2">Models: <strong className="text-foreground">2.5-flash-image</strong>, <strong className="text-foreground">3-pro-image-preview</strong>, <strong className="text-foreground">3.1-flash-image-preview</strong>. Key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AI Studio</a>.</p>
                  </div>

                  <div className="p-3 rounded-lg border border-border bg-muted/40">
                    <p className="font-medium text-foreground mb-1 flex items-center gap-2">
                      <HuggingFace.Color size={16} /> HuggingFace
                    </p>
                    <p className="text-sm text-muted-foreground">Qwen-Image-2.1 via our HuggingFace Gradio Space. Single-image edits only — no MERGE.</p>
                    <p className="text-xs text-muted-foreground mt-2">Sign in with HuggingFace; uses your GPU quota.</p>
                  </div>
                </div>
              </section>

              {/* MERGE compatibility */}
              <section className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                <h4 className="text-sm font-semibold text-amber-400 mb-1">⚠️ MERGE compatibility</h4>
                <p className="text-sm text-muted-foreground">
                  <strong>MERGE</strong> needs a multi-image model. It works with <strong>GPT</strong> and <strong>Gemini</strong>, but not HuggingFace.
                </p>
              </section>

              {/* Node types */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Node types</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Character</p>
                    <p className="text-xs text-muted-foreground">Upload, paste, or drop an image.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Merge</p>
                    <p className="text-xs text-muted-foreground">Combine 2+ characters into one scene.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Background</p>
                    <p className="text-xs text-muted-foreground">Color, gradient, scene, or reference image.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Style</p>
                    <p className="text-xs text-muted-foreground">Anime, cyberpunk, Van Gogh, etc.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Face / Pose</p>
                    <p className="text-xs text-muted-foreground">Expressions, hair, body posing.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Age / Camera / Light</p>
                    <p className="text-xs text-muted-foreground">Transform photographic feel.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Angle</p>
                    <p className="text-xs text-muted-foreground">Control a 3D Earth camera orbit and zoom.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Clothes</p>
                    <p className="text-xs text-muted-foreground">Swap outfits using a reference.</p>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40 border border-border/60">
                    <p className="font-medium text-foreground">Edit</p>
                    <p className="text-xs text-muted-foreground">Free-form prompt for any change.</p>
                  </div>
                </div>
              </section>

              {/* Tips & shortcuts */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tips &amp; shortcuts</h3>
                <ul className="text-sm text-foreground/90 space-y-1.5">
                  <li><span className="text-muted-foreground">•</span> <strong>Right-click</strong> blank canvas to add nodes.</li>
                  <li><span className="text-muted-foreground">•</span> <strong>Right-click</strong> a node to duplicate or delete it.</li>
                  <li><span className="text-muted-foreground">•</span> <strong>Drag</strong> a node header to move it; <strong>scroll</strong> the canvas to zoom.</li>
                  <li><span className="text-muted-foreground">•</span> <strong>Drag</strong> from the green output port to a red input port.</li>
                  <li><span className="text-muted-foreground">•</span> <strong>Drag</strong> the Angle node 3D Earth to orbit; <strong>scroll</strong> it to adjust distance.</li>
                  <li><span className="text-muted-foreground">•</span> <strong>Paste</strong> an image from clipboard directly into Character / Background.</li>
                  <li><span className="text-muted-foreground">•</span> Hover a node to see its <strong>elapsed time</strong> badge.</li>
                </ul>
              </section>

              {/* Privacy */}
              <section className="p-3 rounded-lg border border-border bg-muted/40">
                <h4 className="text-sm font-semibold text-foreground mb-2">🔒 Privacy &amp; keys</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>OpenAI</strong> and <strong>Gemini</strong> keys live in memory only — cleared the moment you refresh.</li>
                  <li>• <strong>HuggingFace</strong> auth uses a secure HTTP-only cookie.</li>
                  <li>• Requests go directly to the official provider APIs from this server.</li>
                  <li>• Nothing is persisted to a database.</li>
                </ul>
              </section>
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
          // Stop panning, but keep an in-progress connection drag alive —
          // the window-level pointerup listener completes or cancels it
          onBackgroundPointerUp(e);
        }}
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
            {connectionPaths.paths.map((p, idx) => (
              <path
                key={idx}
                className={
                  p.processing
                    ? "connection-processing"
                    : p.snapped
                      ? "connection-snapped"
                      : p.active
                        ? "connection-dragging"
                        : ""
                }
                d={p.path}
                fill="none"
                stroke={p.processing || p.snapped || p.active ? undefined : "hsl(var(--muted-foreground))"}
                strokeWidth={p.processing || p.snapped || p.active ? undefined : "2.5"}
                style={!p.processing && !p.snapped && !p.active ? { opacity: 0.9 } : {}}
              />
            ))}
            {connectionPaths.snapPoint && (
              <circle
                className="connection-snap-ring"
                cx={connectionPaths.snapPoint.x}
                cy={connectionPaths.snapPoint.y}
                r="10"
              />
            )}
          </svg>

          <div className="relative z-10">
            {(() => {
              const connectedOutputIds = new Set<string>();
              for (const n of nodes) {
                const inp = (n as any).input;
                if (typeof inp === "string") connectedOutputIds.add(inp);
                const inps = (n as any).inputs;
                if (Array.isArray(inps)) for (const id of inps) connectedOutputIds.add(id);
              }
              return nodes.map((node) => {
                const outputConnected = connectedOutputIds.has(node.id);
                const wrap = (child: React.ReactNode) => (
                  <div
                    key={node.id}
                    onContextMenu={(e) => openNodeContextMenu(node.id, e)}
                  >
                    {child}
                  </div>
                );
                switch (node.type) {
                case "CHARACTER":
                  return wrap(
                    <CharacterNodeView
                      key={node.id}
                      node={node as CharacterNode}
                      scaleRef={scaleRef}
                      outputConnected={outputConnected}
                      onChangeImage={setCharacterImage}
                      onChangeLabel={setCharacterLabel}
                      onStartConnection={handleStartConnection}
                      onUpdatePosition={updateNodePosition}
                      onDelete={deleteNode}
                    />
                  );
                case "MERGE":
                  return wrap(
                    <MergeNodeView
                      key={node.id}
                      node={node as MergeNode}
                      scaleRef={scaleRef}
                      allNodes={nodes}
                      outputConnected={outputConnected}
                      onRun={runMerge}
                      onEndConnection={handleEndConnection}
                      onStartConnection={handleStartConnection}
                      onUpdatePosition={updateNodePosition}
                      onDelete={deleteNode}
                      onClearConnections={clearMergeConnections}
                    />
                  );
                case "BACKGROUND":
                  return wrap(
                    <BackgroundNodeView
                      key={node.id}
                      node={node as BackgroundNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "CLOTHES":
                  return wrap(
                    <ClothesNodeView
                      key={node.id}
                      node={node as ClothesNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "STYLE":
                  return wrap(
                    <StyleNodeView
                      key={node.id}
                      node={node as StyleNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "EDIT":
                  return wrap(
                    <EditNodeView
                      key={node.id}
                      node={node as EditNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "CAMERA":
                  return wrap(
                    <CameraNodeView
                      key={node.id}
                      node={node as CameraNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "AGE":
                  return wrap(
                    <AgeNodeView
                      key={node.id}
                      node={node as AgeNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "FACE":
                  return wrap(
                    <FaceNodeView
                      key={node.id}
                      node={node as FaceNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "LIGHTNING":
                  return wrap(
                    <LightningNodeView
                      key={node.id}
                      node={node as LightningNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "POSES":
                  return wrap(
                    <PosesNodeView
                      key={node.id}
                      node={node as PosesNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                case "ANGLE":
                  return wrap(
                    <AngleNodeView
                      key={node.id}
                      node={node as AngleNode}
                      onDelete={deleteNode}
                      onUpdate={updateNode}
                      onStartConnection={handleStartConnection}
                      onEndConnection={handleEndSingleConnection}
                      onProcess={processNode}
                      onUpdatePosition={updateNodePosition}
                      outputConnected={outputConnected}
                    />
                  );
                default:
                  return null;
                }
              });
            })()}
          </div>
        </div>

        {nodeMenu.open && nodeMenu.nodeId && (
          <div
            className="nb-overlay absolute z-50 rounded-xl border border-border bg-popover/95 backdrop-blur p-1 w-40 shadow-2xl text-popover-foreground"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
            onMouseLeave={closeNodeMenu}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors"
              onClick={() => {
                if (nodeMenu.nodeId) duplicateNode(nodeMenu.nodeId);
                closeNodeMenu();
              }}
            >
              Duplicate
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/15 rounded-lg transition-colors"
              onClick={() => {
                const id = nodeMenu.nodeId;
                closeNodeMenu();
                if (id) deleteNode(id);
              }}
            >
              Delete
            </button>
          </div>
        )}
        {menuOpen && (
          <div
            className="nb-overlay absolute z-50 rounded-xl border border-border bg-popover/95 backdrop-blur p-1 w-56 shadow-2xl text-popover-foreground"
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
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors" onClick={() => addFromMenu("ANGLE")}>ANGLE</button>
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

