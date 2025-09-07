"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  const arr = Array.from(files as File[]);
  return Promise.all(
    arr.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        })
    )
  );
}

type ZoneKind = "user" | "clothes";

function UploadZone({
  title,
  description,
  onDropData,
  allowMultiple = false,
}: {
  title: string;
  description: string;
  onDropData: (dataUrls: string[]) => void;
  allowMultiple?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const urls = await readFilesAsDataUrls(files);
      onDropData(urls);
    },
    [onDropData]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files && files.length) {
        await handleFiles(files);
      }
    },
    [handleFiles]
  );

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
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
        await handleFiles(files);
        return;
      }

      // Fallback: if user pasted a URL (e.g., copied image address)
      const text = e.clipboardData.getData("text");
      if (text && (text.startsWith("http") || text.startsWith("data:image"))) {
        onDropData([text]);
      }
    },
    [handleFiles, onDropData]
  );

  return (
    <div
      ref={ref}
      tabIndex={0}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={onPaste}
      className="rounded-2xl border border-white/10 bg-black/40 text-white p-6 sm:p-8 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold tracking-wide">{title}</h2>
        <span className="text-xs text-white/60">drop • click • paste</span>
      </div>
      <label className="block" aria-label={`${title} uploader`}>
        <input
          type="file"
          accept="image/*"
          multiple={allowMultiple}
          className="hidden"
          onChange={async (e) => {
            if (e.currentTarget.files?.length) {
              await handleFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }
          }}
        />
        <div className="grid place-items-center rounded-xl border border-dashed border-white/20 hover:border-white/40 cursor-pointer px-6 py-12 sm:py-16 text-center select-none">
          <p className="text-sm leading-6 text-white/80">
            {description}
          </p>
          <p className="mt-3 text-xs text-white/50">
            Upload or paste an image. Tip: click this box and press Ctrl/Cmd+V
          </p>
        </div>
      </label>
    </div>
  );
}

export default function TryOnPage() {
  const [userImage, setUserImage] = useState<string | null>(null);
  const [clothingImages, setClothingImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const selectedClothing = useMemo(
    () => (selectedIndex != null ? clothingImages[selectedIndex] : null),
    [selectedIndex, clothingImages]
  );

  // Overlay controls
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);

  const dragRef = useRef<HTMLImageElement>(null);
  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!selectedClothing) return;
    dragging.current = true;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offsetX,
      oy: offsetY,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    setOffsetX(start.current.ox + dx);
    setOffsetY(start.current.oy + dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    start.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const addUserImages = (urls: string[]) => {
    setUserImage(urls[0] ?? null);
  };
  const addClothesImages = (urls: string[]) => {
    setClothingImages((prev) => [...urls, ...prev]);
    if (selectedIndex == null && urls.length) setSelectedIndex(0);
  };

  // Gemini generation
  const [genPrompt, setGenPrompt] = useState(
    "A front-facing fashion product (e.g., jacket, shirt, dress, sunglasses, or accessory) on a plain or transparent background, high quality, photo-realistic."
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateWithGemini = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: genPrompt }),
      });
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { images?: string[]; text?: string };
      const imgs = data.images ?? [];
      if (!imgs.length) {
        // Fallback: if model returned only text, just show an error message
        throw new Error(
          "Model returned no images. Try a different prompt, e.g., 'white t-shirt, product photo, front view'."
        );
      }
      addClothesImages(imgs);
    } catch (e: any) {
      setError(e?.message || "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-wide">
            Virtual Try-On (simple overlay)
          </h1>
          <a
            className="text-xs text-white/60 hover:text-white underline underline-offset-4"
            href="/"
          >
            Home
          </a>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <UploadZone
            title="Your photo"
            description="Drop, click to upload, or paste your portrait. Prefer front-facing photos for best results."
            onDropData={addUserImages}
          />
          <UploadZone
            title="Clothing / accessories"
            description="Add product shots you want to try. You can upload multiple, paste, or use Gemini to generate some."
            onDropData={addClothesImages}
            allowMultiple
          />
        </div>

        {/* Preview area */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-medium text-white/80">Your photo</h3>
            <div
              className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-black grid place-items-center"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {userImage ? (
                <img
                  src={userImage}
                  alt="User"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <p className="text-white/50 text-sm">No photo yet</p>
              )}

              {/* Overlay clothing */}
              {userImage && selectedClothing && (
                <img
                  ref={dragRef}
                  src={selectedClothing}
                  alt="Clothing overlay"
                  className="pointer-events-auto select-none"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${rotation}deg) scale(${scale})`,
                    transformOrigin: "center center",
                    maxWidth: "70%",
                  }}
                />
              )}
            </div>

            {/* Controls */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center justify-between text-xs text-white/70 mb-1">
                  <span>Scale</span>
                  <span>{scale.toFixed(2)}x</span>
                </label>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.01}
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-white/70 mb-1">
                  <span>Rotation</span>
                  <span>{rotation.toFixed(0)}°</span>
                </label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-white/70 mb-1">
                  <span>Offset X</span>
                  <span>{offsetX.toFixed(0)}px</span>
                </label>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={1}
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-white/70 mb-1">
                  <span>Offset Y</span>
                  <span>{offsetY.toFixed(0)}px</span>
                </label>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={1}
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-medium text-white/80">
              Clothing library
            </h3>
            {clothingImages.length === 0 ? (
              <p className="text-white/50 text-sm">No clothing images yet</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {clothingImages.map((src, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative aspect-square overflow-hidden rounded-lg border ${
                      selectedIndex === idx
                        ? "border-indigo-400"
                        : "border-white/10 hover:border-white/30"
                    }`}
                    title="Select for overlay"
                  >
                    <img
                      src={src}
                      alt={`Clothing ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Gemini generator */}
            <div className="mt-6 rounded-xl bg-black/40 border border-white/10 p-4">
              <p className="text-sm text-white/80 font-medium mb-2">
                Generate with Gemini
              </p>
              <div className="flex flex-col gap-3">
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg bg-black/60 border border-white/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={generateWithGemini}
                    disabled={isGenerating}
                    className="inline-flex items-center justify-center rounded-md bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
                  >
                    {isGenerating ? "Generating…" : "Generate"}
                  </button>
                  {error && (
                    <span className="text-xs text-red-400">{error}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/50">
                  Tip: Ask for a single front-view item with plain background, e.g.
                  "black leather jacket, product photo, front view".
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-xs text-white/50">
          Note: This demo performs a simple 2D overlay for exploration. True
          virtual try-on (warping to body shape, segmentation) requires
          specialized vision models not included here.
        </div>
      </div>
    </div>
  );
}

