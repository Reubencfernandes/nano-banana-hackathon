"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackgroundNodeView,
  ClothesNodeView,
  BlendNodeView,
  EditNodeView,
  CameraNodeView,
  AgeNodeView,
  FaceNodeView
} from "./nodes";

function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

// Simple ID helper
const uid = () => Math.random().toString(36).slice(2, 9);

// Generate merge prompt based on number of inputs
function generateMergePrompt(characterData: { image: string; label: string }[]): string {
  const count = characterData.length;
  
  if (count === 2) {
    return `You are provided with 2 images. Each image may contain one or more people. Create a single new photorealistic image that combines ALL people from BOTH images into one scene. If image 1 has multiple people, include all of them. If image 2 has multiple people, include all of them. Place everyone together in the same scene, standing side by side or in a natural group arrangement. Ensure all people are clearly visible with consistent lighting, proper sizing, and natural shadows. The result should look like a genuine group photo.`;
  }
  
  return `You are provided with ${count} images. Each image may contain one or more people. Create a single new photorealistic image that combines ALL people from ALL ${count} images into one comprehensive group photo. 
  
  Important instructions:
  - Include EVERY person from EVERY input image
  - If an image has multiple people, include all of them
  - Arrange everyone in a natural group formation
  - Ensure all people are clearly visible and recognizable
  - Match lighting, shadows, and proportions realistically
  - The final image should look like an authentic group photo with everyone together`;
}

// Types
type NodeType = "CHARACTER" | "MERGE" | "BACKGROUND" | "CLOTHES" | "BLEND" | "EDIT" | "CAMERA" | "AGE" | "FACE";

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
  output?: string; // data URL from merge
  isRunning?: boolean;
  error?: string | null;
};

type BackgroundNode = NodeBase & {
  type: "BACKGROUND";
  input?: string; // node id
  output?: string;
  backgroundType: "color" | "image" | "custom";
  backgroundColor?: string;
  backgroundImage?: string;
  isRunning?: boolean;
  error?: string | null;
};

type ClothesNode = NodeBase & {
  type: "CLOTHES";
  input?: string;
  output?: string;
  clothesImage?: string;
  clothesPrompt?: string;
  isRunning?: boolean;
  error?: string | null;
};

type BlendNode = NodeBase & {
  type: "BLEND";
  input?: string;
  output?: string;
  stylePrompt?: string;
  blendStrength?: number;
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

type AnyNode = CharacterNode | MergeNode | BackgroundNode | ClothesNode | BlendNode | EditNode | CameraNode | AgeNode | FaceNode;

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
          <button
            className="text-2xl leading-none font-bold text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-all hover:scale-110 px-1"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete ${node.label || 'CHARACTER'} node?`)) {
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
        <div className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-black/40 grid place-items-center">
          <img
            src={node.image}
            alt="character"
            className="h-full w-full object-cover"
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
  characters,
  onDisconnect,
  onRun,
  onEndConnection,
  onUpdatePosition,
  onDelete,
  onClearConnections,
}: {
  node: MergeNode;
  scaleRef: React.MutableRefObject<number>;
  characters: CharacterNode[];
  onDisconnect: (mergeId: string, characterId: string) => void;
  onRun: (mergeId: string) => void;
  onEndConnection: (mergeId: string) => void;
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
    <div className="nb-node absolute text-white w-[380px]" style={{ left: pos.x, top: pos.y }}>
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
        <div className="font-semibold tracking-wide text-sm flex-1">MERGE</div>
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
      </div>
      <div className="p-3 space-y-3">
        <div className="text-xs text-white/70">Inputs</div>
        <div className="flex flex-wrap gap-2">
          {node.inputs.map((id) => {
            const c = characters.find((x) => x.id === id);
            if (!c) return null;
            return (
              <div key={id} className="flex items-center gap-2 bg-white/10 rounded px-2 py-1">
                <div className="w-6 h-6 rounded overflow-hidden">
                  <img src={c.image} className="w-full h-full object-cover" alt="inp" />
                </div>
                <span className="text-xs">{c.label || `Character ${id.slice(-3)}`}</span>
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
          <p className="text-xs text-white/40">Drag from CHARACTER output port to connect</p>
        )}
        <div className="flex items-center gap-2">
          {node.inputs.length > 0 && (
            <button
              className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded px-3 py-1"
              onClick={() => onClearConnections(node.id)}
              title="Clear all connections"
            >
              Clear
            </button>
          )}
          <button
            className="text-xs bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 disabled:opacity-60"
            onClick={() => onRun(node.id)}
            disabled={node.isRunning || node.inputs.length < 2}
          >
            {node.isRunning ? "Merging…" : "Merge"}
          </button>
        </div>

        <div className="mt-2">
          <div className="text-xs text-white/70 mb-1">Output</div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/40 grid place-items-center">
            {node.output ? (
              <img src={node.output} className="w-full h-full object-contain" alt="output" />
            ) : (
              <span className="text-white/40 text-xs">Run merge to see result</span>
            )}
          </div>
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
      // Find the source node to get its output
      const sourceNode = nodes.find(n => n.id === draggingFrom);
      if (sourceNode && (sourceNode as any).output) {
        // Connect the output to this node's input
        setNodes(prev => prev.map(n => 
          n.id === nodeId ? { ...n, input: draggingFrom } : n
        ));
      } else if (sourceNode?.type === "CHARACTER") {
        // Direct connection from CHARACTER node
        setNodes(prev => prev.map(n => 
          n.id === nodeId ? { ...n, input: draggingFrom } : n
        ));
      }
      setDraggingFrom(null);
      setDragPos(null);
    }
  };

  // Process node with API
  const processNode = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Get input image
    let inputImage: string | null = null;
    if ((node as any).input) {
      const inputNode = nodes.find(n => n.id === (node as any).input);
      if (inputNode) {
        if (inputNode.type === "CHARACTER") {
          inputImage = (inputNode as CharacterNode).image;
        } else if ((inputNode as any).output) {
          inputImage = (inputNode as any).output;
        }
      }
    }

    if (!inputImage) {
      setNodes(prev => prev.map(n => 
        n.id === nodeId ? { ...n, error: "No input image connected" } : n
      ));
      return;
    }

    // Set loading state
    setNodes(prev => prev.map(n => 
      n.id === nodeId ? { ...n, isRunning: true, error: null } : n
    ));

    try {
      const params: any = {};
      
      // Build params based on node type
      switch (node.type) {
        case "BACKGROUND":
          params.backgroundType = (node as BackgroundNode).backgroundType;
          params.backgroundColor = (node as BackgroundNode).backgroundColor;
          params.backgroundImage = (node as BackgroundNode).backgroundImage;
          params.customPrompt = (node as BackgroundNode).customPrompt;
          break;
        case "CLOTHES":
          params.clothesPrompt = (node as ClothesNode).clothesPrompt;
          break;
        case "BLEND":
          params.stylePrompt = (node as BlendNode).stylePrompt;
          params.blendStrength = (node as BlendNode).blendStrength;
          break;
        case "EDIT":
          params.editPrompt = (node as EditNode).editPrompt;
          break;
        case "CAMERA":
          params.focalLength = (node as CameraNode).focalLength;
          params.aperture = (node as CameraNode).aperture;
          params.shutterSpeed = (node as CameraNode).shutterSpeed;
          params.whiteBalance = (node as CameraNode).whiteBalance;
          params.angle = (node as CameraNode).angle;
          break;
        case "AGE":
          params.targetAge = (node as AgeNode).targetAge;
          break;
        case "FACE":
          params.faceOptions = (node as FaceNode).faceOptions;
          break;
      }

      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: node.type,
          image: inputImage,
          params
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      setNodes(prev => prev.map(n => 
        n.id === nodeId ? { ...n, output: data.image, isRunning: false, error: null } : n
      ));
    } catch (e: any) {
      console.error("Process error:", e);
      setNodes(prev => prev.map(n => 
        n.id === nodeId ? { ...n, isRunning: false, error: e?.message || "Error" } : n
      ));
    }
  };

  const connectToMerge = (mergeId: string, characterId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === mergeId && n.type === "MERGE"
          ? { ...n, inputs: Array.from(new Set([...(n as MergeNode).inputs, characterId])) }
          : n
      )
    );
  };

  // Connection drag handlers
  const handleStartConnection = (characterId: string) => {
    setDraggingFrom(characterId);
  };

  const handleEndConnection = (mergeId: string) => {
    if (draggingFrom) {
      connectToMerge(mergeId, draggingFrom);
      setDraggingFrom(null);
      setDragPos(null);
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
    }
  };
  const disconnectFromMerge = (mergeId: string, characterId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === mergeId && n.type === "MERGE"
          ? { ...n, inputs: (n as MergeNode).inputs.filter((i) => i !== characterId) }
          : n
      )
    );
  };

  const runMerge = async (mergeId: string) => {
    setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, isRunning: true, error: null } : n)));
    try {
      const merge = (nodes.find((n) => n.id === mergeId) as MergeNode) || null;
      if (!merge) return;
      
      // Get character nodes with their labels
      const characterData = merge.inputs
        .map((id, index) => {
          const char = nodes.find((c) => c.id === id) as CharacterNode | undefined;
          if (!char) return null;
          return {
            image: char.image,
            label: char.label || `CHARACTER${index + 1}`
          };
        })
        .filter(Boolean) as { image: string; label: string }[];
      
      if (characterData.length < 2) throw new Error("Connect at least two CHARACTER nodes.");
      
      // Generate dynamic prompt based on number of inputs
      const prompt = generateMergePrompt(characterData);
      const imgs = characterData.map(d => d.image);

      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: imgs, prompt }),
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
      const out = (js.images?.[0] as string) || null;
      setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, output: out, isRunning: false } : n)));
    } catch (e: any) {
      console.error("Merge error:", e);
      setNodes((prev) => prev.map((n) => (n.id === mergeId && n.type === "MERGE" ? { ...n, isRunning: false, error: e?.message || "Error" } : n)));
    }
  };

  // Connection paths with bezier curves
  const connectionPaths = useMemo(() => {
    const getNodeOutputPort = (n: AnyNode) => {
      // Different nodes have different widths
      const widths: Record<string, number> = {
        CHARACTER: 340,
        MERGE: 380,
        BACKGROUND: 320,
        CLOTHES: 320,
        BLEND: 300,
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
    
    const paths: { path: string; active?: boolean }[] = [];
    
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
            paths.push({ path: createPath(start.x, start.y, end.x, end.y) });
          }
        }
      } else if ((node as any).input) {
        // Single input nodes
        const inputId = (node as any).input;
        const inputNode = nodes.find(n => n.id === inputId);
        if (inputNode) {
          const start = getNodeOutputPort(inputNode);
          const end = getNodeInputPort(node);
          paths.push({ path: createPath(start.x, start.y, end.x, end.y) });
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
      case "EDIT":
        setNodes(prev => [...prev, { ...commonProps, type: "EDIT" } as EditNode]);
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
    <div className="min-h-[100svh] bg-[#0b0b0b] text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h1 className="text-lg font-semibold tracking-wide">Nano Banana Editor</h1>
        <div className="flex items-center gap-2">
          <button className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1" onClick={() => addCharacter()}>+ CHARACTER</button>
          <button className="text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1" onClick={() => addMerge()}>+ MERGE</button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="relative w-full h-[calc(100svh-56px)] overflow-hidden nb-canvas"
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
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          <svg className="absolute inset-0 pointer-events-none z-0" width="4800" height="3200">
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
                d={p.path}
                fill="none"
                stroke={p.active ? "#8b5cf6" : "#7c7c7c"}
                strokeWidth="2.5"
                strokeDasharray={p.active ? "5,5" : undefined}
                filter={p.active ? "url(#glow)" : undefined}
                opacity={p.active ? 0.8 : 1}
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
                      characters={nodes.filter((n) => n.type === "CHARACTER") as CharacterNode[]}
                      onDisconnect={disconnectFromMerge}
                      onRun={runMerge}
                      onEndConnection={handleEndConnection}
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
                case "BLEND":
                  return (
                    <BlendNodeView
                      key={node.id}
                      node={node as BlendNode}
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
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg" onClick={() => addFromMenu("BLEND")}>BLEND</button>
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

