import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** URL-safe-ish random id; crypto.randomUUID is available in all target browsers. */
export function uid(): string {
  return crypto.randomUUID();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Groups timestamps into the buckets the sidebar renders as headings. */
export function relativeBucket(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (then.getTime() >= startOfToday) return "Today";
  if (then.getTime() >= startOfToday - day) return "Yesterday";
  if (then.getTime() >= startOfToday - day * 7) return "Previous 7 days";
  if (then.getTime() >= startOfToday - day * 30) return "Previous 30 days";
  return then.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
