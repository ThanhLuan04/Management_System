import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Gộp class Tailwind, class sau ghi đè class trước cùng loại (vd. "px-2" + "px-4" → "px-4"). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
