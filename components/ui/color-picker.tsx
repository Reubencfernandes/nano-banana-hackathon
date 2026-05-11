import * as React from "react";
import { cn } from "../../lib/utils";

export interface ColorPickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
}

const PRESETS = [
  "#FFFFFF", "#E5E5E5", "#A1A1A1", "#525252", "#1F1F1F", "#000000",
  "#EF4444", "#F59E0B", "#FACC15", "#22C55E", "#06B6D4", "#3B82F6",
  "#8B5CF6", "#EC4899", "#FDE68A", "#FCA5A5", "#A7F3D0", "#BFDBFE",
];

function clampHex(input: string): string {
  let v = input.trim().replace(/^#/, "").toUpperCase();
  v = v.replace(/[^0-9A-F]/g, "").slice(0, 6);
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  if (v.length !== 6) return "";
  return "#" + v;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { h: 0, s: 0, v: 0 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)      [r, g, b] = [c, x, 0];
  else if (h < 120)[r, g, b] = [x, c, 0];
  else if (h < 180)[r, g, b] = [0, c, x];
  else if (h < 240)[r, g, b] = [0, x, c];
  else if (h < 300)[r, g, b] = [x, 0, c];
  else             [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0").toUpperCase();
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

export const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const colorValue = (typeof value === "string" && /^#?[0-9a-f]{3,6}$/i.test(value))
      ? clampHex(value) || "#FFFFFF"
      : "#FFFFFF";

    const [open, setOpen] = React.useState(false);
    const [hexDraft, setHexDraft] = React.useState(colorValue);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const popRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => { setHexDraft(colorValue); }, [colorValue]);

    React.useEffect(() => {
      if (!open) return;
      const onDocPointer = (e: PointerEvent) => {
        const t = e.target as Node;
        if (popRef.current?.contains(t) || containerRef.current?.contains(t)) return;
        setOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onDocPointer);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", onDocPointer);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const emit = (next: string) => {
      if (onChange) onChange({ target: { value: next } });
    };

    const hsv = hexToHsv(colorValue);

    const onSvPointer = (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const rect = target.getBoundingClientRect();
      const update = (clientX: number, clientY: number) => {
        const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
        const y = Math.min(Math.max(0, clientY - rect.top), rect.height);
        const s = rect.width === 0 ? 0 : x / rect.width;
        const v = rect.height === 0 ? 0 : 1 - y / rect.height;
        emit(hsvToHex(hsv.h, s, v));
      };
      update(e.clientX, e.clientY);
      const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
    };

    const onHuePointer = (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const rect = target.getBoundingClientRect();
      const update = (clientX: number) => {
        const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
        const h = rect.width === 0 ? 0 : (x / rect.width) * 360;
        emit(hsvToHex(h, hsv.s || 1, hsv.v || 1));
      };
      update(e.clientX);
      const move = (ev: PointerEvent) => update(ev.clientX);
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
    };

    return (
      <div ref={containerRef} className={cn("nb-color relative w-full", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "group flex w-full items-center gap-2 h-9 rounded-lg border border-input bg-background hover:bg-muted/60 hover:border-ring/35 pl-1.5 pr-3 cursor-pointer transition-colors text-foreground",
            open && "border-primary/60 ring-2 ring-primary/25"
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span
            className="relative inline-block h-6 w-6 rounded-md ring-1 ring-border shadow-inner overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(45deg, hsl(var(--foreground) / 0.09) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--foreground) / 0.09) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--foreground) / 0.09) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--foreground) / 0.09) 75%)",
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
            }}
          >
            <span className="absolute inset-0" style={{ backgroundColor: colorValue }} />
          </span>
          <span className="flex-1 text-left text-xs font-mono uppercase tracking-wider text-foreground/85 select-none">
            {colorValue}
          </span>
          <svg
            aria-hidden viewBox="0 0 12 8"
            className={cn("h-2.5 w-3 text-foreground/60 transition-transform", open && "rotate-180")}
            fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M1 1.5l5 5 5-5" />
          </svg>
        </button>

        {open && (
          <div
            ref={popRef}
            className="absolute z-50 mt-2 w-60 rounded-xl border border-border bg-popover p-3 shadow-2xl text-popover-foreground"
            role="dialog"
          >
            {/* Saturation/Value gradient */}
            <div
              className="relative h-32 w-full rounded-md overflow-hidden cursor-crosshair touch-none"
              onPointerDown={onSvPointer}
              style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }}
            >
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, #000000, transparent)" }}
              />
              <div
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
              />
            </div>

            {/* Hue strip */}
            <div
              className="relative mt-3 h-3 w-full rounded-full cursor-ew-resize touch-none"
              onPointerDown={onHuePointer}
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
            >
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </div>

            {/* Hex input */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-mono text-foreground/60">HEX</span>
              <input
                value={hexDraft.replace(/^#/, "")}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={() => {
                  const h = clampHex(hexDraft);
                  if (h) emit(h);
                  else setHexDraft(colorValue);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const h = clampHex(hexDraft);
                    if (h) emit(h);
                    else setHexDraft(colorValue);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono uppercase tracking-wider text-foreground/95 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
                spellCheck={false}
                maxLength={7}
              />
            </div>

            {/* Preset swatches */}
            <div className="mt-3 grid grid-cols-9 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => emit(p)}
                  title={p}
                  className={cn(
                    "h-5 w-5 rounded-md ring-1 ring-border hover:ring-ring transition-all",
                    p.toUpperCase() === colorValue && "ring-2 ring-primary"
                  )}
                  style={{ backgroundColor: p }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
ColorPicker.displayName = "ColorPicker";
