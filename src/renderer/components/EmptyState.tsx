interface EmptyStateProps {
  text: string;
  variant?: "compact" | "roomy";
  showIcon?: boolean;
  className?: string;
}

export function EmptyState({
  text,
  variant = "compact",
  showIcon = false,
  className = "",
}: EmptyStateProps) {
  const spacing = variant === "roomy" ? "px-4 py-6 text-center text-sm" : "px-4 py-3";

  return (
    <div
      className={`rounded-md border border-dashed border-white/[0.08] bg-white/[0.02] ${spacing} text-lol-text/70 ${className}`}
    >
      {showIcon && (
        <span className="mr-2" aria-hidden="true">
          ⓘ
        </span>
      )}
      {text}
    </div>
  );
}
