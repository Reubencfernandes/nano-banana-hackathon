/**
 * NODE COMPONENT VIEWS FOR NANO BANANA EDITOR
 * 
 * This file contains all the visual node components for the Nano Banana Editor,
 * a visual node-based AI image processing application. Each node represents a
 * specific image transformation or effect that can be chained together to create
 * complex image processing workflows.
 * 
 * ARCHITECTURE OVERVIEW:
 * - Each node is a self-contained React component with its own state and UI
 * - Nodes use a common dragging system (useNodeDrag hook) for positioning
 * - All nodes follow a consistent structure: Header + Content + Output
 * - Nodes communicate through a connection system using input/output ports
 * - Processing is handled asynchronously with loading states and error handling
 * 
 * NODE TYPES AVAILABLE:
 * - BackgroundNodeView: Change/generate image backgrounds (color, preset, upload, AI-generated)
 * - ClothesNodeView: Add/modify clothing on subjects (preset garments or custom uploads)
 * - StyleNodeView: Apply artistic styles and filters (anime, fine art, cinematic styles)
 * - EditNodeView: General text-based image editing (natural language instructions)
 * - CameraNodeView: Apply camera effects and settings (focal length, aperture, film styles)
 * - AgeNodeView: Transform subject age (AI-powered age progression/regression)
 * - FaceNodeView: Modify facial features and accessories (hair, makeup, expressions)
 * - LightningNodeView: Apply professional lighting effects
 * - PosesNodeView: Modify body poses and positioning
 * 
 * COMMON PATTERNS:
 * - All nodes support drag-and-drop for repositioning in the editor
 * - Input/output ports allow chaining nodes together in processing pipelines
 * - File upload via drag-drop, file picker, or clipboard paste where applicable
 * - Real-time preview of settings and processed results
 * - History navigation for viewing different processing results
 * - Error handling with user-friendly error messages
 * - AI-powered prompt improvement using Gemini API where applicable
 * 
 * USER WORKFLOW:
 * 1. Add nodes to the editor canvas
 * 2. Configure each node's settings (colors, styles, uploaded images, etc.)
 * 3. Connect nodes using input/output ports to create processing chains
 * 4. Process individual nodes or entire chains
 * 5. Preview results, navigate history, and download final images
 * 
 * TECHNICAL DETAILS:
 * - Uses React hooks for state management (useState, useEffect, useRef)
 * - Custom useNodeDrag hook handles node positioning and drag interactions
 * - Port component manages connection logic between nodes
 * - All image data is handled as base64 data URLs for browser compatibility
 * - Processing results are cached with history navigation support
 * - Responsive UI components from shadcn/ui component library
 */
// Enable React Server Components client-side rendering for this file
"use client";

// Import React core functionality for state management and lifecycle hooks
import React, { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

// Import reusable UI components from the shadcn/ui component library
import { Button } from "../components/ui/button";       // Standard button component
import { Select } from "../components/ui/select";       // Dropdown selection component  
import { Textarea } from "../components/ui/textarea";   // Multi-line text input component
import { Slider } from "../components/ui/slider";       // Range slider input component
import { ColorPicker } from "../components/ui/color-picker"; // Color selection component
import { Checkbox } from "../components/ui/checkbox";   // Checkbox input component
import { Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react";               // Icons for UI elements
import { motion } from "framer-motion";               // Animations for UI elements

/* ============================================================
   Styled delete-confirmation dialog
   - `confirmDelete(onConfirm)` opens the modal; if user confirms,
     `onConfirm()` is called.
   - `<DeleteConfirmModal />` must be mounted once in the app tree.
   ============================================================ */
type _DeleteRequest = { message: string; onConfirm: () => void };
let _deleteRequestSubscriber: ((req: _DeleteRequest | null) => void) | null = null;

export function confirmDelete(onConfirm: () => void, message = "Delete this node? This cannot be undone.") {
  if (_deleteRequestSubscriber) {
    _deleteRequestSubscriber({ message, onConfirm });
  } else {
    // Fallback if the modal isn't mounted yet
    if (window.confirm(message)) onConfirm();
  }
}

export function DeleteConfirmModal() {
  const [req, setReq] = useState<_DeleteRequest | null>(null);

  useEffect(() => {
    _deleteRequestSubscriber = setReq;
    return () => { _deleteRequestSubscriber = null; };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReq(null);
      else if (e.key === "Enter") { req.onConfirm(); setReq(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
      onPointerDown={(e) => { if (e.target === e.currentTarget) setReq(null); }}
    >
      <div className="w-[360px] rounded-xl bg-card border border-border shadow-2xl p-5 animate-in zoom-in-95 fade-in">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Delete node?</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{req.message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-4"
            onClick={() => setReq(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90 border-0"
            onClick={() => { req.onConfirm(); setReq(null); }}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Discrete-step slider — picks one value from a preset list.
 * Renders as an iPhone-style horizontal track with the active value displayed
 * above. Tick marks visualise the available stops.
 */
function PresetSlider({
  label,
  values,
  current,
  onChange,
  format,
  title,
}: {
  label: string;
  values: string[];
  current: string | undefined;
  onChange: (v: string) => void;
  format?: (v: string) => string;
  title?: string;
}) {
  const idx = Math.max(0, values.indexOf(current ?? values[0]));
  const display = format ? format(values[idx]) : values[idx];
  const maxIdx = Math.max(1, values.length - 1);
  const pct = `${(idx / maxIdx) * 100}%`;

  return (
    <div title={title}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium tabular-nums ${idx === 0 ? "text-muted-foreground/60" : "text-foreground"}`}>
          {display}
        </span>
      </div>
      <div
        className="nb-preset-slider-wrap"
        style={{ "--pct": pct } as React.CSSProperties}
      >
        <div className="nb-preset-slider-track" aria-hidden="true">
          <div className="nb-preset-slider-fill" />
        </div>
        <div className="nb-preset-slider-ticks" aria-hidden="true">
          {values.map((_, i) => (
            <span
              key={i}
              className={i <= idx ? "is-active" : undefined}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={values.length - 1}
          step={1}
          value={idx}
          onChange={(e) => onChange(values[parseInt(e.target.value, 10)])}
          onPointerDown={(e) => e.stopPropagation()}
          className="nb-preset-slider w-full"
          aria-label={label}
        />
      </div>
    </div>
  );
}

/**
 * Timer component that shows execution time
 * Uses a green checkmark when finished or a spinner when running
 */
export function NodeTimer({ startTime, executionTime, isRunning }: { startTime?: number, executionTime?: number, isRunning?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning || !startTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  if (!startTime && !executionTime) return null;

  const timeToShow = isRunning ? elapsed : (executionTime || 0);
  const seconds = (timeToShow / 1000).toFixed(1);

  return (
    <span className="flex items-center gap-1 text-[10px] font-mono font-normal opacity-70">
      {isRunning ? (
        <Loader2 className="w-3 h-3 animate-spin text-banana-500" />
      ) : (
        <span className="text-green-500 font-bold">✓</span>
      )}
      {seconds}s
    </span>
  );
}

/**
 * Helper function to download processed images
 * Creates a temporary download link and triggers the browser's download mechanism
 * 
 * @param dataUrl Base64 data URL of the image to download
 * @param filename Desired filename for the downloaded image
 */
function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement('a');  // Create an invisible anchor element for download
  link.href = dataUrl;                       // Set the base64 image data as the link target
  link.download = filename;                  // Specify the filename for the downloaded file
  document.body.appendChild(link);           // Temporarily add link to DOM (Firefox requirement)
  link.click();                             // Programmatically trigger the download
  document.body.removeChild(link);          // Remove the temporary link element from DOM
}

/**
 * Helper function to copy image to clipboard
 * Converts the image data URL to blob and copies it to clipboard
 * 
 * @param dataUrl Base64 data URL of the image to copy
 */
async function copyImageToClipboard(dataUrl: string) {
  try {
    // Fetch the data URL and convert it to a Blob object
    const response = await fetch(dataUrl);          // Fetch the base64 data URL
    const blob = await response.blob();             // Convert response to Blob format

    // The browser clipboard API only supports PNG format for images
    // If the image is not PNG, we need to convert it first
    if (blob.type !== 'image/png') {
      // Create a canvas element to handle image format conversion
      const canvas = document.createElement('canvas');    // Create invisible canvas
      const ctx = canvas.getContext('2d');                // Get 2D drawing context
      const img = new Image();                            // Create image element

      // Wait for the image to load before processing
      await new Promise((resolve) => {
        img.onload = () => {                              // When image loads
          canvas.width = img.width;                       // Set canvas width to match image
          canvas.height = img.height;                     // Set canvas height to match image
          ctx?.drawImage(img, 0, 0);                      // Draw image onto canvas
          resolve(void 0);                                // Resolve the promise
        };
        img.src = dataUrl;                                // Start loading the image
      });

      // Convert the canvas content to PNG blob
      const pngBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');  // Convert canvas to PNG blob
      });

      // Write the converted PNG blob to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })       // Create clipboard item with PNG data
      ]);
    } else {
      // Image is already PNG, copy directly to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })          // Copy original blob to clipboard
      ]);
    }
  } catch (error) {
    // Handle any errors that occur during the copy process
    console.error('Failed to copy image to clipboard:', error);
  }
}

/**
 * REUSABLE OUTPUT SECTION COMPONENT
 * 
 * This component provides a standardized output display for all node types.
 * It handles the common functionality that every node needs for showing results:
 * 
 * Key Features:
 * - Displays processed output images with click-to-copy functionality
 * - Provides download functionality with custom filenames
 * - Visual feedback when images are copied to clipboard
 * - Consistent styling across all node types
 * - Hover effects and tooltips for better UX
 * 
 * User Interactions:
 * - Left-click or right-click image to copy to clipboard
 * - Click download button to save image with timestamp
 * - Visual feedback shows when image is successfully copied
 * 
 * Technical Implementation:
 * - Converts images to clipboard-compatible format (PNG)
 * - Uses browser's native download API
 * - Provides visual feedback through temporary styling changes
 * - Handles both base64 data URLs and regular image URLs
 * 
 * @param nodeId - Unique identifier for the node (for potential future features)
 * @param output - Optional current output image (base64 data URL or image URL)
 * @param downloadFileName - Filename to use when downloading (should include extension)
 */
function NodeOutputSection({
  nodeId,              // Unique identifier for the node
  output,              // Optional current output image (base64 data URL)
  downloadFileName,    // Filename to use when downloading the image
}: {
  nodeId: string;                                                           // Node ID type definition
  output?: string;                                                          // Optional output image string
  downloadFileName: string;                                                 // Required download filename
}) {
  // If no image is available, don't render anything
  if (!output) return null;

  return (
    // Main container for output section with vertical spacing
    <div className="space-y-2">
      {/* Output header container */}
      <div className="space-y-1">
        {/* Header row with title */}
        <div className="flex items-center justify-between">
          {/* Output section label */}
          <div className="text-xs text-white/70">Output</div>
        </div>
        {/* Output image with click-to-copy functionality */}
        <img
          src={output}  // Display the output image
          className="w-full rounded cursor-pointer hover:opacity-80 transition-all duration-200 hover:ring-2 hover:ring-white/30"  // Styling with hover effects
          alt="Output"  // Accessibility description
          onClick={() => copyImageToClipboard(output)} // Left-click copies to clipboard
          onContextMenu={(e) => { // Right-click context menu handler
            e.preventDefault(); // Prevent browser context menu from appearing
            copyImageToClipboard(output); // Copy image to clipboard

            // Show brief visual feedback when image is copied
            const img = e.currentTarget; // Get the image element
            const originalTitle = img.title; // Store original tooltip text
            img.title = "Copied to clipboard!"; // Update tooltip to show success
            img.style.filter = "brightness(1.2)"; // Brighten the image briefly
            img.style.transform = "scale(0.98)"; // Slightly scale down the image

            // Reset visual feedback after 300ms
            setTimeout(() => {
              img.title = originalTitle; // Restore original tooltip
              img.style.filter = ""; // Remove brightness filter
              img.style.transform = ""; // Reset scale transform
            }, 300);
          }}
          title="Click or right-click to copy image to clipboard" // Tooltip instruction
        />
      </div>
      {/* Download button for saving the current image */}
      <Button
        className="w-full hover:bg-primary hover:text-primary-foreground transition-colors"
        variant="secondary"
        onClick={() => downloadImage(output, downloadFileName)}         // Trigger download when clicked
      >
        Download Output
      </Button>
      {/* End of main output section container */}
    </div>
  );
}

/* ========================================
   TYPE DEFINITIONS (TEMPORARY)
   ======================================== */
// Temporary type definitions - these should be imported from page.tsx in production
// These are placeholder types that allow TypeScript to compile without errors
type BackgroundNode = any;  // Node for background modification operations
type ClothesNode = any;     // Node for clothing modification operations  
type BlendNode = any;       // Node for image blending operations
type EditNode = any;        // Node for general image editing operations
type CameraNode = any;      // Node for camera effect operations
type AgeNode = any;         // Node for age transformation operations
type FaceNode = any;        // Node for facial feature modification operations

/**
 * Utility function to combine CSS class names conditionally
 * Filters out falsy values and joins remaining strings with spaces
 * Same implementation as in page.tsx for consistent styling across components
 * 
 * @param args Array of class name strings or falsy values
 * @returns Combined class name string with falsy values filtered out
 */
function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");  // Remove falsy values and join with spaces
}

/* ========================================
   SHARED COMPONENTS AND HOOKS
   ======================================== */

/**
 * Custom React hook for node dragging functionality
 * 
 * Handles the complex pointer event logic for dragging nodes around the editor.
 * Maintains local position state for smooth dragging while updating the parent
 * component's position when the drag operation completes.
 * 
 * Key Features:
 * - Smooth local position updates during drag
 * - Pointer capture for reliable drag behavior
 * - Prevents event bubbling to avoid conflicts
 * - Syncs with parent position updates
 * 
 * @param node The node object containing current position
 * @param onUpdatePosition Callback to update node position in parent state
 * @returns Object with position and event handlers for dragging
 */
// Current canvas zoom level, kept in sync by the editor page. Pointer deltas
// are in screen pixels; node positions are in world units, so drags must be
// divided by this scale or nodes drift away from the cursor when zoomed.
let canvasScale = 1;
export function setCanvasScale(scale: number) {
  canvasScale = scale || 1;
}

function useNodeDrag(node: any, onUpdatePosition?: (id: string, x: number, y: number) => void) {
  const [localPos, setLocalPos] = useState({ x: node.x, y: node.y });  // Local position for smooth dragging
  const dragging = useRef(false);                                      // Track drag state
  const start = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);  // Drag start coordinates

  // Sync local position when parent position changes
  useEffect(() => {
    setLocalPos({ x: node.x, y: node.y });
  }, [node.x, node.y]);

  /**
   * Handle pointer down - start dragging
   * Captures the pointer and records starting positions
   */
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();                                             // Prevent event bubbling
    dragging.current = true;                                         // Mark as dragging
    start.current = { sx: e.clientX, sy: e.clientY, ox: localPos.x, oy: localPos.y };  // Record start positions
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // Capture pointer for reliable tracking
  };

  /**
   * Handle pointer move - update position during drag
   * Calculates new position based on mouse movement delta
   */
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !start.current) return;  // Only process if actively dragging
    const dx = (e.clientX - start.current.sx) / canvasScale;  // Horizontal movement in world units
    const dy = (e.clientY - start.current.sy) / canvasScale;  // Vertical movement in world units
    const newX = start.current.ox + dx;                // New X position
    const newY = start.current.oy + dy;                // New Y position
    setLocalPos({ x: newX, y: newY });                 // Update local position for immediate visual feedback
    if (onUpdatePosition) onUpdatePosition(node.id, newX, newY);  // Update parent state
  };

  /**
   * Handle pointer up - end dragging
   * Releases pointer capture and resets drag state
   */
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;                                         // End dragging
    start.current = null;                                            // Clear start position
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);  // Release pointer
  };

  return { localPos, onPointerDown, onPointerMove, onPointerUp };
}

/**
 * Port component for node connections
 * 
 * Renders the small circular connection points on nodes that users can
 * drag between to create connections. Handles the pointer events for
 * starting and ending connection operations.
 * 
 * Types of ports:
 * - Input ports (left side): Receive connections from other nodes
 * - Output ports (right side): Send connections to other nodes
 * 
 * @param className Additional CSS classes to apply
 * @param nodeId The ID of the node this port belongs to
 * @param isOutput Whether this is an output port (true) or input port (false)
 * @param onStartConnection Callback when starting a connection from this port
 * @param onEndConnection Callback when ending a connection at this port
 */
function Port({
  className,
  nodeId,
  isOutput,
  connected,
  onStartConnection,
  onEndConnection,
  onDisconnect
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
      // Pull the connector off — disconnect on grab
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

/**
 * BACKGROUND NODE VIEW COMPONENT
 * 
 * Allows users to change or generate image backgrounds using various methods:
 * - Solid colors with color picker
 * - Preset background images (beach, office, studio, etc.)
 * - Custom uploaded images via file upload or drag/drop
 * - AI-generated backgrounds from text descriptions
 * 
 * Key Features:
 * - Multiple background source types (color/preset/upload/custom prompt)
 * - Drag and drop image upload functionality
 * - Paste image from clipboard support
 * - AI-powered prompt improvement using Gemini
 * - Real-time preview of uploaded images
 * - Connection management for node-based workflow
 * 
 * @param node - Background node data containing backgroundType, backgroundColor, etc.
 * @param onDelete - Callback to delete this node from the editor
 * @param onUpdate - Callback to update node properties (backgroundType, colors, images, etc.)
 * @param onStartConnection - Callback when user starts dragging from output port
 * @param onEndConnection - Callback when user drops connection on input port
 * @param onProcess - Callback to process this node and apply background changes
 * @param onUpdatePosition - Callback to update node position when dragged
 * @param getNodeHistoryInfo - Function to get processing history for this node
 * @param navigateNodeHistory - Function to navigate through different processing results
 * @param getCurrentNodeImage - Function to get the current processed image
 */
export function BackgroundNodeView({
  node,
  onDelete,
  onUpdate,
  onStartConnection,
  onEndConnection,
  onProcess,
  onUpdatePosition,
  outputConnected,
}: any) {
  // Use custom drag hook to handle node positioning in the editor
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Handle image file upload from file input
   * Converts uploaded file to base64 data URL for storage and preview
   */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const reader = new FileReader();                              // Create file reader
      reader.onload = () => {
        onUpdate(node.id, { customBackgroundImage: reader.result }); // Store base64 data URL
      };
      reader.readAsDataURL(e.target.files[0]);                    // Convert file to base64
    }
  };

  /**
   * Handle image paste from clipboard
   * Supports both image files and image URLs pasted from clipboard
   */
  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;                           // Get clipboard items

    // First, try to find image files in clipboard
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {                   // Check if item is an image
        const file = items[i].getAsFile();                        // Get image file
        if (file) {
          const reader = new FileReader();                         // Create file reader
          reader.onload = () => {
            onUpdate(node.id, { customBackgroundImage: reader.result }); // Store base64 data
          };
          reader.readAsDataURL(file);                              // Convert to base64
          return;                                                  // Exit early if image found
        }
      }
    }

    // If no image files, check for text that might be image URLs
    const text = e.clipboardData.getData("text");                 // Get text from clipboard
    if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
      onUpdate(node.id, { customBackgroundImage: text });         // Use URL directly
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length) {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate(node.id, { customBackgroundImage: reader.result });
      };
      reader.readAsDataURL(files[0]);
    }
  };

  return (
    <div
      className="nb-node absolute text-white w-[320px]"
      style={{ left: localPos.x, top: localPos.y }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handleImagePaste}
    >
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">BACKGROUND<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
<Select
          className="w-full"
          value={node.backgroundType || "color"}
          onChange={(e) => onUpdate(node.id, { backgroundType: (e.target as HTMLSelectElement).value })}
        >
          <option value="color">Solid Color</option>
          <option value="gradient">Gradient Color</option>
          <option value="image">Preset Background</option>
          <option value="city">City Scene</option>
          <option value="photostudio">Photo Studio</option>
          <option value="upload">Upload Image</option>
          <option value="custom">Custom Prompt</option>
        </Select>

        {node.backgroundType === "color" && (
          <ColorPicker
            className="w-full"
            value={node.backgroundColor || "#ffffff"}
            onChange={(e) => onUpdate(node.id, { backgroundColor: (e.target as HTMLInputElement).value })}
          />
        )}

        {node.backgroundType === "gradient" && (
          <div className="space-y-3">
            <label className="text-xs text-white/70">Gradient Direction</label>
            <Select
              className="w-full"
              value={node.gradientDirection || "to right"}
              onChange={(e) => onUpdate(node.id, { gradientDirection: (e.target as HTMLSelectElement).value })}
            >
              <option value="to right">Left to Right</option>
              <option value="to left">Right to Left</option>
              <option value="to bottom">Top to Bottom</option>
              <option value="to top">Bottom to Top</option>
              <option value="to bottom right">Diagonal Top-Left to Bottom-Right</option>
              <option value="to bottom left">Diagonal Top-Right to Bottom-Left</option>
              <option value="to top right">Diagonal Bottom-Left to Top-Right</option>
              <option value="to top left">Diagonal Bottom-Right to Top-Left</option>
              <option value="radial">Radial (Center to Edge)</option>
            </Select>
            <label className="text-xs text-white/70">Start Color</label>
            <ColorPicker
              className="w-full"
              value={node.gradientStartColor || "#ff6b6b"}
              onChange={(e) => onUpdate(node.id, { gradientStartColor: (e.target as HTMLInputElement).value })}
            />
            <label className="text-xs text-white/70">End Color</label>
            <ColorPicker
              className="w-full"
              value={node.gradientEndColor || "#4ecdc4"}
              onChange={(e) => onUpdate(node.id, { gradientEndColor: (e.target as HTMLInputElement).value })}
            />
            <div
              className="w-full h-8 rounded-md border border-white/20"
              style={{
                background: node.gradientDirection === "radial"
                  ? `radial-gradient(circle, ${node.gradientStartColor || "#ff6b6b"} 0%, ${node.gradientEndColor || "#4ecdc4"} 100%)`
                  : `linear-gradient(${node.gradientDirection || "to right"}, ${node.gradientStartColor || "#ff6b6b"} 0%, ${node.gradientEndColor || "#4ecdc4"} 100%)`
              }}
              title="Gradient Preview"
            />
          </div>
        )}

        {node.backgroundType === "image" && (
          <Select
            className="w-full"
            value={node.backgroundImage || ""}
            onChange={(e) => onUpdate(node.id, { backgroundImage: (e.target as HTMLSelectElement).value })}
          >
            <option value="">Select Background</option>
            <option value="beach">Beach</option>
            <option value="office">Office</option>
            <option value="studio">Studio</option>
            <option value="nature">Nature</option>
            <option value="city">City Skyline</option>
          </Select>
        )}

        {node.backgroundType === "city" && (
          <div className="space-y-3">
            <label className="text-xs text-white/70">City Scene Type</label>
            <Select
              className="w-full"
              value={node.citySceneType || "busy_street"}
              onChange={(e) => onUpdate(node.id, { citySceneType: (e.target as HTMLSelectElement).value })}
            >
              <option value="busy_street">Busy Street with Close Pedestrians</option>
              <option value="tokyo_shibuya">Tokyo Shibuya Crossing</option>
              <option value="tokyo_subway">Tokyo Subway</option>
              <option value="times_square">Times Square NYC</option>
              <option value="downtown_skyline">Downtown Skyline</option>
              <option value="urban_crosswalk">Urban Crosswalk Scene</option>
              <option value="shopping_district">Shopping District</option>
              <option value="city_park">City Park</option>
              <option value="rooftop_view">Rooftop City View</option>
              <option value="blade_runner_street">Blade Runner Style Street</option>
              <option value="matrix_alley">Matrix Style Urban Alley</option>
            </Select>
            <label className="text-xs text-white/70">Time of Day</label>
            <Select
              className="w-full"
              value={node.cityTimeOfDay || "daytime"}
              onChange={(e) => onUpdate(node.id, { cityTimeOfDay: (e.target as HTMLSelectElement).value })}
            >
              <option value="golden_hour">Golden Hour</option>
              <option value="daytime">Daytime</option>
              <option value="blue_hour">Blue Hour</option>
              <option value="night">Night with City Lights</option>
              <option value="dawn">Dawn</option>
              <option value="overcast">Overcast Day</option>
            </Select>
          </div>
        )}

        {node.backgroundType === "photostudio" && (
          <div className="space-y-3">
            <label className="text-xs text-white/70">Studio Setup</label>
            <Select
              className="w-full"
              value={node.studioSetup || "white_seamless"}
              onChange={(e) => onUpdate(node.id, { studioSetup: (e.target as HTMLSelectElement).value })}
            >
              <option value="white_seamless">White Seamless Background</option>
              <option value="black_seamless">Black Seamless Background</option>
              <option value="grey_seamless">Grey Seamless Background</option>
              <option value="colored_seamless">Colored Seamless Background</option>
              <option value="textured_backdrop">Textured Backdrop</option>
              <option value="infinity_cove">Infinity Cove</option>
            </Select>
            {node.studioSetup === "colored_seamless" && (
              <>
                <label className="text-xs text-white/70">Background Color</label>
                <ColorPicker
                  className="w-full"
                  value={node.studioBackgroundColor || "#ffffff"}
                  onChange={(e) => onUpdate(node.id, { studioBackgroundColor: (e.target as HTMLInputElement).value })}
                />
              </>
            )}
            <label className="text-xs text-white/70">Lighting Setup</label>
            <Select
              className="w-full"
              value={node.studioLighting || "key_fill"}
              onChange={(e) => onUpdate(node.id, { studioLighting: (e.target as HTMLSelectElement).value })}
            >
              <option value="key_fill">Key + Fill Light</option>
              <option value="three_point">Three-Point Lighting</option>
              <option value="beauty_lighting">Beauty Lighting</option>
              <option value="dramatic_lighting">Dramatic Single Light</option>
              <option value="soft_lighting">Soft Diffused Lighting</option>
              <option value="hard_lighting">Hard Directional Lighting</option>
            </Select>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={node.faceCamera || false}
                onChange={(e) => onUpdate(node.id, { faceCamera: (e.target as HTMLInputElement).checked })}
                className="w-4 h-4"
              />
              <label className="text-xs text-white/70">Position character to face camera</label>
            </div>
          </div>
        )}

        {node.backgroundType === "upload" && (
          <div className="space-y-2">
            {node.customBackgroundImage ? (
              <div className="relative">
                <img src={node.customBackgroundImage} className="w-full rounded" alt="Custom Background" />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => onUpdate(node.id, { customBackgroundImage: null })}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-white/40">
                  <p className="text-xs text-white/60">Drop, upload, or paste background image</p>
                  <p className="text-xs text-white/40 mt-1">JPG, PNG, WEBP</p>
                </div>
              </label>
            )}
          </div>
        )}

        {node.backgroundType === "custom" && (
          <div className="space-y-2">
            <Textarea
              className="w-full"
              placeholder="Describe the background..."
              value={node.customPrompt || ""}
              onChange={(e) => onUpdate(node.id, { customPrompt: (e.target as HTMLTextAreaElement).value })}
              rows={2}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={async () => {
                if (!node.customPrompt) {
                  alert('Please enter a background description first');
                  return;
                }

                try {
                  const response = await fetch('/api/improve-prompt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prompt: node.customPrompt,
                      type: 'background'
                    })
                  });

                  if (response.ok) {
                    const { improvedPrompt } = await response.json();
                    onUpdate(node.id, { customPrompt: improvedPrompt });
                  } else {
                    alert('Failed to improve prompt. Please try again.');
                  }
                } catch (error) {
                  console.error('Error improving prompt:', error);
                  alert('Failed to improve prompt. Please try again.');
                }
              }}
              title="Use Gemini 2.5 Flash to improve your background prompt"
            >
              ✨ Improve with Gemini
            </Button>
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Background"}
        </Button>

        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`background-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * CLOTHES NODE VIEW COMPONENT
 * 
 * Allows users to add or modify clothing on subjects in images.
 * Supports both preset clothing options and custom uploaded garments.
 * 
 * Key Features:
 * - Preset clothing gallery (Sukajan, Blazer, Suit, Women's Outfit)
 * - Custom clothing upload via drag/drop, file picker, or clipboard paste
 * - Visual selection interface with thumbnails
 * - Real-time preview of selected clothing
 * - Integration with AI processing pipeline
 * 
 * The node processes input images and applies the selected clothing using
 * AI models that understand garment fitting and realistic clothing application.
 * 
 * @param node - Clothes node data containing clothesImage, selectedPreset, etc.
 * @param onUpdate - Callback to update node properties
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process this node
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function ClothesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  // Handle image upload via file input
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate(node.id, { clothesImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle image paste from clipboard
  const handleImagePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            onUpdate(node.id, { clothesImage: reader.result });
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length) {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate(node.id, { clothesImage: reader.result });
      };
      reader.readAsDataURL(files[0]);
    }
  };

  return (
    <div
      className="nb-node absolute w-[320px]"
      style={{ left: localPos.x, top: localPos.y }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handleImagePaste}
    >
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">CLOTHES<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
{/* Clothing Reference Image Upload Section */}
        <div className="text-xs text-muted-foreground">Reference Clothing Image (Optional)</div>
        <div className="space-y-2">
          {node.clothesImage ? (
            <div className="relative">
              <img src={node.clothesImage} className="w-full rounded max-h-40 object-contain bg-muted/30" alt="Clothing Reference" />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => onUpdate(node.id, { clothesImage: null })}
              >
                Remove
              </Button>
            </div>
          ) : (
            <label className="block">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-white/40 transition-colors">
                <p className="text-xs text-white/60">Drop, upload, or paste clothing image</p>
                <p className="text-xs text-white/40 mt-1">JPG, PNG, WEBP</p>
              </div>
            </label>
          )}
        </div>

        <div className="text-xs text-muted-foreground">Clothing Description</div>

        <Textarea
          className="w-full"
          placeholder="Describe the clothing (e.g. 'black leather jacket', 'floral summer dress', 'navy blue business suit')"
          value={node.clothesPrompt || ""}
          onChange={(e) => onUpdate(node.id, { clothesPrompt: e.target.value })}
          rows={3}
        />

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || (!node.clothesPrompt && !node.clothesImage)}
          title={!node.input ? "Connect an input first" : (!node.clothesPrompt && !node.clothesImage) ? "Enter a clothing description or upload an image" : "Apply Clothing"}
        >
          {node.isRunning ? "Processing..." : "Apply Clothes"}
        </Button>
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`clothes-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * AGE NODE VIEW COMPONENT
 * 
 * Allows users to transform the apparent age of subjects in images.
 * Uses AI age transformation models to make people appear older or younger
 * while maintaining facial features and identity.
 * 
 * Key Features:
 * - Slider-based age selection (18-100 years)
 * - Real-time age value display
 * - Preserves facial identity during transformation
 * - Smooth age progression/regression
 * 
 * The AI models understand facial aging patterns and can:
 * - Add/remove wrinkles and age lines
 * - Adjust skin texture and tone
 * - Modify facial structure subtly
 * - Maintain eye color and basic facial features
 * 
 * @param node - Age node data containing targetAge, input, output, etc.
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update node properties (targetAge)
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process age transformation
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function AgeNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  return (
    <div className="nb-node absolute w-[280px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">AGE<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
<div>
          <Slider
            label="Target Age"
            valueLabel={`${node.targetAge || 30} years`}
            min={18}
            max={100}
            value={node.targetAge || 30}
            onChange={(e) => onUpdate(node.id, { targetAge: parseInt((e.target as HTMLInputElement).value) })}
          />
        </div>
        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Age"}
        </Button>
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`age-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * CAMERA NODE VIEW COMPONENT
 * 
 * Applies professional camera settings and photographic effects to images.
 * Simulates various camera equipment, settings, and photographic techniques
 * to achieve specific visual styles and technical characteristics.
 * 
 * Key Features:
 * - Complete camera settings simulation (focal length, aperture, shutter speed, ISO)
 * - Film stock emulation (Kodak, Fuji, Ilford, etc.)
 * - Professional lighting setups (studio, natural, dramatic)
 * - Composition guides (rule of thirds, golden ratio, etc.)
 * - Bokeh effects and depth of field control
 * - Color temperature and white balance adjustment
 * - Aspect ratio modifications
 * 
 * Technical Settings Available:
 * - Focal lengths from fisheye (8mm) to telephoto (400mm)
 * - Aperture range from f/0.95 to f/22
 * - Shutter speeds from 1/8000s to 30s
 * - ISO values from 50 to 12800
 * - Professional lighting setups
 * - Film stock characteristics
 * 
 * @param node - Camera node data containing all camera settings
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update camera settings
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process camera effects
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function CameraNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  // Focal length: wide → standard → telephoto, the range a working pro actually shoots
  const focalLengths = ["None", "14mm", "24mm", "28mm", "35mm", "50mm", "70mm", "85mm", "135mm", "200mm", "400mm"];

  // Aperture: full-stop progression including f/8 and f/16 (landscape / hyperfocal)
  const apertures = ["None", "f/1.2", "f/1.4", "f/1.8", "f/2.8", "f/4", "f/5.6", "f/8", "f/11", "f/16", "f/22"];

  // White balance presets
  const whiteBalances = ["None", "2800K candlelight", "3200K tungsten", "4000K fluorescent", "5600K daylight", "6500K cloudy", "7000K shade", "8000K blue sky"];

  // Camera angle / perspective
  const angles = ["None", "eye level", "low angle", "high angle", "Dutch tilt", "bird's eye", "worm's eye", "over the shoulder", "POV"];

  // Film stocks photographers actually request today
  const filmStyles = ["None", "Kodak Portra 400", "Kodak Ektar", "Kodak Tri-X (B&W)", "Fuji 400H", "Fuji Velvia", "CineStill 800T", "Polaroid SX-70", "Black & White", "Sepia"];

  // Lighting setup — the geometry of the light
  const lightingSetups = ["None", "Rembrandt", "Split", "Butterfly (Paramount)", "Loop", "Rim / Backlit", "Silhouette", "Three-point studio", "Natural daylight"];

  // Lighting quality / mood — the character of the light
  const lightingQualities = ["None", "Soft / Diffused", "Hard / Direct", "Golden Hour", "Blue Hour", "High Key", "Low Key", "Overcast"];

  // Lens character — what shaped bokeh actually points to
  const bokehStyles = ["None", "Anamorphic (oval)", "Petzval (swirly)", "Mirror lens (donut)", "Hexagonal", "Cat Eye"];

  // Motion blur intensity (technique-specific blurs were dropped — see ANGLE / EDIT for those)
  const motionBlurOptions = ["None", "Light Motion Blur", "Medium Motion Blur", "Heavy Motion Blur"];

  return (
    <div className="nb-node absolute w-[360px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">CAMERA<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
{/* Basic Camera Settings — iPhone-style continuous sliders */}
        <div className="text-xs text-muted-foreground font-semibold mb-1">Basic Settings</div>
        <div className="space-y-3">
          <PresetSlider
            label="Focal Length"
            values={focalLengths}
            current={node.focalLength}
            onChange={(v) => onUpdate(node.id, { focalLength: v })}
            title="Drag to set focal length — wider on the left, telephoto on the right"
          />
          <PresetSlider
            label="Aperture"
            values={apertures}
            current={node.aperture}
            onChange={(v) => onUpdate(node.id, { aperture: v })}
            title="Drag to set aperture — wide open (shallow depth) on the left"
          />
          <div>
            <label className="text-xs text-muted-foreground">Motion Blur</label>
            <Select
              className="w-full"
              value={node.motionBlur || "None"}
              onChange={(e) => onUpdate(node.id, { motionBlur: (e.target as HTMLSelectElement).value })}
              title="Select Motion Blur Effect"
            >
              {motionBlurOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
        </div>

        {/* Lighting */}
        <div className="text-xs text-muted-foreground font-semibold mb-1 mt-3">Lighting</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Setup</label>
            <Select
              className="w-full"
              value={node.lightingSetup || "None"}
              onChange={(e) => onUpdate(node.id, { lightingSetup: (e.target as HTMLSelectElement).value })}
              title="Geometry of the light source(s)"
            >
              {lightingSetups.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Quality</label>
            <Select
              className="w-full"
              value={node.lightingQuality || "None"}
              onChange={(e) => onUpdate(node.id, { lightingQuality: (e.target as HTMLSelectElement).value })}
              title="Character of the light — soft vs hard, time of day, mood"
            >
              {lightingQualities.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
        </div>

        {/* Look & Feel */}
        <div className="text-xs text-muted-foreground font-semibold mb-1 mt-3">Look & Feel</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">White Balance</label>
            <Select
              className="w-full"
              value={node.whiteBalance || "None"}
              onChange={(e) => onUpdate(node.id, { whiteBalance: (e.target as HTMLSelectElement).value })}
            >
              {whiteBalances.map(w => <option key={w} value={w}>{w}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Film Stock</label>
            <Select
              className="w-full"
              value={node.filmStyle || "None"}
              onChange={(e) => onUpdate(node.id, { filmStyle: (e.target as HTMLSelectElement).value })}
            >
              {filmStyles.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Lens Character</label>
            <Select
              className="w-full"
              value={node.bokeh || "None"}
              onChange={(e) => onUpdate(node.id, { bokeh: (e.target as HTMLSelectElement).value })}
              title="Optical signature of the lens — anamorphic ovals, swirly Petzval, mirror-lens donuts"
            >
              {bokehStyles.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
        </div>

        {/* Composition Settings */}
        <div className="text-xs text-muted-foreground font-semibold mb-1 mt-3">Composition</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Camera Angle</label>
            <Select
              className="w-full"
              value={node.angle || "None"}
              onChange={(e) => onUpdate(node.id, { angle: (e.target as HTMLSelectElement).value })}
            >
              {angles.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Camera Settings"}
        </Button>
        <div className="mt-2">
          <NodeOutputSection
            nodeId={node.id}
            output={node.output}
            downloadFileName={`camera-${Date.now()}.png`}
          />
        </div>
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * FACE NODE VIEW COMPONENT
 * 
 * Provides comprehensive facial feature modification capabilities.
 * Allows users to change various aspects of faces in images including
 * hairstyles, expressions, facial hair, accessories, and makeup.
 * 
 * Key Features:
 * - Hairstyle modifications (short, long, curly, straight, etc.)
 * - Facial expression changes (happy, sad, surprised, etc.)
 * - Beard and mustache styling options
 * - Accessory addition (sunglasses, hats)
 * - Makeup application with preset styles
 * - Skin enhancement (pimple removal)
 * 
 * The AI models can:
 * - Preserve facial identity while making changes
 * - Apply realistic hair textures and colors
 * - Generate natural-looking expressions
 * - Add accessories that fit properly
 * - Apply makeup that matches lighting and skin tone
 * 
 * @param node - Face node data containing all face modification settings
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update face settings
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process face modifications
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function FaceNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  // Available hairstyle options for hair modification
  const hairstyles = ["None", "short", "long", "curly", "straight", "bald", "mohawk", "ponytail"];

  // Facial expression options for emotion changes
  const expressions = ["None", "happy", "serious", "smiling", "laughing", "sad", "surprised", "angry"];

  // Beard and facial hair styling options
  const beardStyles = ["None", "stubble", "goatee", "full beard", "mustache", "clean shaven"];

  return (
    <div className="nb-node absolute w-[340px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">FACE<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
{/* Face Enhancement Checkboxes - toggleable options for face improvements and accessories */}
        <div className="space-y-2">
          {/* Pimple removal option for skin enhancement */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={node.faceOptions?.removePimples || false}    // Default to false if not set
              onChange={(e) => onUpdate(node.id, {
                faceOptions: {
                  ...node.faceOptions,                             // Preserve existing options
                  removePimples: (e.target as HTMLInputElement).checked // Update pimple removal setting
                }
              })}
            />
            Remove pimples                                          {/* Clean up skin imperfections */}
          </label>

          {/* Sunglasses addition option */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={node.faceOptions?.addSunglasses || false}    // Default to false if not set
              onChange={(e) => onUpdate(node.id, {
                faceOptions: {
                  ...node.faceOptions,                             // Preserve existing options
                  addSunglasses: (e.target as HTMLInputElement).checked // Update sunglasses setting
                }
              })}
            />
            Add sunglasses                                          {/* Add stylish sunglasses accessory */}
          </label>

          {/* Hat addition option */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={node.faceOptions?.addHat || false}           // Default to false if not set
              onChange={(e) => onUpdate(node.id, {
                faceOptions: {
                  ...node.faceOptions,                             // Preserve existing options
                  addHat: (e.target as HTMLInputElement).checked   // Update hat setting
                }
              })}
            />
            Add hat                                                 {/* Add hat accessory */}
          </label>
        </div>

        <div>
          <label className="text-xs text-white/70">Hairstyle</label>
          <Select
            className="w-full"
            value={node.faceOptions?.changeHairstyle || "None"}
            onChange={(e) => onUpdate(node.id, {
              faceOptions: { ...node.faceOptions, changeHairstyle: (e.target as HTMLSelectElement).value }
            })}
          >
            {hairstyles.map(h => <option key={h} value={h}>{h}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs text-white/70">Expression</label>
          <Select
            className="w-full"
            value={node.faceOptions?.facialExpression || "None"}
            onChange={(e) => onUpdate(node.id, {
              faceOptions: { ...node.faceOptions, facialExpression: (e.target as HTMLSelectElement).value }
            })}
          >
            {expressions.map(e => <option key={e} value={e}>{e}</option>)}
          </Select>
        </div>

        <div>
          <label className="text-xs text-white/70">Beard</label>
          <Select
            className="w-full"
            value={node.faceOptions?.beardStyle || "None"}
            onChange={(e) => onUpdate(node.id, {
              faceOptions: { ...node.faceOptions, beardStyle: (e.target as HTMLSelectElement).value }
            })}
          >
            {beardStyles.map(b => <option key={b} value={b}>{b}</option>)}
          </Select>
        </div>

        {/* Makeup Selection Section - allows users to choose makeup application */}
        <div>
          <label className="text-xs text-muted-foreground">Makeup</label>
          <div className="grid grid-cols-2 gap-2 mt-2">              {/* 2-column grid for makeup options */}

            {/* No Makeup Option - removes or prevents makeup application */}
            <button
              className={`p-1 rounded border transition-colors ${!node.faceOptions?.selectedMakeup || node.faceOptions?.selectedMakeup === "None"
                ? "border-indigo-400 bg-indigo-500/20"             // Highlighted when selected
                : "border-white/20 hover:border-white/40"           // Default and hover states
                }`}
              onClick={() => onUpdate(node.id, {
                faceOptions: {
                  ...node.faceOptions,                               // Preserve other face options
                  selectedMakeup: "None",                            // Set makeup to none
                  makeupImage: null                                   // Clear makeup image reference
                }
              })}
              title="No makeup application - natural look"
            >
              {/* Visual placeholder for no makeup option */}
              <div className="w-full h-24 flex items-center justify-center text-xs text-muted-foreground/60 border border-dashed border-border rounded mb-1">
                No Makeup                                             {/* Text indicator for no makeup */}
              </div>
              <div className="text-xs">None</div>                  {/* Option label */}
            </button>

            {/* Makeup Application Option - applies preset makeup style */}
            <button
              className={`p-1 rounded border transition-colors ${node.faceOptions?.selectedMakeup === "Makeup"
                ? "border-primary bg-primary/20"             // Highlighted when selected
                : "border-border hover:border-primary/50"           // Default and hover states
                }`}
              onClick={() => onUpdate(node.id, {
                faceOptions: {
                  ...node.faceOptions,                               // Preserve other face options
                  selectedMakeup: "Makeup",                          // Set makeup type
                  makeupImage: "/makeup/makeup1.png"                 // Reference image for makeup style
                }
              })}
              title="Apply makeup style - enhances facial features"
            >
              {/* Makeup preview image */}
              <img
                src="/makeup/makeup1.png"
                alt="Makeup Style Preview"
                className="w-full h-24 object-contain rounded mb-1"
                title="Preview of makeup style that will be applied"
              />
              <div className="text-xs">Makeup</div>               {/* Option label */}
            </button>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Face Changes"}
        </Button>
        <div className="mt-2">
          <NodeOutputSection
            nodeId={node.id}
            output={node.output}
            downloadFileName={`face-${Date.now()}.png`}
          />
        </div>
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * STYLE NODE VIEW COMPONENT
 * 
 * Applies artistic style transfer to images, transforming them to match
 * various artistic movements, pop culture aesthetics, and visual styles.
 * 
 * Key Features:
 * - Wide variety of artistic styles (anime, fine art, pop culture)
 * - Adjustable style strength for subtle or dramatic transformations
 * - Preserves original image content while applying style characteristics
 * - Real-time style preview and processing
 * 
 * Style Categories Available:
 * - Anime styles (90s anime, My Hero Academia, Dragon Ball Z)
 * - Fine art movements (Ukiyo-e, Cubism, Post-Impressionism)
 * - Modern aesthetics (Cyberpunk, Steampunk)
 * - Pop culture (Simpsons, Family Guy, Arcane)
 * - Cinematic styles (Breaking Bad, Stranger Things)
 * 
 * The AI style transfer models can:
 * - Apply artistic brushstrokes and textures
 * - Adapt color palettes to match target styles
 * - Maintain subject recognition while stylizing
 * - Handle various image compositions and subjects
 * 
 * @param node - Style node data containing stylePreset, styleStrength, etc.
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update style settings
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process style transfer
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function StyleNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Available artistic style options with descriptive labels
   * Each style represents a different artistic movement or pop culture aesthetic
   */
  const styleOptions = [
    { value: "90s-anime", label: "90's Anime Style" },
    { value: "mha", label: "My Hero Academia Style" },
    { value: "dbz", label: "Dragon Ball Z Style" },
    { value: "ukiyo-e", label: "Ukiyo-e Style" },
    { value: "spiderverse", label: "Spiderverse Style" },
    { value: "cubism", label: "Cubism Style" },
    { value: "van-gogh", label: "Post-Impressionist (Van Gogh) Style" },
    { value: "simpsons", label: "Simpsons Style" },
    { value: "family-guy", label: "Family Guy Style" },
    { value: "pixar", label: "Pixar Style" },
    { value: "manga", label: "Manga Style" },
  ];

  return (
    <div
      className="nb-node absolute w-[320px]"
      style={{ left: localPos.x, top: localPos.y }}
    >
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">STYLE<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
<div className="text-xs text-muted-foreground">Art Style</div>
        <div className="text-xs text-muted-foreground/50 mb-2">Select an artistic style to apply to your image</div>
        <Select
          className="w-full"
          value={node.stylePreset || ""}
          onChange={(e) => onUpdate(node.id, { stylePreset: (e.target as HTMLSelectElement).value })}
        >
          <option value="">Select a style...</option>
          {styleOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        {/* Style Strength Slider - controls how strongly the style is applied */}
        <div>
          <Slider
            label="Style Strength"                                 // Slider label
            valueLabel={`${node.styleStrength || 50}%`}            // Display current percentage value
            min={0}                                                 // Minimum strength (subtle effect)
            max={100}                                               // Maximum strength (full style transfer)
            value={node.styleStrength || 50}                       // Current value (default 50%)
            onChange={(e) => onUpdate(node.id, {
              styleStrength: parseInt((e.target as HTMLInputElement).value) // Update strength value
            })}
            title="Adjust how strongly the artistic style is applied - lower values are more subtle"
          />
        </div>
        {/* Style Processing Button - triggers the style transfer operation */}
        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}                        // Start style transfer processing
          disabled={node.isRunning || !node.stylePreset}           // Disable if processing or no style selected
          title={
            !node.input ? "Connect an input first" :               // No input connection
              !node.stylePreset ? "Select a style first" :           // No style selected
                "Apply the selected artistic style to your input image" // Ready to process
          }
        >
          {/* Dynamic button text based on processing state */}
          {node.isRunning ? "Applying Style..." : "Apply Style Transfer"}
        </Button>
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`style-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * LIGHTNING NODE VIEW COMPONENT
 * 
 * Applies professional lighting effects to images to enhance mood,
 * atmosphere, and visual impact. Simulates various lighting setups
 * commonly used in photography and cinematography.
 * 
 * Key Features:
 * - Professional lighting presets (studio, natural, dramatic)
 * - Visual preset selection with thumbnails
 * - Realistic lighting simulation
 * - Shadow and highlight adjustment
 * 
 * Lighting Types Available:
 * - Studio Light: Controlled, even lighting for professional portraits
 * - Natural Light: Soft, organic lighting that mimics daylight
 * - Dramatic Light: High-contrast lighting for artistic effect
 * 
 * The lighting effects can:
 * - Add realistic shadows and highlights
 * - Enhance subject dimensionality
 * - Create mood and atmosphere
 * - Simulate professional lighting equipment
 * 
 * @param node - Lightning node data containing selectedLighting, lightingImage
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update lighting settings
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process lighting effects
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function LightningNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Available lighting preset options with text descriptions
   * Each preset uses detailed lighting prompts instead of reference images
   */
  const presetLightings = [
    {
      name: "Moody Cinematic",
      path: "/lighting/light1.png",
      prompt: "Moody cinematic portrait lighting with a sharp vertical beam of warm orange-red light cutting across the face and neck, contrasted with cool teal ambient fill on the surrounding areas. Strong chiaroscuro effect, deep shadows, high contrast between warm and cool tones, dramatic spotlight strip"
    },
    {
      name: "Dual-Tone Neon",
      path: "/lighting/light2.png",
      prompt: "Cinematic portrait lighting with strong dual-tone rim lights: deep blue light illuminating the front-left side of the face, intense red light as a rim light from the back-right, dark black background, high contrast, minimal fill light, dramatic neon glow"
    },
    {
      name: "Natural Shadow Play",
      path: "/lighting/light3.png",
      prompt: "DRAMATIC natural shadow play with hard directional sunlight filtering through foliage, creating bold contrasting patterns of light and shadow across the subject. Strong chiaroscuro effect with deep blacks and bright highlights, dappled leaf shadows dancing across face and body, creating an artistic interplay of illumination and darkness. Emphasize the sculptural quality of light carving through shadow, with sharp shadow edges and brilliant sun-kissed highlights for maximum visual impact"
    },
  ];

  /**
   * Handle selection of a lighting preset
   * Updates with the text prompt instead of reference image
   */
  const selectLighting = (lightingPath: string, lightingName: string, lightingPrompt: string) => {
    onUpdate(node.id, {
      lightingPrompt: lightingPrompt,                              // Text prompt for lighting effect
      selectedLighting: lightingName                               // Name of selected lighting preset
    });
  };

  return (
    <div className="nb-node absolute text-white w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">LIGHTNING<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
<div className="text-xs text-muted-foreground">Lighting Presets</div>

        <div className="grid grid-cols-2 gap-2">
          {presetLightings.map((preset) => (
            <button
              key={preset.name}
              className={`p-2 rounded border ${node.selectedLighting === preset.name
                ? "border-primary bg-primary/20"
                : "border-border hover:border-primary/50"
                }`}
              onClick={() => selectLighting(preset.path, preset.name, preset.prompt)}
            >
              <img
                src={preset.path}
                alt={preset.name}
                className="w-full h-24 object-contain rounded mb-1"
                title="Click to select lighting"
              />
              <div className="text-xs">{preset.name}</div>
            </button>
          ))}
        </div>

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.selectedLighting}
          title={!node.input ? "Connect an input first" : !node.selectedLighting ? "Select a lighting preset first" : "Apply lighting effect"}
        >
          {node.isRunning ? "Processing..." : "Apply Lighting"}
        </Button>

        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`lightning-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}


/**
 * POSES NODE VIEW COMPONENT
 * 
 * Modifies the pose and body positioning of subjects in images.
 * Uses AI-powered pose estimation and transfer to change how people
 * are positioned while maintaining natural proportions and anatomy.
 * 
 * Key Features:
 * - Multiple preset poses (standing, sitting variations)
 * - Visual pose selection with reference thumbnails
 * - Natural pose transfer that preserves identity
 * - Anatomically correct pose adjustments
 * 
 * Pose Categories Available:
 * - Standing poses: Various upright positions and postures
 * - Sitting poses: Different seated positions and arrangements
 * 
 * The AI pose models can:
 * - Detect and map human body keypoints
 * - Transfer poses while maintaining proportions
 * - Adjust clothing to fit new poses naturally
 * - Preserve facial features and identity
 * - Handle complex body positioning
 * 
 * @param node - Poses node data containing selectedPose, poseImage
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update pose settings
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process pose modifications
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function PosesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage, outputConnected }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Available pose preset options with text descriptions
   * Each preset uses detailed pose prompts instead of reference images
   */
  const presetPoses = [
    {
      name: "Dynamic Standing",
      path: "/poses/stand1.png",
      prompt: "A dynamic standing pose with the figure's weight shifted to one side. The right arm extends forward in a pointing gesture while the left arm hangs naturally. The figure has a slight hip tilt and appears to be in mid-movement, creating an energetic, directional composition."
    },
    {
      name: "Arms Crossed",
      path: "/poses/stand2.png",
      prompt: "A relaxed standing pose with arms crossed over the torso. The weight is distributed fairly evenly, with one leg slightly forward. The figure's posture suggests a casual, confident stance with the head tilted slightly downward in a contemplative manner."
    },
    {
      name: "Seated Composed",
      path: "/poses/sit1.png",
      prompt: "A seated pose on what appears to be a stool or high chair. The figure sits with legs crossed at the knee, creating an asymmetrical but balanced composition. The hands rest on the lap, and the overall posture is upright and composed."
    },
    {
      name: "Relaxed Lean",
      path: "/poses/sit2.png",
      prompt: "A more relaxed seated pose with the figure leaning to one side. One leg is bent and raised while the other extends downward. The figure appears to be resting or in casual repose, with arms supporting the body and creating a diagonal flow through the composition."
    },
  ];

  /**
   * Handle selection of a pose preset
   * Updates with the text prompt instead of reference image
   */
  const selectPose = (posePath: string, poseName: string, posePrompt: string) => {
    onUpdate(node.id, {
      posePrompt: posePrompt,                                      // Text prompt for pose effect
      selectedPose: poseName                                       // Name of selected pose preset
    });
  };

  return (
    <div className="nb-node absolute w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">POSES<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
<div className="text-xs text-white/70">Pose References</div>

        <div className="grid grid-cols-2 gap-2">
          {presetPoses.map((preset) => (
            <button
              key={preset.name}
              className={`p-2 rounded border ${node.selectedPose === preset.name
                ? "border-indigo-400 bg-indigo-500/20"
                : "border-white/20 hover:border-white/40"
                }`}
              onClick={() => selectPose(preset.path, preset.name, preset.prompt)}
            >
              <img
                src={preset.path}
                alt={preset.name}
                className="w-full h-24 object-contain rounded mb-1"
                title="Click to select pose"
              />
              <div className="text-xs">{preset.name}</div>
            </button>
          ))}
        </div>

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.selectedPose}
          title={!node.input ? "Connect an input first" : !node.selectedPose ? "Select a pose first" : "Apply pose modification"}
        >
          {node.isRunning ? "Processing..." : "Apply Pose"}
        </Button>

        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`poses-${Date.now()}.png`}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

/**
 * EDIT NODE VIEW COMPONENT
 * 
 * This node allows users to perform general text-based image editing operations.
 * Users can describe what they want to change about an image using natural language,
 * and the AI will attempt to apply those changes.
 * 
 * Features:
 * - Natural language editing prompts (e.g., "make it brighter", "add vintage effect")
 * - Real-time editing processing
 * - Output history with navigation
 * - Connection management for input/output workflow
 * 
 * @param node - The edit node data containing editPrompt, input, output, etc.
 * @param onUpdate - Callback to update node properties
 * @param onStartConnection - Callback when starting a connection from output port
 * @param onEndConnection - Callback when ending a connection at input port
 * @param onProcess - Callback to process this node
 * @param onUpdatePosition - Callback to update node position when dragged
 * @param getNodeHistoryInfo - Function to get history information for this node
 * @param navigateNodeHistory - Function to navigate through node history
 * @param getCurrentNodeImage - Function to get the current image for this node
 */
export function EditNodeView({
  node,
  onUpdate,
  onStartConnection,
  onEndConnection,
  onProcess,
  onUpdatePosition,
  getNodeHistoryInfo,
  navigateNodeHistory,
  getCurrentNodeImage,
  outputConnected,
}: any) {
  // Use custom hook for drag functionality - handles position updates during dragging
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Handle edit prompt changes
   */
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(node.id, { editPrompt: e.target.value });
  };

  return (
    <div className="nb-node absolute w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      {/* Node Header - Contains title and connection ports */}
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}    // Start dragging
        onPointerMove={onPointerMove}    // Handle drag movement
        onPointerUp={onPointerUp}        // End dragging
      >
        {/* Input port (left side) - where connections come in */}
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />

        {/* Node title */}
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">EDIT<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>

        <div className="flex items-center gap-1">

          {/* Output port (right side) - where connections go out */}
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>

      {/* Node Content - Contains all the controls and outputs */}
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {/* Edit prompt input */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-1">Edit Instructions</div>
          <Textarea
            className="w-full"
            placeholder="Describe what to edit (e.g., 'make it brighter', 'add more contrast', 'make it look vintage')"
            value={node.editPrompt || ""}
            onChange={handlePromptChange}
            rows={3}
          />

        </div>

        {/* Process button - starts the editing operation */}
        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.editPrompt?.trim()}
          title={
            !node.input ? "Connect an input first" :
              !node.editPrompt?.trim() ? "Enter edit instructions first" :
                "Apply the edit to the input image"
          }
        >
          {node.isRunning ? "Processing..." : "Apply Edit"}
        </Button>

        {/* Output section with history navigation and download */}
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`edit-${Date.now()}.png`}
        />

        {/* Error display */}
        {node.error && (
          <div className="text-xs text-red-400 mt-2 p-2 bg-red-900/20 rounded">
            {node.error}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ANGLE NODE VIEW COMPONENT
 * 
 * Provides a visual interface for adjusting camera position and perspective.
 * Users can drag a camera icon on a 2D plane to specify the camera's location
 * relative to the subject, allowing for precise control over the generated
 * image's viewpoint.
 * 
 * @param node - Angle node data with cameraX and cameraY positions
 * @param onUpdate - Callback to update camera position
 * @param onStartConnection - Callback for starting connection
 * @param onEndConnection - Callback for ending connection
 * @param onProcess - Callback to trigger image generation
 * @param onUpdatePosition - Callback to update node's UI position
 */
/**
 * Reusable horizontal "drag-row" control — a full-width row with a label on the
 * left and the current value on the right. Drag horizontally on the row to
 * change the value. The row fills with the brand colour to indicate progress.
 */
function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapOrbit(value: number) {
  if (!Number.isFinite(value)) return 0;
  let next = value;
  while (next > 1) next -= 2;
  while (next < -1) next += 2;
  return next;
}

function orbitVector(cameraX: number, cameraY: number, radius: number) {
  const yaw = cameraX * Math.PI;
  const pitch = clampNumber(cameraY, -0.98, 0.98) * (Math.PI / 2);

  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * radius,
    Math.sin(pitch) * radius,
    Math.cos(yaw) * Math.cos(pitch) * radius
  );
}

function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const ocean = ctx.createLinearGradient(0, 0, w, h);
  ocean.addColorStop(0, "#0f766e");
  ocean.addColorStop(0.38, "#0ea5e9");
  ocean.addColorStop(0.72, "#1d4ed8");
  ocean.addColorStop(1, "#075985");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#d9f99d";
  ctx.lineWidth = 1;
  for (let y = 64; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + Math.sin(y * 0.04) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const project = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];

  const drawLand = (points: Array<[number, number]>, fill = "#66a65f") => {
    ctx.beginPath();
    points.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  drawLand([[-168, 70], [-132, 72], [-104, 58], [-82, 46], [-62, 48], [-52, 28], [-76, 8], [-104, 20], [-118, 34], [-144, 44]], "#75a85b");
  drawLand([[-84, 13], [-56, 10], [-38, -8], [-48, -34], [-64, -56], [-78, -38], [-72, -12]], "#579b5d");
  drawLand([[-12, 72], [22, 70], [56, 61], [84, 58], [132, 46], [154, 28], [124, 10], [82, 18], [46, 9], [14, 30], [-8, 36], [-26, 54]], "#84b661");
  drawLand([[-18, 34], [34, 31], [48, 9], [42, -20], [22, -35], [2, -30], [-14, -4]], "#6fa65b");
  drawLand([[66, 28], [94, 26], [104, 10], [86, -6], [68, 6]], "#78ad5c");
  drawLand([[112, -12], [154, -16], [150, -42], [116, -38], [104, -26]], "#9aa85d");
  drawLand([[-52, 78], [-24, 72], [-38, 60], [-58, 62]], "#b4c78b");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
  for (let i = 0; i < 85; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const rx = 18 + Math.random() * 80;
    const ry = 5 + Math.random() * 20;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeThreeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    materials.forEach((mat) => {
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    });
  });
}

function AngleControlRow({
  label,
  value,
  fillFraction,
  onDelta,
  onSetFraction,
}: {
  label: string;
  value: string;
  fillFraction: number; // 0..1 for the visual fill
  onDelta: (deltaPx: number, totalWidth: number) => void;
  onSetFraction?: (f: number) => void;
}) {
  const onPointerDownRow = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    let lastX = e.clientX;
    if (onSetFraction) onSetFraction(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;
      onDelta(dx, rect.width);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = Math.max(0, Math.min(1, fillFraction)) * 100;
  return (
    <div
      className="relative h-10 rounded-md bg-muted/40 border border-border/70 cursor-ew-resize overflow-hidden select-none"
      onPointerDown={onPointerDownRow}
    >
      <div
        className="absolute inset-y-0 left-0 bg-primary/20 pointer-events-none transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
      <div className="absolute inset-0 px-3 flex items-center justify-between text-sm">
        <span className="text-foreground/85">{label}</span>
        <span className="text-foreground tabular-nums font-medium">{value}</span>
      </div>
    </div>
  );
}

function AngleGlobe3D({
  cameraX,
  cameraY,
  cameraZ,
  onChange,
}: {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  onChange: (next: Partial<{ cameraX: number; cameraY: number; cameraZ: number }>) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const initialCameraRef = useRef({ cameraX, cameraY, cameraZ });
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    viewCamera: THREE.PerspectiveCamera;
    earth: THREE.Mesh;
    clouds: THREE.Mesh;
    marker: THREE.Group;
    ray: THREE.Line;
    frameId: number;
    resizeObserver: ResizeObserver;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);

  const applyCameraState = useCallback((x: number, y: number, z: number) => {
    const sceneState = sceneRef.current;
    if (!sceneState) return;

    const surface = orbitVector(x, y, 1.12);
    const markerPosition = orbitVector(x, y, 1.62 + z * 0.75);
    sceneState.marker.position.copy(markerPosition);
    sceneState.marker.lookAt(0, 0, 0);
    sceneState.marker.scale.setScalar(0.9 + z * 0.22);

    sceneState.ray.geometry.dispose();
    sceneState.ray.geometry = new THREE.BufferGeometry().setFromPoints([surface, markerPosition]);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const viewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    viewCamera.position.set(0, 0.15, 5.2);
    viewCamera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 2.8, 4.5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.15);
    rimLight.position.set(-3.5, 1.2, -2.5);
    scene.add(rimLight);

    const earthTexture = createEarthTexture();
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 96, 64),
      new THREE.MeshStandardMaterial({
        map: earthTexture ?? undefined,
        roughness: 0.82,
        metalness: 0.04,
      })
    );
    scene.add(earth);

    const cloudTexture = createCloudTexture();
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.125, 96, 64),
      new THREE.MeshBasicMaterial({
        map: cloudTexture ?? undefined,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      })
    );
    scene.add(clouds);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.22, 96, 64),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    scene.add(atmosphere);

    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      depthTest: true,
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 4) {
        const yaw = (lon * Math.PI) / 180;
        const pitch = (lat * Math.PI) / 180;
        points.push(new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch) * 1.115,
          Math.sin(pitch) * 1.115,
          Math.cos(yaw) * Math.cos(pitch) * 1.115
        ));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial.clone()));
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const points: THREE.Vector3[] = [];
      for (let lat = -88; lat <= 88; lat += 4) {
        const yaw = (lon * Math.PI) / 180;
        const pitch = (lat * Math.PI) / 180;
        points.push(new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch) * 1.116,
          Math.sin(pitch) * 1.116,
          Math.cos(yaw) * Math.cos(pitch) * 1.116
        ));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial.clone()));
    }

    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({
        color: 0xff4d18,
        transparent: true,
        opacity: 0.82,
        depthTest: true,
      })
    );
    scene.add(ray);

    const marker = new THREE.Group();
    const markerBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.45, metalness: 0.12 })
    );
    const markerLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.065, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.2 })
    );
    markerLens.rotation.x = Math.PI / 2;
    markerLens.position.z = -0.1;
    const markerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.008, 12, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.4 })
    );
    markerRing.rotation.x = Math.PI / 2;
    markerRing.position.z = -0.143;
    marker.add(markerBody, markerLens, markerRing);
    scene.add(marker);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      viewCamera.aspect = width / height;
      viewCamera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const sceneState = {
      renderer,
      scene,
      viewCamera,
      earth,
      clouds,
      marker,
      ray,
      frameId: 0,
      resizeObserver,
    };
    sceneRef.current = sceneState;
    const initial = initialCameraRef.current;
    applyCameraState(initial.cameraX, initial.cameraY, initial.cameraZ);

    const render = () => {
      earth.rotation.y += 0.0015;
      clouds.rotation.y += 0.0022;
      renderer.render(scene, viewCamera);
      sceneState.frameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(sceneState.frameId);
      resizeObserver.disconnect();
      disposeThreeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, [applyCameraState]);

  useEffect(() => {
    applyCameraState(cameraX, cameraY, cameraZ);
  }, [applyCameraState, cameraX, cameraY, cameraZ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      cameraX,
      cameraY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    onChange({
      cameraX: wrapOrbit(drag.cameraX + (e.clientX - drag.startX) / 150),
      cameraY: clampNumber(drag.cameraY + (drag.startY - e.clientY) / 120, -1, 1),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      e.stopPropagation();
      dragRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onChange({ cameraZ: clampNumber(cameraZ + e.deltaY * 0.001, 0, 1) });
  };

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      title="Drag to orbit the camera; scroll to adjust distance"
    />
  );
}

export function AngleNodeView({ node, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, outputConnected }: any) {
  // Use custom hook for node dragging and positioning
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  const cameraX: number = typeof node.cameraX === "number" ? node.cameraX : 0;
  const cameraY: number = typeof node.cameraY === "number" ? node.cameraY : 0;
  const cameraZ: number = typeof node.cameraZ === "number" ? node.cameraZ : 0.5;

  // Display in degrees / integer zoom
  const rotationDeg = Math.round(((cameraX + 1) / 2) * 360); // 0..360
  const tiltDeg = Math.round(cameraY * 90);                   // -90..90
  const zoomVal = Math.round(cameraZ * 10);                   // 0..10

  const sphereR = 0.74;
  const yaw = cameraX * Math.PI;
  const pitch = -cameraY * (Math.PI / 2);
  const camSurfaceX = Math.sin(yaw) * Math.cos(pitch) * sphereR;
  const camSurfaceY = -Math.sin(pitch) * sphereR;
  const camOrbitX = Math.sin(yaw) * Math.cos(pitch) * (sphereR * 1.02);
  const camOrbitY = -Math.sin(pitch) * (sphereR * 1.02);
  const camFront = Math.cos(yaw) * Math.cos(pitch) >= -0.001;
  const latitudes = [-60, -30, 0, 30, 60];
  const longitudes = [0, 30, 60, 90, 120, 150];

  const handlePointerDownSphere = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
  };

  const handleWheelSphere = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // Latitudes (parallels) and longitudes (meridians) — fixed wireframe.
  // The longitudes change rx with global yaw to suggest 3D rotation.
  // Step controls
  const stepYaw = (dir: -1 | 1) => onUpdate(node.id, { cameraX: wrapOrbit(cameraX + dir * (15 / 180)) });
  const stepPitch = (dir: -1 | 1) => onUpdate(node.id, { cameraY: clampNumber(cameraY + dir * (15 / 90), -1, 1) });

  return (
    <div className="nb-node absolute w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      {/* Node Header with Input/Output Ports */}
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} connected={!!node.input} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center flex items-center justify-center gap-1.5">Angles<NodeTimer startTime={node.startTime} executionTime={node.executionTime} isRunning={node.isRunning} /></div>
        <div className="flex items-center gap-1">
          <Port className="out" nodeId={node.id} isOutput={true} connected={outputConnected} onStartConnection={onStartConnection} />
        </div>
      </div>

      {/* Main content */}
      <div className="p-4 flex flex-col gap-3">
        {/* Sphere area */}
        <div className="nb-angle-panel rounded-xl p-3">
          <div className="sr-only">
            Hold and drag to change<br />camera angle
          </div>

          <div className="nb-angle-globe relative h-56 select-none overflow-hidden rounded-lg">
            <AngleGlobe3D
              cameraX={cameraX}
              cameraY={cameraY}
              cameraZ={cameraZ}
              onChange={(next) => onUpdate(node.id, next)}
            />
            {/* Wireframe sphere SVG */}
            <svg
              viewBox="-1 -1 2 2"
              className="hidden"
              onPointerDown={handlePointerDownSphere}
              onWheel={handleWheelSphere}
            >
              {/* Outer disc — sphere outline */}
              <circle cx="0" cy="0" r={sphereR} fill="none" stroke="hsl(0 0% 100% / 0.18)" strokeWidth="0.005" />

              {/* Latitude (parallel) ellipses */}
              {latitudes.map((lat) => {
                const rad = (lat * Math.PI) / 180;
                const cy = sphereR * Math.sin(rad);
                const rx = sphereR * Math.cos(rad);
                // Pitch tilts the latitude bands — apparent ry = |cos(pitch + lat)|*0.06
                const ry = Math.abs(Math.sin(pitch + rad)) * sphereR * 0.4 + 0.005;
                return (
                  <ellipse
                    key={`lat-${lat}`}
                    cx="0"
                    cy={cy * Math.cos(pitch) + Math.sin(pitch) * Math.cos(rad) * 0}
                    rx={rx}
                    ry={ry}
                    fill="none"
                    stroke="hsl(0 0% 100% / 0.12)"
                    strokeWidth="0.005"
                  />
                );
              })}

              {/* Longitude (meridian) ellipses */}
              {longitudes.map((lon) => {
                const phi = (lon * Math.PI) / 180 + yaw;
                const rx = Math.abs(Math.cos(phi)) * sphereR;
                return (
                  <ellipse
                    key={`lon-${lon}`}
                    cx="0"
                    cy="0"
                    rx={rx}
                    ry={sphereR}
                    fill="none"
                    stroke="hsl(0 0% 100% / 0.10)"
                    strokeWidth="0.005"
                  />
                );
              })}

              {/* Connection line from sphere center to camera */}
              <line
                x1="0"
                y1="0"
                x2={camSurfaceX}
                y2={camSurfaceY}
                stroke="hsl(0 0% 100% / 0.55)"
                strokeWidth="0.012"
                strokeLinecap="round"
              />

              {/* Subject preview tile in the centre */}
              <rect
                x={-0.13}
                y={-0.13}
                width="0.26"
                height="0.26"
                rx="0.025"
                fill="hsl(var(--primary) / 0.18)"
                stroke="hsl(var(--primary) / 0.6)"
                strokeWidth="0.008"
              />
            </svg>

            {/* Camera marker — orbits the sphere; faded when behind */}
            <motion.div
              className="hidden"
              animate={{
                left: `${50 + camOrbitX * 50}%`,
                top: `${50 + camOrbitY * 50}%`,
                opacity: camFront ? 1 : 0.35,
              }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              style={{ x: "-50%", y: "-50%" }}
            >
              <div className="w-7 h-7 rounded-md bg-card border border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.6)] flex items-center justify-center text-base">
                <Camera className="h-4 w-4 text-primary" aria-hidden />
              </div>
            </motion.div>

            {/* Side stepper arrows */}
            <button
              type="button"
              onClick={() => stepYaw(-1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="nb-angle-stepper absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              aria-label="Rotate left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => stepYaw(1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="nb-angle-stepper absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              aria-label="Rotate right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => stepPitch(1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="nb-angle-stepper absolute left-1/2 -translate-x-1/2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              aria-label="Tilt down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => stepPitch(-1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="nb-angle-stepper absolute left-1/2 -translate-x-1/2 top-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              aria-label="Tilt up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

        </div>

        {/* Drag-rows: Rotation / Tilt / Zoom */}
        <div className="space-y-1.5">
          <AngleControlRow
            label="Rotation"
            value={`${rotationDeg}°`}
            fillFraction={(cameraX + 1) / 2}
            onDelta={(dx, w) => {
              const next = wrapOrbit(cameraX + (dx / w) * 2);
              onUpdate(node.id, { cameraX: next });
            }}
            onSetFraction={(f) => onUpdate(node.id, { cameraX: f * 2 - 1 })}
          />
          <AngleControlRow
            label="Tilt"
            value={`${tiltDeg}°`}
            fillFraction={(cameraY + 1) / 2}
            onDelta={(dx, w) => {
              const next = clampNumber(cameraY + (dx / w) * 2, -1, 1);
              onUpdate(node.id, { cameraY: next });
            }}
            onSetFraction={(f) => onUpdate(node.id, { cameraY: f * 2 - 1 })}
          />
          <AngleControlRow
            label="Zoom"
            value={`${zoomVal}`}
            fillFraction={cameraZ}
            onDelta={(dx, w) => {
              const next = clampNumber(cameraZ + dx / w, 0, 1);
              onUpdate(node.id, { cameraZ: next });
            }}
            onSetFraction={(f) => onUpdate(node.id, { cameraZ: f })}
          />
        </div>

        {/* Process */}
        <Button
          className="w-full nb-btn-primary"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.input}
          title={!node.input ? "Connect an input first" : "Generate image with this camera angle"}
        >
          {node.isRunning ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Adjusting Perspective...</span>
            </div>
          ) : "Apply Camera Angle"}
        </Button>

        {/* Output */}
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`camera-angle-${Date.now()}.png`}
        />

        {node.error && (
          <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20 w-full animate-in fade-in slide-in-from-top-1">
            {node.error}
          </div>
        )}
      </div>
    </div>
  );
}
