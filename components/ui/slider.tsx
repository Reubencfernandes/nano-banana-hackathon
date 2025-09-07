import * as React from "react";
import { cn } from "../../lib/utils";

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueLabel?: string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, valueLabel, min = 0, max = 100, step = 1, ...props }, ref) => {
    return (
      <div className={cn("w-full", className)}>
        {(label || valueLabel) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{label}</span>
            <span>{valueLabel}</span>
          </div>
        )}
        <input
          ref={ref}
          type="range"
          min={min as number}
          max={max as number}
          step={step as number}
          className={cn(
            "w-full appearance-none h-2 rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary"
          )}
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

