// src/components/CallStatusBadge.tsx

type CallStatus = "NEW" | "PROCESSING" | "DONE" | "ERROR" | "FAILED" | string;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NEW: {
    label: "В очереди",
    className: "bg-neutral-800/60 text-neutral-200 border-neutral-600/60",
  },
  PROCESSING: {
    label: "Анализируем",
    className: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  },
  DONE: {
    label: "Готово",
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  },
  ERROR: {
    label: "Ошибка",
    className: "bg-red-500/10 text-red-300 border-red-500/40",
  },
  FAILED: {
    label: "Ошибка",
    className: "bg-red-500/10 text-red-300 border-red-500/40",
  },
  UNKNOWN: {
    label: "Неизвестно",
    className: "bg-neutral-800/60 text-neutral-300 border-neutral-700/60",
  },
};

export function CallStatusBadge({ status }: { status: CallStatus }) {
  const key = typeof status === "string" ? status.toUpperCase() : "UNKNOWN";
  const cfg = STATUS_CONFIG[key] ?? STATUS_CONFIG.UNKNOWN;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] ${cfg.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 opacity-80" />
      {cfg.label}
    </span>
  );
}
