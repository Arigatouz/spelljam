import type { ReactNode } from "react";
import { ChevronLeft, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { STYLES, type StyleId } from "@/lib/spelljam/melody";

export function Shell({
  children,
  stage = false,
}: {
  children: ReactNode;
  stage?: boolean;
}) {
  return (
    <div className={cn("min-h-dvh", stage ? "stage-bg text-spot" : "bg-cream text-ink")}>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-5 pb-10">
        {children}
      </div>
    </div>
  );
}

export function BackButton({
  onClick,
  light = false,
  label = "Back",
}: {
  onClick: () => void;
  light?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full py-2 pr-3 pl-1 text-sm font-extrabold",
        light ? "text-spot" : "text-ink",
      )}
    >
      <ChevronLeft className="size-5" aria-hidden />
      {label}
    </button>
  );
}

export function Stars({ n, onStage = false }: { n: number; onStage?: boolean }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < n ? "fill-gold text-gold" : onStage ? "text-stage-glow" : "text-line",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function StylePicker({
  value,
  onChange,
  onStage = false,
}: {
  value: StyleId;
  onChange: (id: StyleId) => void;
  onStage?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Song style">
      {STYLES.map((style) => {
        const on = value === style.id;
        return (
          <button
            key={style.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(style.id)}
            className={cn(
              "rounded-full px-3 py-2 text-sm font-extrabold",
              on
                ? "bg-gold text-ink"
                : onStage
                  ? "bg-stage-2 text-spot"
                  : "border border-line bg-card text-ink",
            )}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  on,
  onClick,
  children,
  onStage = false,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  onStage?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-2 text-sm font-extrabold",
        on ? "bg-teal text-cream" : onStage ? "bg-stage-2 text-spot" : "border border-line bg-card text-ink",
      )}
    >
      {children}
    </button>
  );
}
