import { LoaderCircle } from "lucide-react";

import { cn } from "@/utils/cn";

export function Spinner({ className, label = "Đang tải" }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cn("h-5 w-5 animate-spin", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}
