"use client";

import React, { useState, useRef, useEffect } from "react";

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
  
  return (
    <div className="nb-node absolute text-white w-[320px]" style={{ left: localPos.x, top: localPos.y }}>
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
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Background"}
        </button>
        
        {node.output && (
          <img src={node.output} className="w-full rounded" alt="Output" />
        )}
      </div>
    </div>
  );
}

export function ClothesNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
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
        <div className="font-semibold text-sm flex-1 text-center">CLOTHES</div>
        <div className="flex items-center gap-2">
          <button className="text-2xl text-red-400 opacity-50 hover:opacity-100" onClick={() => onDelete(node.id)}>×</button>
          <Port className="out" nodeId={node.id} isOutput={true} onStartConnection={onStartConnection} />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <textarea
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          placeholder="Describe the clothes (e.g., 'red t-shirt and jeans')"
          value={node.clothesPrompt || ""}
          onChange={(e) => onUpdate(node.id, { clothesPrompt: e.target.value })}
          rows={2}
        />
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Change Clothes"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded" alt="Output" />}
      </div>
    </div>
  );
}

export function AgeNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
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
            min={1}
            max={100}
            value={node.targetAge || 30}
            onChange={(e) => onUpdate(node.id, { targetAge: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Age"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded" alt="Output" />}
      </div>
    </div>
  );
}

export function CameraNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const focalLengths = ["12mm", "24mm", "35mm", "50mm", "85mm", "135mm", "200mm"];
  const apertures = ["f/1.2", "f/1.8", "f/2.8", "f/5.6", "f/8", "f/11", "f/16"];
  const shutterSpeeds = ["1/8000s", "1/250s", "1/30s", "5s"];
  const whiteBalances = ["3200K tungsten", "5600K daylight", "7000K shade"];
  const angles = ["eye level", "low angle", "high angle", "Dutch tilt", "bird's eye"];

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
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-white/70">Focal Length</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.focalLength || "50mm"}
              onChange={(e) => onUpdate(node.id, { focalLength: e.target.value })}
            >
              {focalLengths.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Aperture</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.aperture || "f/2.8"}
              onChange={(e) => onUpdate(node.id, { aperture: e.target.value })}
            >
              {apertures.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">Shutter</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.shutterSpeed || "1/250s"}
              onChange={(e) => onUpdate(node.id, { shutterSpeed: e.target.value })}
            >
              {shutterSpeeds.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70">White Balance</label>
            <select 
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
              value={node.whiteBalance || "5600K daylight"}
              onChange={(e) => onUpdate(node.id, { whiteBalance: e.target.value })}
            >
              {whiteBalances.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/70">Camera Angle</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.angle || "eye level"}
            onChange={(e) => onUpdate(node.id, { angle: e.target.value })}
          >
            {angles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Camera Settings"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded mt-2" alt="Output" />}
      </div>
    </div>
  );
}

export function FaceNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  const hairstyles = ["short", "long", "curly", "straight", "bald", "mohawk", "ponytail"];
  const expressions = ["happy", "serious", "smiling", "laughing", "sad", "surprised", "angry"];
  const beardStyles = ["none", "stubble", "goatee", "full beard", "mustache", "clean shaven"];

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
            value={node.faceOptions?.changeHairstyle || ""}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, changeHairstyle: e.target.value }
            })}
          >
            <option value="">Keep current</option>
            {hairstyles.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        
        <div>
          <label className="text-xs text-white/70">Expression</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.faceOptions?.facialExpression || ""}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, facialExpression: e.target.value }
            })}
          >
            <option value="">Keep current</option>
            {expressions.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        
        <div>
          <label className="text-xs text-white/70">Beard</label>
          <select 
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
            value={node.faceOptions?.beardStyle || ""}
            onChange={(e) => onUpdate(node.id, { 
              faceOptions: { ...node.faceOptions, beardStyle: e.target.value }
            })}
          >
            <option value="">Keep current</option>
            {beardStyles.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        
        <button 
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Face Changes"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded mt-2" alt="Output" />}
      </div>
    </div>
  );
}

export function BlendNodeView({ node, onDelete, onUpdate, onStartConnection, onEndConnection, onProcess, onUpdatePosition }: any) {
  const { localPos, onPointerDown, onPointerMove, onPointerUp } = useNodeDrag(node, onUpdatePosition);
  
  return (
    <div className="nb-node absolute text-white w-[300px]" style={{ left: localPos.x, top: localPos.y }}>
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
        <textarea
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
          placeholder="Style to blend (e.g., 'oil painting', 'watercolor', 'anime')"
          value={node.stylePrompt || ""}
          onChange={(e) => onUpdate(node.id, { stylePrompt: e.target.value })}
          rows={2}
        />
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
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Blend"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded" alt="Output" />}
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
          className="w-full text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1"
          onClick={() => onProcess(node.id)}
          disabled={node.isRunning}
        >
          {node.isRunning ? "Processing..." : "Apply Edit"}
        </button>
        {node.output && <img src={node.output} className="w-full rounded" alt="Output" />}
      </div>
    </div>
  );
}
