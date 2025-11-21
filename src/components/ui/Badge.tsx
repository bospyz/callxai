import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-neutral-900 text-neutral-400",
        className
      )}
    />
  );
}
