import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "px-3 py-2 text-sm rounded-md transition",
        variant === "primary" &&
          "bg-white text-black hover:bg-neutral-200 font-semibold",
        variant === "ghost" &&
          "text-neutral-300 hover:bg-neutral-900 border border-neutral-800",
        props.disabled && "opacity-60 cursor-not-allowed",
        className
      )}
    />
  );
}
