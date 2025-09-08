"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./editor.css";
import {
  BackgroundNodeView,
  ClothesNodeView,
  StyleNodeView,
  EditNodeView,
  CameraNodeView,
  AgeNodeView,
  FaceNodeView
} from "./nodes";
import { Button } from "../../components/ui/button";

function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

// Simple ID helper
const uid = () => Math.random().toString(36).slice(2, 9);

// Generate merge prompt based on number of inputs
function generateMergePrompt(characterData: { image: string; label: string }[]): string {
  const count = characterData.length;
  
  const labels = characterData.map((d, i) => `Image ${i + 1} (${d.label})`).join(", ");
  
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

// Types
type NodeType = "CHARACTER" | "MERGE" | "BACKGROUND" | "CLOTHES" | "STYLE" | "EDIT" | "CAMERA" | "AGE" | "FACE";

type NodeBase = {
  id: string;
  type: NodeType;
  x: number; // world coords
  y: number; // world coords
};

type CharacterNode = NodeBase & {
  type: "CHARACTER";
  image: string; // data URL or http URL
  label?: string;
};

type MergeNode = NodeBase & {
  type: "MERGE";
  inputs: string[]; // node ids
  output?: string | null; // data URL from merge
  isRunning?: boolean;
  error?: string | null;
};

type BackgroundNode = NodeBase & {
  type: "BACKGROUND";
  input?: string; // node id
  output?: string;
  backgroundType: "color" | "image" | "upload" | "custom";
  backgroundColor?: string;
  backgroundImage?: string;
  customBackgroundImage?: string;
  customPrompt?: string;
  isRunning?: boolean;
  error?: string | null;
};

type ClothesNode = NodeBase & {
  type: "CLOTHES";
  input?: string;
  output?: string;
  clothesImage?: string;
  selectedPreset?: string;
  clothesPrompt?: string;
  isRunning?: boolean;
  error?: string | null;
};

type StyleNode = NodeBase & {
  type: "STYLE";
  input?: string;
  output?: string;
  stylePreset?: string;
  styleStrength?: number;
  isRunning?: boolean;
  error?: string | null;
};

type EditNode = NodeBase & {
  type: "EDIT";
  input?: string;
  output?: string;
  editPrompt?: string;
  isRunning?: boolean;
  error?: string | null;
};

type CameraNode = NodeBase & {
  type: "CAMERA";
  input?: string;
  output?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  whiteBalance?: string;
  angle?: string;
  iso?: string;
  filmStyle?: string;
  lighting?: string;
  bokeh?: string;
  composition?: string;
  aspectRatio?: string;
  isRunning?: boolean;
  error?: string | null;
};

type AgeNode = NodeBase & {
  type: "AGE";
  input?: string;
  output?: string;
  targetAge?: number;
  isRunning?: boolean;
  error?: string | null;
};

type FaceNode = NodeBase & {
  type: "FACE";
  input?: string;
  output?: string;
  faceOptions?: {
    removePimples?: boolean;
    addSunglasses?: boolean;
    addHat?: boolean;
    changeHairstyle?: string;
    facialExpression?: string;
    beardStyle?: string;
  };
  isRunning?: boolean;
  error?: string | null;
};

type AnyNode = CharacterNode | MergeNode | BackgroundNode | ClothesNode | StyleNode | EditNode | CameraNode | AgeNode | FaceNode;

// Default placeholder portrait
const DEFAULT_PERSON =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=640&auto=format&fit=crop";

function toDataUrls(files: FileList | File[]): Promise<string[]> {
  const arr = Array.from(files as File[]);
  return Promise.all(
    arr.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        })
    )
  );
}

// Viewport helpers
function screenToWorld(
  clientX: number,
  clientY: number,
  container: DOMRect,
  tx: number,
  ty: number,
  scale: number
) {
  const x = (clientX - container.left - tx) / scale;
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
      className="nb-node absolute text-white w-[340px] select-none"
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
            variant="ghost" size="icon" className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete MERGE node?')) {
                onDelete(node.id);
              }
            }}
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
        <div className="aspect-[4/5] w-full rounded-xl bg-black/40 grid place-items-center overflow-hidden">
          <img
            src={node.image}
            alt="character"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
        <div className="flex gap-2">
          <label className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1 cursor-pointer">
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
                  } catch {}
                }
              }}
            />
          </label>
          <button
            className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
                  onChangeImage(node.id, text);
                }
              } catch {}
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
    <div className="nb-node absolute text-white w-[420px]" style={{ left: pos.x, top: pos.y }}>
      <div
        className="nb-header cursor-grab active:cursor-grabbing rounded-t-[14px] px-3 py-2 flex items-center justify-between"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Port 
          className="in" 
          nodeId={node.id}
          isOutput={false}
          onEndConnection={onEndConnection}
        />
        <div className="font-semibold tracking-wide text-sm flex-1 text-center">MERGE</div>
        <div className="flex items-center gap-2">
          <button
            className="text-2xl leading-none font-bold text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-all hover:scale-110 px-1"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete MERGE node?')) {
                onDelete(node.id);
              }
            }}
            title="Delete node"
          >
            ×
          </button>
          <Port 
            className="out" 
            nodeId={node.id}
            isOutput={true}
            onStartConnection={onStartConnection}
          />
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="text-xs text-white/70">Inputs</div>
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
              image = (inputNode as MergeNode).output;
              label = "Merged";
            } else {
              // Node without output yet
              label = `${inputNode.type} (pending)`;
            }
            
            return (
              <div key={id} className="flex items-center gap-2 bg-white/10 rounded px-2 py-1">
                {image && (
                  <div className="w-6 h-6 rounded overflow-hidden bg-black/20">
                    <img src={image} className="w-full h-full object-contain" alt="inp" />
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
          <div className="text-xs text-white/70 mb-1">Output</div>
          <div className="w-full min-h-[200px] max-h-[400px] rounded-xl bg-black/40 grid place-items-center">
            {node.output ? (
              <img src={node.output} className="w-full h-auto max-h-[400px] object-contain rounded-xl" alt="output" />
            ) : (
              <span className="text-white/40 text-xs py-16">Run merge to see result</span>
            )}
          </div>
          {node.output && (
            <Button
              className="w-full mt-2"
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
          )}
          {node.error && (
            <div className="mt-2">
              <div className="text-xs text-red-400">{node.error}</div>
              {node.error.includes("API key") && (
                <div className="text-xs text-white/50 mt-2 space-y-1">
                  <p>To fix this:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Get key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 hover:underline">Google AI Studio</a></li>
                    <li>Edit .env.local file in project root</li>
                    <li>Replace placeholder with your key</li>
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

  // Connection dragging state
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{x: number, y: number} | null>(null);

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
  const getNodeConfiguration = (node: AnyNode): any => {
    const config: any = {};
    
    switch (node.type) {
      case "BACKGROUND":
        if ((node as BackgroundNode).backgroundType) {
          config.backgroundType = (node as BackgroundNode).backgroundType;
          config.backgroundColor = (node as BackgroundNode).backgroundColor;
          config.backgroundImage = (node as BackgroundNode).backgroundImage;
          config.customBackgroundImage = (node as BackgroundNode).customBackgroundImage;
          config.customPrompt = (node as BackgroundNode).customPrompt;
        }
        break;
      case "CLOTHES":
        if ((node as ClothesNode).clothesImage) {
          config.clothesImage = (node as ClothesNode).clothesImage;
          config.selectedPreset = (node as ClothesNode).selectedPreset;
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
        break;
      case "AGE":
        if ((node as AgeNode).targetAge) {
          config.targetAge = (node as AgeNode).targetAge;
        }
        break;
      case "FACE":
        const face = node as FaceNode;
        if (face.faceOptions) {
          const opts: any = {};
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
        console.log(`Found ${unprocessedMerges.length} unprocessed MERGE nodes in chain. Processing them first...`);
        
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
              n.id === merge.id ? { ...n, output: mergeOutput, isRunning: false, error: null } : n
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
      console.log(`🚀 Combining ${unprocessedNodeCount} node transformations into ONE API call`);
      console.log("Combined parameters:", params);
    } else {
      console.log("Processing single node:", node.type);
    }

    // Set loading state for all nodes being processed
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId || processedNodes.includes(n.id)) {
        return { ...n, isRunning: true, error: null };
      }
      return n;
    }));

    try {
      // Make a SINGLE API call with all accumulated parameters
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COMBINED", // Indicate this is a combined processing
          image: inputImage,
          params
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      // Only update the current node with the output
      // Don't show output in intermediate nodes - they were just used for configuration
      setNodes(prev => prev.map(n => {
        if (n.id === nodeId) {
          // Only the current node gets the final output displayed
          return { ...n, output: data.image, isRunning: false, error: null };
        } else if (processedNodes.includes(n.id)) {
          // Mark intermediate nodes as no longer running but don't give them output
          // This way they remain unprocessed visually but their configs were used
          return { ...n, isRunning: false, error: null };
        }
        return n;
      }));
      
      if (unprocessedNodeCount > 1) {
        console.log(`✅ Successfully applied ${unprocessedNodeCount} transformations in ONE API call!`);
        console.log(`Saved ${unprocessedNodeCount - 1} API calls by combining transformations`);
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
          image = (inputNode as MergeNode).output;
          label = "Merged Image";
        }
        
        if (image) {
          mergeImages.push(image);
          inputData.push({ image, label: label || `Input ${mergeImages.length}` });
        }
      }
    }
    
    if (mergeImages.length < 2) {
      throw new Error("Not enough valid inputs for merge. Need at least 2 images.");
    }
    
    const prompt = generateMergePrompt(inputData);
    
    // Use the process route instead of merge route
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        type: "MERGE",
        images: mergeImages, 
        prompt 
      }),
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Merge failed");
    }
    
    return data.image || (data.images?.[0] as string) || null;
  };
  
  const runMerge = async (mergeId: string) => {
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
            image = (inputNode as MergeNode).output;
            label = `Merged Image ${index + 1}`;
          }
          
          if (!image) return null;
          
          return { image, label };
        })
        .filter(Boolean) as { image: string; label: string }[];
      
      if (inputData.length < 2) throw new Error("Connect at least two nodes with images (CHARACTER nodes or processed nodes).");
      
      // Debug: Log what we're sending
      console.log("🔄 Merging nodes:", inputData.map(d => d.label).join(", "));
      console.log("📷 Image URLs being sent:", inputData.map(d => d.image.substring(0, 100) + "..."));
      
      // Generate dynamic prompt based on number of inputs
      const prompt = generateMergePrompt(inputData);
      const imgs = inputData.map(d => d.image);

      // Use the process route with MERGE type
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "MERGE",
          images: imgs, 
          prompt 
        }),
      });
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
            const isProcessing = merge.isRunning || (inputNode as any).isRunning;
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
          const isProcessing = (node as any).isRunning || (inputNode as any).isRunning;
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
    setMenuPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setMenuOpen(true);
  };

  const addFromMenu = (kind: NodeType) => {
    const commonProps = {
      id: uid(),
      x: menuWorld.x,
      y: menuWorld.y,
    };
    
    switch(kind) {
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
    }
    setMenuOpen(false);
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="flex items-center px-6 py-4 border-b border-border/60 bg-card/70 backdrop-blur">
        <h1 className="text-lg font-semibold tracking-wide">
          <span className="mr-2" aria-hidden>🍌</span>Nano Banana Editor
        </h1>
      </header>

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
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
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
                default:
                  return null;
              }
            })}
          </div>
        </div>

        {menuOpen && (
          <div
            className="absolute z-50 rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur p-1 w-56 shadow-2xl"
            style={{ left: menuPos.x, top: menuPos.y }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="px-3 py-2 text-xs text-white/60">Add node</div>
            <div className="max-h-[400px] overflow-y-auto">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("CHARACTER")}>CHARACTER</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("MERGE")}>MERGE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("BACKGROUND")}>BACKGROUND</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("CLOTHES")}>CLOTHES</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("STYLE")}>STYLE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("EDIT")}>EDIT</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("CAMERA")}>CAMERA</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("AGE")}>AGE</button>
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("FACE")}>FACE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

