import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "border border-neutral-900 rounded-2xl p-4 bg-black/40",
        className
      )}
    />
  );
}
