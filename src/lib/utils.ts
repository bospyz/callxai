export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === "string") {
      return JSON.parse(value) as T;
    }
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

// tailwind-утилита для склейки классов
export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}
