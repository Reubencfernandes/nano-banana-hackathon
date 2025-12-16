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
import React, { useState, useRef, useEffect } from "react";

// Import reusable UI components from the shadcn/ui component library
import { Button } from "../components/ui/button";       // Standard button component
import { Select } from "../components/ui/select";       // Dropdown selection component  
import { Textarea } from "../components/ui/textarea";   // Multi-line text input component
import { Slider } from "../components/ui/slider";       // Range slider input component
import { ColorPicker } from "../components/ui/color-picker"; // Color selection component
import { Checkbox } from "../components/ui/checkbox";   // Checkbox input component

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
          title="💾 Click or right-click to copy image to clipboard" // Tooltip instruction
        />
      </div>
      {/* Download button for saving the current image */}
      <Button
        className="w-full"                                              // Full width button
        variant="secondary"                                              // Secondary button styling
        onClick={() => downloadImage(output, downloadFileName)}         // Trigger download when clicked
      >
        📥 Download Output
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
    const dx = e.clientX - start.current.sx;           // Calculate horizontal movement
    const dy = e.clientY - start.current.sy;           // Calculate vertical movement
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
  onStartConnection,
  onEndConnection,
  onDisconnect
}: {
  className?: string;
  nodeId?: string;
  isOutput?: boolean;
  onStartConnection?: (nodeId: string) => void;
  onEndConnection?: (nodeId: string) => void;
  onDisconnect?: (nodeId: string) => void;
}) {
  /**
   * Handle starting a connection (pointer down on output port)
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();  // Prevent triggering node drag
    if (isOutput && nodeId && onStartConnection) {
      onStartConnection(nodeId);  // Start connection from this output port
    }
  };

  /**
   * Handle ending a connection (pointer up on input port)
   */
  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();  // Prevent bubbling
    if (!isOutput && nodeId && onEndConnection) {
      onEndConnection(nodeId);  // End connection at this input port
    }
  };

  /**
   * Handle clicking on input port to disconnect
   * Allows users to remove connections by clicking on input ports
   */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();                    // Prevent event from bubbling to parent elements
    if (!isOutput && nodeId && onDisconnect) {
      onDisconnect(nodeId);                 // Disconnect from this input port
    }
  };

  return (
    <div
      className={cx("nb-port", className)}              // Combine base port classes with custom ones
      onPointerDown={handlePointerDown}                 // Start connection drag from output ports
      onPointerUp={handlePointerUp}                     // End connection drag at input ports
      onPointerEnter={handlePointerUp}                  // Also accept connections on hover (better UX)
      onClick={handleClick}                             // Allow clicking input ports to disconnect
      title={
        isOutput
          ? "Drag from here to connect to another node's input"
          : "Drop connections here or click to disconnect"
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
  apiToken
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">BACKGROUND</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
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
                      type: 'background',
                      apiToken: apiToken || undefined
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
 * @param onDelete - Callback to delete this node
 * @param onUpdate - Callback to update node properties
 * @param onStartConnection - Callback when starting connection from output
 * @param onEndConnection - Callback when ending connection at input
 * @param onProcess - Callback to process this node
 * @param onUpdatePosition - Callback to update node position
 * @param getNodeHistoryInfo - Function to get processing history
 * @param navigateNodeHistory - Function to navigate history
 * @param getCurrentNodeImage - Function to get current image
 */
export function ClothesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Preset clothing options available for quick selection
   * Each preset includes a display name and path to the reference image
   */
  const presetClothes = [
    { name: "Sukajan", path: "/clothes/sukajan.png" },           // Japanese-style embroidered jacket
    { name: "Blazer", path: "/clothes/blazzer.png" },            // Business blazer/jacket
    { name: "Suit", path: "/clothes/suit.png" },                 // Formal business suit
    { name: "Women's Outfit", path: "/clothes/womenoutfit.png" }, // Women's clothing ensemble
  ];

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length) {
      const reader = new FileReader();
      reader.onload = () => onUpdate(node.id, { clothesImage: reader.result, selectedPreset: null });
      reader.readAsDataURL(files[0]);
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => onUpdate(node.id, { clothesImage: reader.result, selectedPreset: null });
          reader.readAsDataURL(file);
          return;
        }
      }
    }
    const text = e.clipboardData.getData("text");
    if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
      onUpdate(node.id, { clothesImage: text, selectedPreset: null });
    }
  };

  const selectPreset = (presetPath: string, presetName: string) => {
    onUpdate(node.id, { clothesImage: presetPath, selectedPreset: presetName });
  };

  return (
    <div
      className="nb-node absolute w-[320px]"
      style={{ left: localPos.x, top: localPos.y }}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={onPaste}
    >
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">CLOTHES</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground">Clothes Reference</div>

        {/* Preset clothes options */}
        <div className="flex gap-2">
          {presetClothes.map((preset) => (
            <button
              key={preset.name}
              className={`flex-1 p-2 rounded border ${node.selectedPreset === preset.name
                ? "border-primary bg-primary/20"
                : "border-border hover:border-primary/50"
                }`}
              onClick={() => selectPreset(preset.path, preset.name)}
            >
              <img src={preset.path} alt={preset.name} className="w-full h-28 object-contain rounded mb-1" />
              <div className="text-xs">{preset.name}</div>
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground/50 text-center">— or —</div>

        {/* Custom image upload */}
        {node.clothesImage && !node.selectedPreset ? (
          <div className="relative">
            <img src={node.clothesImage} className="w-full rounded" alt="Clothes" />
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => onUpdate(node.id, { clothesImage: null, selectedPreset: null })}
            >
              Remove
            </Button>
          </div>
        ) : !node.selectedPreset ? (
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  const reader = new FileReader();
                  reader.onload = () => onUpdate(node.id, { clothesImage: reader.result, selectedPreset: null });
                  reader.readAsDataURL(e.target.files[0]);
                }
              }}
            />
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <div className="text-muted-foreground/40 text-lg mb-2">📁</div>
              <p className="text-sm text-muted-foreground font-medium">Drop, upload, or paste clothes image</p>
              <p className="text-xs text-muted-foreground/50 mt-1">JPG, PNG, WebP supported</p>
            </div>
          </label>
        ) : null}

        <Button
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.clothesImage}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
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
export function AgeNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">AGE</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
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
export function CameraNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  // Handle node dragging functionality
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  // Camera lens focal length options (affects field of view and perspective)
  const focalLengths = ["None", "8mm", "12mm", "24mm", "35mm", "50mm", "85mm", "100mm", "135mm"];

  // Aperture settings (affects depth of field and exposure)
  const apertures = ["None", "f/0.95", "f/1.2", "f/1.4", "f/1.8", "f/2", "f/2.8", "f/4", "f/5.6", "f/11"];

  // Shutter speed options (affects motion blur and exposure)
  const shutterSpeeds = ["None", "1/1000s", "1/250s", "1/30s", "1/15", "5s",];

  // White balance presets for different lighting conditions
  const whiteBalances = ["None", "2800K candlelight", "3200K tungsten", "4000K fluorescent", "5600K daylight", "6500K cloudy", "7000K shade", "8000K blue sky"];

  // Camera angle and perspective options
  const angles = ["None", "eye level", "low angle", "high angle", "Dutch tilt", "bird's eye", "worm's eye", "over the shoulder", "POV"];

  // ISO sensitivity values (affects image noise and exposure)
  const isoValues = ["None", "ISO 100", "ISO 400", "ISO 1600", "ISO 6400"];

  // Film stock emulation for different photographic styles
  const filmStyles = ["None", "RAW", "Kodak Portra", "Fuji Velvia", "Kodak Gold 200", "Black & White", "Sepia", "Vintage", "Film Noir"];

  // Professional lighting setups and natural lighting conditions
  const lightingTypes = ["None", "Natural Light", "Golden Hour", "Blue Hour", "Studio Lighting", "Rembrandt", "Split Lighting", "Butterfly Lighting", "Loop Lighting", "Rim Lighting", "Silhouette", "High Key", "Low Key"];

  // Bokeh (background blur) styles for different lens characteristics
  const bokehStyles = ["None", "Smooth Bokeh", "Swirly Bokeh", "Hexagonal Bokeh", "Cat Eye Bokeh", "Bubble Bokeh"];

  // Motion blur options
  const motionBlurOptions = ["None", "Light Motion Blur", "Medium Motion Blur", "Heavy Motion Blur", "Radial Blur", "Zoom Blur"];

  return (
    <div className="nb-node absolute w-[360px]" style={{ left: localPos.x, top: localPos.y }}>
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">CAMERA</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
        {/* Basic Camera Settings Section */}
        <div className="text-xs text-muted-foreground font-semibold mb-1">Basic Settings</div>
        <div className="grid grid-cols-2 gap-2">                     {/* 2-column grid for compact layout */}
          {/* Motion Blur Control - adds movement effects */}
          <div>
            <label className="text-xs text-muted-foreground">Motion Blur</label>
            <Select
              className="w-full"
              value={node.motionBlur || "None"}                   // Default to "None" if not set
              onChange={(e) => onUpdate(node.id, { motionBlur: (e.target as HTMLSelectElement).value })}
              title="Select Motion Blur Effect"
            >
              {motionBlurOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          {/* Focal Length Control - affects field of view and perspective */}
          <div>
            <label className="text-xs text-muted-foreground">Focal Length</label>
            <Select
              className="w-full"
              value={node.focalLength || "None"}                   // Default to "None" if not set
              onChange={(e) => onUpdate(node.id, { focalLength: (e.target as HTMLSelectElement).value })}
              title="Select lens focal length - affects field of view and perspective distortion"
            >
              {focalLengths.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>

          {/* Aperture Control - affects depth of field and exposure */}
          <div>
            <label className="text-xs text-muted-foreground">Aperture</label>
            <Select
              className="w-full"
              value={node.aperture || "None"}                     // Default to "None" if not set
              onChange={(e) => onUpdate(node.id, { aperture: (e.target as HTMLSelectElement).value })}
              title="Select aperture value - lower f-numbers create shallower depth of field"
            >
              {apertures.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>

          {/* Shutter Speed Control - affects motion blur and exposure */}
          <div>
            <label className="text-xs text-muted-foreground">Shutter Speed</label>
            <Select
              className="w-full"
              value={node.shutterSpeed || "None"}                 // Default to "None" if not set
              onChange={(e) => onUpdate(node.id, { shutterSpeed: (e.target as HTMLSelectElement).value })}
              title="Select shutter speed - faster speeds freeze motion, slower speeds create blur"
            >
              {shutterSpeeds.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          {/* ISO Control - affects sensor sensitivity and image noise */}
          <div>
            <label className="text-xs text-muted-foreground">ISO</label>
            <Select
              className="w-full"
              value={node.iso || "None"}                          // Default to "None" if not set
              onChange={(e) => onUpdate(node.id, { iso: (e.target as HTMLSelectElement).value })}
              title="Select ISO value - higher values increase sensitivity but add noise"
            >
              {isoValues.map(i => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
        </div>

        {/* Creative Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1 mt-3">Creative Settings</div>
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
            <label className="text-xs text-muted-foreground">Film Style</label>
            <Select
              className="w-full"
              value={node.filmStyle || "None"}
              onChange={(e) => onUpdate(node.id, { filmStyle: (e.target as HTMLSelectElement).value })}
            >
              {filmStyles.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Lighting</label>
            <Select
              className="w-full"
              value={node.lighting || "None"}
              onChange={(e) => onUpdate(node.id, { lighting: (e.target as HTMLSelectElement).value })}
            >
              {lightingTypes.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Bokeh Style</label>
            <Select
              className="w-full"
              value={node.bokeh || "None"}
              onChange={(e) => onUpdate(node.id, { bokeh: (e.target as HTMLSelectElement).value })}
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
export function FaceNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">FACE</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
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
export function StyleNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">STYLE</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
        <div className="text-xs text-muted-foreground">Art Style</div>
        <div className="text-xs text-muted-foreground/50 mb-2">Select an artistic style to apply to your image</div>
        <Select
          className="w-full bg-background border-border text-foreground focus:border-ring [&>option]:bg-background [&>option]:text-foreground"
          value={node.stylePreset || ""}
          onChange={(e) => onUpdate(node.id, { stylePreset: (e.target as HTMLSelectElement).value })}
        >
          <option value="" className="bg-background">Select a style...</option>
          {styleOptions.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-background">
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
export function LightningNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">LIGHTNING</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
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
export function PosesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />
        <div className="font-semibold text-sm flex-1 text-center">POSES</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (confirm('Delete this node?')) {
                onDelete(node.id);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}
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
 * - AI-powered prompt improvement using Gemini
 * - Real-time editing processing
 * - Output history with navigation
 * - Connection management for input/output workflow
 * 
 * @param node - The edit node data containing editPrompt, input, output, etc.
 * @param onDelete - Callback to delete this node
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
  onDelete,
  onUpdate,
  onStartConnection,
  onEndConnection,
  onProcess,
  onUpdatePosition,
  getNodeHistoryInfo,
  navigateNodeHistory,
  getCurrentNodeImage,
  apiToken

}: any) {
  // Use custom hook for drag functionality - handles position updates during dragging
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);

  /**
   * Handle prompt improvement using Gemini API
   * Takes the user's basic edit description and enhances it for better AI processing
   */
  const handlePromptImprovement = async () => {
    // Validate that user has entered a prompt
    if (!node.editPrompt?.trim()) {
      alert('Please enter an edit description first');
      return;
    }

    try {
      // Call the API to improve the prompt
      const response = await fetch('/api/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: node.editPrompt.trim(),
          type: 'edit',
          apiToken: apiToken || undefined
        })
      });

      if (response.ok) {
        const { improvedPrompt } = await response.json();
        onUpdate(node.id, { editPrompt: improvedPrompt });
      } else {
        alert('Failed to improve prompt. Please try again.');
      }
    } catch (error) {
      console.error('Error improving prompt:', error);
      alert('Failed to improve prompt. Please try again.');
    }
  };

  /**
   * Handle delete node action with confirmation
   */
  const handleDeleteNode = (e: React.MouseEvent) => {
    e.stopPropagation();  // Prevent triggering drag
    e.preventDefault();

    if (confirm('Delete this node?')) {
      onDelete(node.id);
    }
  };

  /**
   * Handle clearing the input connection
   */
  const handleClearConnection = () => {
    onUpdate(node.id, { input: undefined });
  };

  /**
   * Handle edit prompt changes
   */
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(node.id, { editPrompt: e.target.value });
  };

  return (
    <div className="nb-node absolute w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      {/* Node Header - Contains title, delete button, and connection ports */}
      <div
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}    // Start dragging
        onPointerMove={onPointerMove}    // Handle drag movement
        onPointerUp={onPointerUp}        // End dragging
      >
        {/* Input port (left side) - where connections come in */}
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} onDisconnect={(nodeId) => onUpdate(nodeId, { input: undefined })} />

        {/* Node title */}
        <div className="font-semibold text-sm flex-1 text-center">EDIT</div>

        <div className="flex items-center gap-1">
          {/* Delete button */}
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={handleDeleteNode}
            onPointerDown={(e) => e.stopPropagation()}  // Prevent drag when clicking delete
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>

          {/* Output port (right side) - where connections go out */}
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>

      {/* Node Content - Contains all the controls and outputs */}
      {/* Node Content Area - Contains all controls, inputs, and outputs */}
      <div className="p-3 space-y-3">
        {/* Show clear connection button if node has input */}
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearConnection}
              className="text-xs"
              title="Remove input connection"
            >
              Clear Connection                                    {/* Remove input connection to this node */}
            </Button>
          </div>
        )}

        {/* Edit prompt input and improvement section */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-1">Edit Instructions</div>
          <Textarea
            className="w-full"
            placeholder="Describe what to edit (e.g., 'make it brighter', 'add more contrast', 'make it look vintage')"
            value={node.editPrompt || ""}
            onChange={handlePromptChange}
            rows={3}
          />

          {/* AI-powered prompt improvement button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={handlePromptImprovement}
            title="Use Gemini 2.5 Flash to improve your edit prompt"
            disabled={!node.editPrompt?.trim()}
          >
            ✨ Improve with Gemini
          </Button>
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
