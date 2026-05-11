import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, value, onChange, disabled, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    const options = React.useMemo(() => {
      const opts: { value: string; label: string; disabled?: boolean }[] = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child) && child.type === "option") {
          const p = child.props as { value?: string; children?: React.ReactNode; disabled?: boolean };
          opts.push({
            value: p.value ?? "",
            label: typeof p.children === "string" ? p.children : String(p.children ?? ""),
            disabled: p.disabled,
          });
        }
      });
      return opts;
    }, [children]);

    const selectedLabel =
      options.find((o) => o.value === String(value ?? ""))?.label ??
      options[0]?.label ??
      "";

    const handleOpen = () => {
      if (disabled) return;
      if (!open && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownStyle({
          position: "fixed",
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          zIndex: 99999,
        });
      }
      setOpen((v) => !v);
    };

    const handleSelect = (optValue: string) => {
      onChange?.({
        target: { value: optValue } as HTMLSelectElement,
        currentTarget: { value: optValue } as HTMLSelectElement,
      } as React.ChangeEvent<HTMLSelectElement>);
      setOpen(false);
    };

    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          containerRef.current && !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open]);

    const dropdown = open ? (
      <div
        style={dropdownStyle}
        className="nb-select-list rounded-xl border overflow-hidden shadow-lg"
      >
        <div className="max-h-60 overflow-y-auto py-1 scrollbar-thin">
          {options.map((opt) => {
            const isSelected = String(value ?? "") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!opt.disabled) handleSelect(opt.value);
                }}
                className={cn(
                  "nb-select-option w-full px-3 py-1.5 text-sm text-left transition-colors duration-100 flex items-center gap-2",
                  isSelected && "is-selected",
                  opt.disabled && "opacity-35 cursor-not-allowed"
                )}
              >
                {isSelected && (
                  <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4l3 3 5-6" />
                  </svg>
                )}
                {!isSelected && <span className="w-2.5 flex-shrink-0" />}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

    return (
      <div ref={containerRef} className={cn("nb-select relative w-full", className)}>
        {/* Hidden native select for form compatibility */}
        <select
          ref={ref}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...props}
        >
          {children}
        </select>

        {/* Trigger */}
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          className={cn(
            "w-full h-9 rounded-lg border px-3 pr-8 text-sm font-medium text-foreground/90 outline-none transition-all duration-150 cursor-pointer flex items-center text-left select-none nb-select-trigger",
            open && "is-open",
            disabled && "cursor-not-allowed opacity-40"
          )}
        >
          <span className="truncate">{selectedLabel}</span>
        </button>

        {/* Chevron icon */}
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={cn(
            "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-2 w-2.5 text-foreground/40 transition-transform duration-150",
            open && "rotate-180"
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1.5l5 5 5-5" />
        </svg>

        {/* Dropdown via portal — escapes any stacking context */}
        {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
