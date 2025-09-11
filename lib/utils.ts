/**
 * UTILITY FUNCTIONS
 * 
 * Common utility functions used throughout the application.
 * Currently contains the `cn` function for combining CSS class names intelligently.
 */

import { clsx, type ClassValue } from "clsx"      // Utility for conditional class names
import { twMerge } from "tailwind-merge"          // Utility for merging Tailwind classes

/**
 * Combine and merge CSS class names intelligently
 * 
 * This function combines the power of two popular utilities:
 * - `clsx`: Handles conditional class names and various input types
 * - `twMerge`: Intelligently merges Tailwind CSS classes, resolving conflicts
 * 
 * Key benefits:
 * - Handles conditional classes: cn("base", condition && "conditional")
 * - Resolves Tailwind conflicts: cn("p-4", "p-2") → "p-2" (last one wins)
 * - Removes duplicates and undefined values
 * - Supports arrays, objects, and mixed types
 * 
 * @param inputs Variable number of class values (strings, objects, arrays, etc.)
 * @returns Single string with merged and optimized class names
 * 
 * @example
 * cn("btn", "btn-primary", isActive && "active")
 * cn("p-4 m-2", { "bg-red-500": hasError, "bg-green-500": isSuccess })
 * cn(["base-class", "modifier"], conditionalClass)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
