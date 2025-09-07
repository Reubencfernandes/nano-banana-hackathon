"use client";

import React, { useState, useRef, useEffect } from "react";

// Helper function to download image
function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Import types (we'll need to export these from page.tsx)
type BackgroundNode = any;
type ClothesNode = any;
type BlendNode = any;
type EditNode = any;
type CameraNode = any;
type AgeNode = any;
type FaceNode = any;

function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

// Reusable drag hook for all nodes
function useNodeDrag(node: any, onUpdatePosition?: (id: string, x: number, y: number) => void) {
  const [localPos, setLocalPos] = useState({ x: node.x, y: node.y });
  const dragging = useRef(false);
  const start = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  
  useEffect(() => {
    setLocalPos({ x: node.x, y: node.y });
  }, [node.x, node.y]);
  
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = true;
    start.current = { sx: e.clientX, sy: e.clientY, ox: localPos.x, oy: localPos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !start.current) return;
    const dx = e.clientX - start.current.sx;
    const dy = e.clientY - start.current.sy;
    const newX = start.current.ox + dx;
    const newY = start.current.oy + dy;
    setLocalPos({ x: newX, y: newY });
    if (onUpdatePosition) onUpdatePosition(node.id, newX, newY);
  };
  
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    start.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };
  
  return { localPos, onPointerDown, onPointerMove, onPointerUp };
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

export function BackgroundNodeView({
  node,
  onDelete,
  onUpdate,
  onStartConnection,
  onEndConnection,
  onProcess,
  onUpdatePosition,
}: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const hasConfig = node.backgroundType && !node.output;
  
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
      className={`nb-node absolute text-white w-[320px] ${hasConfig ? 'ring-2 ring-yellow-500/50' : ''}`} 
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
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <select 
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          value={node.backgroundType || "color"}
          onChange={(e) => onUpdate(node.id, { backgroundType: e.target.value })}
        >
          <option value="color">Solid Color</option>
          <option value="image">Preset Background</option>
          <option value="upload">Upload Image</option>
          <option value="custom">Custom Prompt</option>
        </select>
        
        {node.backgroundType === "color" && (
          <input
            type="color"
            className="w-full h-10 rounded"
            value={node.backgroundColor || "#ffffff"}
            onChange={(e) => onUpdate(node.id, { backgroundColor: e.target.value })}
          />
        )}
        
        {node.backgroundType === "image" && (
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.backgroundImage || ""}
            onChange={(e) => onUpdate(node.id, { backgroundImage: e.target.value })}
          >
            <option value="">Select Background</option>
            <option value="beach">Beach</option>
            <option value="office">Office</option>
            <option value="studio">Studio</option>
            <option value="nature">Nature</option>
            <option value="city">City Skyline</option>
          </select>
        )}
        
        {node.backgroundType === "upload" && (
          <div className="space-y-2">
            {node.customBackgroundImage ? (
              <div className="relative">
                <img src={node.customBackgroundImage} className="w-full rounded" alt="Custom Background" />
                <button 
                  className="absolute top-2 right-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded"
                  onClick={() => onUpdate(node.id, { customBackgroundImage: null })}
                >
                  Remove
                </button>
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
          <textarea
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            placeholder="Describe the background..."
            value={node.customPrompt || ""}
            onChange={(e) => onUpdate(node.id, { customPrompt: e.target.value })}
            rows={2}
          />
        )}
        
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Background"}
        </button>
        
        {node.output && (
          <div className="space-y-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `background-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function ClothesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const hasConfig = node.clothesImage && !node.output;
  
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
      className={`nb-node absolute text-white w-[320px] ${hasConfig ? 'ring-2 ring-yellow-500/50' : ''}`}
      style={{ left: localPos.x, top: localPos.y }}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={onPaste}
      title={hasConfig ? "Has unsaved configuration - will be applied when processing downstream" : ""}
    >
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
        <div className="font-semibold text-sm flex-1 text-center">CLOTHES</div>
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        {hasConfig && (
          <div className="text-xs bg-yellow-500/20 border border-yellow-500/50 rounded px-2 py-1 text-yellow-300">
            ⚡ Config pending - will apply when downstream node processes
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
            <button 
              className="absolute top-2 right-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded"
              onClick={() => onUpdate(node.id, { clothesImage: null, selectedPreset: null })}
            >
              Remove
            </button>
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
        
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.clothesImage}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Clothes"}
        </button>
        {node.output && (
          <div className="space-y-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `clothes-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function AgeNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const hasConfig = node.targetAge && node.targetAge !== 30 && !node.output;
  
  return (
    <div className={`nb-node absolute text-white w-[280px] ${hasConfig ? 'ring-2 ring-yellow-500/50' : ''}`} style={{ left: localPos.x, top: localPos.y }}>
      <div 
        className="nb-header px-3 py-2 flex items-center justify-between rounded-t-[14px] cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port className="in" nodeId={node.id} isOutput={false} onEndConnection={onEndConnection} />
        <div className="font-semibold text-sm flex-1 text-center">AGE</div>
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <label className="flex items-center justify-between text-xs text-white/70 mb-1">
            <span>Target Age</span>
            <span>{node.targetAge || 30} years</span>
          </label>
          <input
            type="range"
            min={18}
            max={100}
            value={node.targetAge || 30}
            onChange={(e) => onUpdate(node.id, { targetAge: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Age"}
        </button>
        {node.output && (
          <div className="space-y-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `age-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function CameraNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
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
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
        {/* Basic Camera Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1">Basic Settings</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">Focal Length</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.focalLength || "None"}
              onChange={(e) => onUpdate(node.id, { focalLength: e.target.value })}
            >
              {focalLengths.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Aperture</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.aperture || "None"}
              onChange={(e) => onUpdate(node.id, { aperture: e.target.value })}
            >
              {apertures.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Shutter Speed</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.shutterSpeed || "None"}
              onChange={(e) => onUpdate(node.id, { shutterSpeed: e.target.value })}
            >
              {shutterSpeeds.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">ISO</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.iso || "None"}
              onChange={(e) => onUpdate(node.id, { iso: e.target.value })}
            >
              {isoValues.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
        
        {/* Creative Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1 mt-3">Creative Settings</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">White Balance</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.whiteBalance || "None"}
              onChange={(e) => onUpdate(node.id, { whiteBalance: e.target.value })}
            >
              {whiteBalances.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Film Style</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.filmStyle || "None"}
              onChange={(e) => onUpdate(node.id, { filmStyle: e.target.value })}
            >
              {filmStyles.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Lighting</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.lighting || "None"}
              onChange={(e) => onUpdate(node.id, { lighting: e.target.value })}
            >
              {lightingTypes.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Bokeh Style</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.bokeh || "None"}
              onChange={(e) => onUpdate(node.id, { bokeh: e.target.value })}
            >
              {bokehStyles.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        
        {/* Composition Settings */}
        <div className="text-xs text-white/50 font-semibold mb-1 mt-3">Composition</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">Camera Angle</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.angle || "None"}
              onChange={(e) => onUpdate(node.id, { angle: e.target.value })}
            >
              {angles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Composition</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.composition || "None"}
              onChange={(e) => onUpdate(node.id, { composition: e.target.value })}
            >
              {compositions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Camera Settings"}
        </button>
        {node.output && (
          <div className="space-y-2 mt-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `camera-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function FaceNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
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
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={node.faceOptions?.removePimples || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, removePimples: e.target.checked }
              })}
            />
            Remove pimples
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={node.faceOptions?.addSunglasses || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, addSunglasses: e.target.checked }
              })}
            />
            Add sunglasses
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={node.faceOptions?.addHat || false}
              onChange={(e) => onUpdate(node.id, { 
                faceOptions: { ...node.faceOptions, addHat: e.target.checked }
              })}
            />
            Add hat
          </label>
        </div>
        
        <div>
          <label className="text-xs text-white/70">Hairstyle</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.faceOptions?.changeHairstyle || "None"}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, changeHairstyle: e.target.value }
            })}
          >
            {hairstyles.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        
        <div>
          <label className="text-xs text-white/70">Expression</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.faceOptions?.facialExpression || "None"}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, facialExpression: e.target.value }
            })}
          >
            {expressions.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        
        <div>
          <label className="text-xs text-white/70">Beard</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.faceOptions?.beardStyle || "None"}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, beardStyle: e.target.value }
            })}
          >
            {beardStyles.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Face Changes"}
        </button>
        {node.output && (
          <div className="space-y-2 mt-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `face-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function BlendNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length) {
      const reader = new FileReader();
      reader.onload = () => onUpdate(node.id, { styleImage: reader.result });
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
          reader.onload = () => onUpdate(node.id, { styleImage: reader.result });
          reader.readAsDataURL(file);
          return;
        }
      }
    }
    const text = e.clipboardData.getData("text");
    if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
      onUpdate(node.id, { styleImage: text });
    }
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
        <div className="font-semibold text-sm flex-1 text-center">BLEND</div>
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="text-xs text-white/70">Style Reference Image</div>
        {node.styleImage ? (
          <div className="relative">
            <img src={node.styleImage} className="w-full rounded" alt="Style" />
            <button 
              className="absolute top-2 right-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded"
              onClick={() => onUpdate(node.id, { styleImage: null })}
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  const reader = new FileReader();
                  reader.onload = () => onUpdate(node.id, { styleImage: reader.result });
                  reader.readAsDataURL(e.target.files[0]);
                }
              }}
            />
            <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-white/40">
              <p className="text-xs text-white/60">Drop, upload, or paste style image</p>
            </div>
          </label>
        )}
        <div>
          <label className="flex items-center justify-between text-xs text-white/70 mb-1">
            <span>Blend Strength</span>
            <span>{node.blendStrength || 50}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={node.blendStrength || 50}
            onChange={(e) => onUpdate(node.id, { blendStrength: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning || !node.styleImage}
          title={!node.input ? "Connect an input first" : !node.styleImage ? "Add a style image first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Style"}
        </button>
        {node.output && (
          <div className="space-y-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `blend-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
        {node.error && (
          <div className="text-xs text-red-400 mt-2">{node.error}</div>
        )}
      </div>
    </div>
  );
}

export function EditNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
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
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <textarea
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          placeholder="Describe what to edit (e.g., 'make it brighter', 'add more contrast', 'make it look vintage')"
          value={node.editPrompt || ""}
          onChange={(e) => onUpdate(node.id, { editPrompt: e.target.value })}
          rows={3}
        />
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 transition-all"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
          title={!node.input ? "Connect an input first" : "Process all unprocessed nodes in chain"}
        >
          {node.isRunning ? "Processing..." : "Apply Edit"}
        </button>
        {node.output && (
          <div className="space-y-2">
            <img src={node.output} className="w-full rounded" alt="Output" />
            <button
              className="w-full text-xs bg-green-600 hover:bg-green-500 rounded px-3 py-1 transition-all"
              onClick={() => downloadImage(node.output, `edit-${Date.now()}.png`)}
            >
              📥 Download Output
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
