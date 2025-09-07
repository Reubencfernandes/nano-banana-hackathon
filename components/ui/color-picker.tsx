import * as React from "react";
import { cn } from "../../lib/utils";

export interface ColorPickerProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="color"
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background p-1 shadow-sm cursor-pointer",
          className
        )}
        {...props}
      />
    );
  }
);
ColorPicker.displayName = "ColorPicker";

