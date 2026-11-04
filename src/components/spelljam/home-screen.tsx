import { Play } from "lucide-react";
import type { SpelljamData, Unit, WordItem } from "@/lib/spelljam/data";
import { starCount, unitStars } from "@/lib/spelljam/data";
import { activeSinger, setActiveSinger } from "@/lib/spelljam/store";
import { cn } from "@/lib/cn";
import { Shell, Stars } from "./ui";

function pickFeatured(data: SpelljamData): { unit: Unit; word: WordItem } | null {
  const singerId = data.activeSingerId;
  for (const unit of data.units) {
    for (const word of unit.words) {
      if (starCount(word, singerId) < 3) return { unit, word };
    }
  }
  for (const unit of data.units) {
    const word = unit.words[0];
    if (word) return { unit, word };
  }
  return null;
}

export function HomeScreen({
  data,
  onOpenUnit,
  onPlay,
  onParent,
}: {
  data: SpelljamData;
  onOpenUnit: (unitId: string) => void;
  onPlay: (unitId: string, wordId: string) => void;
  onParent: () => void;
}) {
  const singer = activeSinger(data);
  const featured = pickFeatured(data);

  return (
    <Shell>
      <header className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}art/mascot.jpg`}
          alt="Spelljam bird in headphones"
          className="size-16 shrink-0 rounded-full border border-line object-cover"
        />
        <div>
          <p className="text-sm font-extrabold tracking-wide text-teal">Spelljam</p>
          <h1 className="font-display text-3xl leading-none">Every word gets a song</h1>
        </div>
      </header>
      <p className="mt-3 text-pretty text-base font-semibold text-muted">
        The letters sing — P, A, R, T, Y — and that tune belongs to the word, so it sticks.
      </p>

      <p className="mt-6 text-sm font-extrabold tracking-wide text-muted">Who's playing?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {data.singers.map((item) => {
          const on = item.id === data.activeSingerId;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setActiveSinger(item.id)}
              className={cn(
                "rounded-full px-4 py-3 text-left",
                on ? "lift lift-teal bg-teal text-cream" : "border border-line bg-card text-ink",
              )}
            >
              <span className="block font-display text-lg leading-tight">{item.name}</span>
            </button>
          );
        })}
      </div>

      {featured ? (
        <button
          type="button"
          onClick={() => onPlay(featured.unit.id, featured.word.id)}
          className="stage-bg mt-6 w-full rounded-3xl p-5 text-left text-spot"
        >
          <span className="text-xs font-extrabold tracking-widest text-gold uppercase">Up next</span>
          <span className="mt-1 block font-display text-4xl leading-none">{featured.word.word}</span>
          {featured.word.meaning ? (
            <span className="mt-2 block text-sm font-semibold text-spot">{featured.word.meaning}</span>
          ) : null}
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 font-display text-base text-ink">
            <Play className="size-5 fill-ink" aria-hidden />
            Sing this word
          </span>
        </button>
      ) : (
        <div className="mt-6 rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl">No words yet</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            A grown-up can type the words from the school book.
          </p>
        </div>
      )}

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="font-display text-2xl">Units</h2>
        <p className="text-sm font-bold text-muted">{singer?.name}'s stars</p>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {data.units.map((unit) => {
          const score = unitStars(unit, data.activeSingerId);
          const done = score.max > 0 && score.got === score.max;
          return (
            <li key={unit.id}>
              <button
                type="button"
                onClick={() => onOpenUnit(unit.id)}
                className="flex w-full overflow-hidden rounded-3xl border border-line bg-card text-left"
              >
                <span className={cn("w-2 shrink-0", done ? "bg-gold" : "bg-teal")} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3">
                  <span className="font-display text-xl leading-tight">{unit.name}</span>
                  <span className="text-sm font-bold text-muted">
                    {unit.words.length} {unit.words.length === 1 ? "word" : "words"}
                    {score.max > 0 ? ` · ${score.got}/${score.max} stars` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-sm font-semibold text-muted">
        Lists stay on this device. Nothing is uploaded.
      </p>
      <button
        type="button"
        onClick={onParent}
        className="mx-auto mt-2 block rounded-full px-4 py-3 text-sm font-extrabold text-teal"
      >
        Grown-up shelf
      </button>
    </Shell>
  );
}
