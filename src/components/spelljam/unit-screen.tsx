import { Play } from "lucide-react";
import type { Unit } from "@/lib/spelljam/data";
import { starCount, unitStars } from "@/lib/spelljam/data";
import { BackButton, Shell, Stars } from "./ui";

export function UnitScreen({
  unit,
  singerId,
  onBack,
  onPlay,
}: {
  unit: Unit;
  singerId: string;
  onBack: () => void;
  onPlay: (wordId: string) => void;
}) {
  const score = unitStars(unit, singerId);

  return (
    <Shell>
      <BackButton onClick={onBack} label="Units" />
      <h1 className="mt-2 font-display text-4xl leading-none">{unit.name}</h1>
      <p className="mt-2 text-sm font-bold text-muted">
        {score.max > 0 ? `${score.got} of ${score.max} stars` : "No words in this unit yet"}
      </p>
      {unit.words.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-line bg-card p-5 text-base font-semibold text-muted">
          Ask a grown-up to add the words from this unit of the book.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {unit.words.map((word) => {
            const stars = starCount(word, singerId);
            return (
              <li key={word.id}>
                <button
                  type="button"
                  onClick={() => onPlay(word.id)}
                  className="flex w-full items-center gap-3 rounded-3xl border border-line bg-card px-3 py-3 text-left"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-teal text-cream">
                    <Play className="size-5 fill-cream" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-2xl leading-tight">{word.word}</span>
                    {word.meaning ? (
                      <span className="block truncate text-sm font-semibold text-muted">{word.meaning}</span>
                    ) : null}
                  </span>
                  <Stars n={stars} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
