/**
 * NODE COMPONENT VIEWS
 * 
 * This file contains all the visual node components for the Nano Banana Editor.
 * Each node type has its own React component that handles:
 * - User interface and controls
 * - Drag and drop functionality
 * - Connection port rendering
 * - Processing status display
 * - Image upload/preview
 * 
 * Node Types Available:
 * - BackgroundNodeView: Change/generate image backgrounds
 * - ClothesNodeView: Add/modify clothing on subjects
 * - StyleNodeView: Apply artistic styles and filters
 * - EditNodeView: General text-based image editing
 * - CameraNodeView: Apply camera effects and settings
 * - AgeNodeView: Transform subject age
 * - FaceNodeView: Modify facial features and accessories
 */
"use client";

// React imports for component functionality
import React, { useState, useRef, useEffect } from "react";
// UI component imports from shadcn/ui library
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";
import { ColorPicker } from "../components/ui/color-picker";
import { Checkbox } from "../components/ui/checkbox";

/**
 * Helper function to download processed images
 * Creates a temporary download link and triggers the browser's download mechanism
 * 
 * @param dataUrl Base64 data URL of the image to download
 * @param filename Desired filename for the downloaded image
 */
function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement('a');  // Create temporary download link
  link.href = dataUrl;                       // Set the image data as href
  link.download = filename;                  // Set the download filename
  document.body.appendChild(link);           // Add link to DOM (required for Firefox)
  link.click();                             // Trigger download
  document.body.removeChild(link);          // Clean up temporary link
}

/**
 * Reusable output section with history navigation for node components
 */
function NodeOutputSection({
  nodeId,
  output,
  downloadFileName,
  getNodeHistoryInfo,
  navigateNodeHistory,
  getCurrentNodeImage,
}: {
  nodeId: string;
  output?: string;
  downloadFileName: string;
  getNodeHistoryInfo?: (id: string) => any;
  navigateNodeHistory?: (id: string, direction: 'prev' | 'next') => void;
  getCurrentNodeImage?: (id: string, fallback?: string) => string;
}) {
  const currentImage = getCurrentNodeImage ? getCurrentNodeImage(nodeId, output) : output;
  
  if (!currentImage) return null;
  
  const historyInfo = getNodeHistoryInfo ? getNodeHistoryInfo(nodeId) : { hasHistory: false, currentDescription: '' };
  
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/70">Output</div>
          {historyInfo.hasHistory ? (
            <div className="flex items-center gap-1">
              <button
                className="p-1 text-xs bg-white/10 hover:bg-white/20 rounded disabled:opacity-40"
                onClick={() => navigateNodeHistory && navigateNodeHistory(nodeId, 'prev')}
                disabled={!historyInfo.canGoBack}
              >
                ←
              </button>
              <span className="text-xs text-white/60 px-1">
                {historyInfo.current}/{historyInfo.total}
              </span>
              <button
                className="p-1 text-xs bg-white/10 hover:bg-white/20 rounded disabled:opacity-40"
                onClick={() => navigateNodeHistory && navigateNodeHistory(nodeId, 'next')}
                disabled={!historyInfo.canGoForward}
              >
                →
              </button>
            </div>
          ) : null}
        </div>
        <img src={currentImage} className="w-full rounded" alt="Output" />
        {historyInfo.currentDescription ? (
          <div className="text-xs text-white/60 bg-black/20 rounded px-2 py-1">
            {historyInfo.currentDescription}
          </div>
        ) : null}
      </div>
      <Button
        className="w-full"
        variant="secondary"
        onClick={() => downloadImage(currentImage, downloadFileName)}
      >
        📥 Download Output
      </Button>
    </div>
  );
}

/* ========================================
   TYPE DEFINITIONS (TEMPORARY)
   ======================================== */
// Temporary type definitions - these should be imported from page.tsx in production
type BackgroundNode = any;
type ClothesNode = any;
type BlendNode = any;
type EditNode = any;
type CameraNode = any;
type AgeNode = any;
type FaceNode = any;

/**
 * Utility function to combine CSS class names conditionally
 * Same implementation as in page.tsx for consistent styling
 */
function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
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
  onEndConnection
}: { 
  className?: string;
  nodeId?: string;
  isOutput?: boolean;
  onStartConnection?: (nodeId: string) => void;
  onEndConnection?: (nodeId: string) => void;
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

  return (
    <div 
      className={cx("nb-port", className)}  // Apply base port styling plus custom classes
      onPointerDown={handlePointerDown}     // Handle connection start
      onPointerUp={handlePointerUp}         // Handle connection end
      onPointerEnter={handlePointerUp}      // Also handle connection end on hover (for better UX)
    />
  );
}

export function BackgroundNodeView({
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
}: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const reader = new FileReader();
      reader.onload = () => {
        onUpdate(node.id, { customBackgroundImage: reader.result });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };
  
  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            onUpdate(node.id, { customBackgroundImage: reader.result });
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
    const text = e.clipboardData.getData("text");
    if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
      onUpdate(node.id, { customBackgroundImage: text });
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
      <div className="p-3 space-y-3">
        <Select 
          className="w-full"
          value={node.backgroundType || "color"}
          onChange={(e) => onUpdate(node.id, { backgroundType: (e.target as HTMLSelectElement).value })}
        >
          <option value="color">Solid Color</option>
          <option value="image">Preset Background</option>
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
          <Textarea
            className="w-full"
            placeholder="Describe the background..."
            value={node.customPrompt || ""}
            onChange={(e) => onUpdate(node.id, { customPrompt: (e.target as HTMLTextAreaElement).value })}
            rows={2}
          />
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
          getNodeHistoryInfo={getNodeHistoryInfo}
          navigateNodeHistory={navigateNodeHistory}
          getCurrentNodeImage={getCurrentNodeImage}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function ClothesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  const presetClothes = [
    { name: "Sukajan", path: "/sukajan.png" },
    { name: "Blazer", path: "/blazzer.png" },
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
      className="nb-node absolute text-white w-[320px]"
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
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection
            </Button>
          </div>
        )}
        <div className="text-xs text-white/70">Clothes Reference</div>
        
        {/* Preset clothes options */}
        <div className="flex gap-2">
          {presetClothes.map((preset) => (
            <button
              key={preset.name}
              className={`flex-1 p-2 rounded border ${
                node.selectedPreset === preset.name
                  ? "border-indigo-400 bg-indigo-500/20"
                  : "border-white/20 hover:border-white/40"
              }`}
              onClick={() => selectPreset(preset.path, preset.name)}
            >
              <img src={preset.path} alt={preset.name} className="w-full h-16 object-cover rounded mb-1" />
              <div className="text-xs">{preset.name}</div>
            </button>
          ))}
        </div>
        
        <div className="text-xs text-white/50 text-center">— or —</div>
        
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
            <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-white/40">
              <p className="text-xs text-white/60">Drop, upload, or paste clothes image</p>
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
          getNodeHistoryInfo={getNodeHistoryInfo}
          navigateNodeHistory={navigateNodeHistory}
          getCurrentNodeImage={getCurrentNodeImage}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function AgeNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  return (
    <div className="nb-node absolute text-white w-[280px]" style={{ left: localPos.x, top: localPos.y }}>
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection
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
          getNodeHistoryInfo={getNodeHistoryInfo}
          navigateNodeHistory={navigateNodeHistory}
          getCurrentNodeImage={getCurrentNodeImage}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function CameraNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const focalLengths = ["None", "8mm fisheye", "12mm", "24mm", "35mm", "50mm", "85mm", "135mm", "200mm", "300mm", "400mm"];
  const apertures = ["None", "f/0.95", "f/1.2", "f/1.4", "f/1.8", "f/2", "f/2.8", "f/4", "f/5.6", "f/8", "f/11", "f/16", "f/22"];
  const shutterSpeeds = ["None", "1/8000s", "1/4000s", "1/2000s", "1/1000s", "1/500s", "1/250s", "1/125s", "1/60s", "1/30s", "1/15s", "1/8s", "1/4s", "1/2s", "1s", "2s", "5s", "10s", "30s"];
  const whiteBalances = ["None", "2800K candlelight", "3200K tungsten", "4000K fluorescent", "5600K daylight", "6500K cloudy", "7000K shade", "8000K blue sky"];
  const angles = ["None", "eye level", "low angle", "high angle", "Dutch tilt", "bird's eye", "worm's eye", "over the shoulder", "POV"];
  const isoValues = ["None", "ISO 50", "ISO 100", "ISO 200", "ISO 400", "ISO 800", "ISO 1600", "ISO 3200", "ISO 6400", "ISO 12800"];
  const filmStyles = ["None", "Kodak Portra", "Fuji Velvia", "Ilford HP5", "Cinestill 800T", "Lomography", "Cross Process", "Black & White", "Sepia", "Vintage", "Film Noir"];
  const lightingTypes = ["None", "Natural Light", "Golden Hour", "Blue Hour", "Studio Lighting", "Rembrandt", "Split Lighting", "Butterfly Lighting", "Loop Lighting", "Rim Lighting", "Silhouette", "High Key", "Low Key"];
  const bokehStyles = ["None", "Smooth Bokeh", "Swirly Bokeh", "Hexagonal Bokeh", "Cat Eye Bokeh", "Bubble Bokeh", "Creamy Bokeh"];
  const compositions = ["None", "Rule of Thirds", "Golden Ratio", "Symmetrical", "Leading Lines", "Frame in Frame", "Fill the Frame", "Negative Space", "Patterns", "Diagonal"];
  const aspectRatios = ["None", "1:1 Square", "3:2 Standard", "4:3 Classic", "16:9 Widescreen", "21:9 Cinematic", "9:16 Portrait", "4:5 Instagram", "2:3 Portrait"];

  return (
    <div className="nb-node absolute text-white w-[360px]" style={{ left: localPos.x, top: localPos.y }}>
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
              Clear Connection
            </Button>
          </div>
        )}
        {/* Basic Camera Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1">Basic Settings</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">Focal Length</label>
            <Select 
              className="w-full"
              value={node.focalLength || "None"}
              onChange={(e) => onUpdate(node.id, { focalLength: (e.target as HTMLSelectElement).value })}
            >
              {focalLengths.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Aperture</label>
            <Select 
              className="w-full"
              value={node.aperture || "None"}
              onChange={(e) => onUpdate(node.id, { aperture: (e.target as HTMLSelectElement).value })}
            >
              {apertures.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Shutter Speed</label>
            <Select 
              className="w-full"
              value={node.shutterSpeed || "None"}
              onChange={(e) => onUpdate(node.id, { shutterSpeed: (e.target as HTMLSelectElement).value })}
            >
              {shutterSpeeds.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">ISO</label>
            <Select 
              className="w-full"
              value={node.iso || "None"}
              onChange={(e) => onUpdate(node.id, { iso: (e.target as HTMLSelectElement).value })}
            >
              {isoValues.map(i => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
        </div>
        
        {/* Creative Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1 mt-3">Creative Settings</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">White Balance</label>
            <Select 
              className="w-full"
              value={node.whiteBalance || "None"}
              onChange={(e) => onUpdate(node.id, { whiteBalance: (e.target as HTMLSelectElement).value })}
            >
              {whiteBalances.map(w => <option key={w} value={w}>{w}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Film Style</label>
            <Select 
              className="w-full"
              value={node.filmStyle || "None"}
              onChange={(e) => onUpdate(node.id, { filmStyle: (e.target as HTMLSelectElement).value })}
            >
              {filmStyles.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Lighting</label>
            <Select 
              className="w-full"
              value={node.lighting || "None"}
              onChange={(e) => onUpdate(node.id, { lighting: (e.target as HTMLSelectElement).value })}
            >
              {lightingTypes.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Bokeh Style</label>
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
        <div className="text-xs text-white/50 font-semibold mb-1 mt-3">Composition</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">Camera Angle</label>
            <Select 
              className="w-full"
              value={node.angle || "None"}
              onChange={(e) => onUpdate(node.id, { angle: (e.target as HTMLSelectElement).value })}
            >
              {angles.map(a => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Composition</label>
            <Select 
              className="w-full"
              value={node.composition || "None"}
              onChange={(e) => onUpdate(node.id, { composition: (e.target as HTMLSelectElement).value })}
            >
              {compositions.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-white/70">Aspect Ratio</label>
            <Select 
              className="w-full"
              value={node.aspectRatio || "None"}
              onChange={(e) => onUpdate(node.id, { aspectRatio: (e.target as HTMLSelectElement).value })}
            >
              {aspectRatios.map(a => <option key={a} value={a}>{a}</option>)}
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
            getNodeHistoryInfo={getNodeHistoryInfo}
            navigateNodeHistory={navigateNodeHistory}
            getCurrentNodeImage={getCurrentNodeImage}
          />
        </div>
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function FaceNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const hairstyles = ["None", "short", "long", "curly", "straight", "bald", "mohawk", "ponytail"];
  const expressions = ["None", "happy", "serious", "smiling", "laughing", "sad", "surprised", "angry"];
  const beardStyles = ["None", "stubble", "goatee", "full beard", "mustache", "clean shaven"];

  return (
    <div className="nb-node absolute text-white w-[340px]" style={{ left: localPos.x, top: localPos.y }}>
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
      <div className="p-3 space-y-2">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection
            </Button>
          </div>
        )}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox 
              checked={node.faceOptions?.removePimples || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, removePimples: (e.target as HTMLInputElement).checked }
              })}
            />
            Remove pimples
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox 
              checked={node.faceOptions?.addSunglasses || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, addSunglasses: (e.target as HTMLInputElement).checked }
              })}
            />
            Add sunglasses
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox 
              checked={node.faceOptions?.addHat || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, addHat: (e.target as HTMLInputElement).checked }
              })}
            />
            Add hat
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
            getNodeHistoryInfo={getNodeHistoryInfo}
            navigateNodeHistory={navigateNodeHistory}
            getCurrentNodeImage={getCurrentNodeImage}
          />
        </div>
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function StyleNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  const styleOptions = [
    { value: "90s-anime", label: "90's Anime Style" },
    { value: "mha", label: "My Hero Academia Style" },
    { value: "dbz", label: "Dragon Ball Z Style" },
    { value: "ukiyo-e", label: "Ukiyo-e Style" },
    { value: "cyberpunk", label: "Cyberpunk Style" },
    { value: "steampunk", label: "Steampunk Style" },
    { value: "cubism", label: "Cubism Style" },
    { value: "van-gogh", label: "Post-Impressionist (Van Gogh) Style" },
    { value: "simpsons", label: "Simpsons Style" },
    { value: "family-guy", label: "Family Guy Style" },
    { value: "arcane", label: "Arcane – Painterly + Neon Rim Light" },
    { value: "wildwest", label: "Wild West Style" },
    { value: "stranger-things", label: "Stranger Things – 80s Kodak Style" },
    { value: "breaking-bad", label: "Breaking Bad – Dusty Orange & Teal" },
  ];
  
  return (
    <div 
      className="nb-node absolute text-white w-[320px]" 
      style={{ left: localPos.x, top: localPos.y }}
    >
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
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
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection
            </Button>
          </div>
        )}
        <div className="text-xs text-white/70">Art Style</div>
        <div className="text-xs text-white/50 mb-2">Select an artistic style to apply to your image</div>
        <Select
          className="w-full bg-black border-white/20 text-white focus:border-white/40 [&>option]:bg-black [&>option]:text-white"
          value={node.stylePreset || ""}
          onChange={(e) => onUpdate(node.id, { stylePreset: (e.target as HTMLSelectElement).value })}
        >
          <option value="" className="bg-black">Select a style...</option>
          {styleOptions.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-black">
              {opt.label}
            </option>
          ))}
        </Select>
        <div>
          <Slider
            label="Style Strength"
            valueLabel={`${node.styleStrength || 50}%`}
            min={0}
            max={100}
            value={node.styleStrength || 50}
            onChange={(e) => onUpdate(node.id, { styleStrength: parseInt((e.target as HTMLInputElement).value) })}
          />
        </div>
        <Button 
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.stylePreset}
          title={!node.input ? "Connect an input first" : !node.stylePreset ? "Select a style first" : "Apply the style to your input image"}
        >
          {node.isRunning ? "Applying Style..." : "Apply Style Transfer"}
        </Button>
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`style-${Date.now()}.png`}
          getNodeHistoryInfo={getNodeHistoryInfo}
          navigateNodeHistory={navigateNodeHistory}
          getCurrentNodeImage={getCurrentNodeImage}
        />
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function EditNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition, getNodeHistoryInfo, navigateNodeHistory, getCurrentNodeImage }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  return (
    <div className="nb-node absolute text-white w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
        <div className="font-semibold text-sm flex-1 text-center">EDIT</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/20 h-6 w-6"
            onClick={() => onDelete(node.id)}
            title="Delete node"
            aria-label="Delete node"
          >
            ×
          </Button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        {node.input && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(node.id, { input: undefined })}
              className="text-xs"
            >
              Clear Connection
            </Button>
          </div>
        )}
        <Textarea
          className="w-full"
          placeholder="Describe what to edit (e.g., 'make it brighter', 'add more contrast', 'make it look vintage')"
          value={node.editPrompt || ""}
          onChange={(e) => onUpdate(node.id, { editPrompt: (e.target as HTMLTextAreaElement).value })}
          rows={3}
        />
        <Button 
          className="w-full"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Edit"}
        </Button>
        <NodeOutputSection
          nodeId={node.id}
          output={node.output}
          downloadFileName={`edit-${Date.now()}.png`}
          getNodeHistoryInfo={getNodeHistoryInfo}
          navigateNodeHistory={navigateNodeHistory}
          getCurrentNodeImage={getCurrentNodeImage}
        />
      </div>
    </div>
  );
}
