import { useEffect, useState } from "react";
import { findWord, useSpelljam, hydrate } from "@/lib/spelljam/store";
import { stopPlayback } from "@/lib/spelljam/audio";
import { HomeScreen } from "./home-screen";
import { ParentScreen } from "./parent-screen";
import { QuizScreen } from "./quiz-screen";
import { StageScreen } from "./stage-screen";
import { UnitScreen } from "./unit-screen";

type Screen =
  | { name: "home" }
  | { name: "unit"; unitId: string }
  | { name: "stage"; unitId: string; wordId: string }
  | { name: "quiz"; unitId: string; wordId: string; try: number }
  | { name: "parent" };

export function SpelljamApp() {
  const data = useSpelljam();
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    return () => stopPlayback();
  }, [screen]);

  if (screen.name === "parent") {
    return <ParentScreen data={data} onBack={() => setScreen({ name: "home" })} />;
  }

  if (screen.name === "unit") {
    const unit = data.units.find((item) => item.id === screen.unitId);
    if (!unit) return <Missing onHome={() => setScreen({ name: "home" })} />;
    return (
      <UnitScreen
        unit={unit}
        singerId={data.activeSingerId}
        onBack={() => setScreen({ name: "home" })}
        onPlay={(wordId) => setScreen({ name: "stage", unitId: unit.id, wordId })}
      />
    );
  }

  if (screen.name === "stage" || screen.name === "quiz") {
    const { unit, word } = findWord(data, screen.unitId, screen.wordId);
    if (!unit || !word) return <Missing onHome={() => setScreen({ name: "home" })} />;
    const index = unit.words.findIndex((item) => item.id === word.id);
    const prev = index > 0 ? unit.words[index - 1] : undefined;
    const next = index >= 0 && index < unit.words.length - 1 ? unit.words[index + 1] : undefined;
    const open = (wordId: string, mode: "stage" | "quiz") => {
      if (mode === "quiz") setScreen({ name: "quiz", unitId: unit.id, wordId, try: 0 });
      else setScreen({ name: "stage", unitId: unit.id, wordId });
    };

    if (screen.name === "quiz") {
      return (
        <QuizScreen
          key={`${word.id}-${screen.try}`}
          unitId={unit.id}
          word={word}
          singerId={data.activeSingerId}
          style={data.style}
          voiceOn={data.voiceOn}
          musicOn={data.musicOn}
          onBack={() => setScreen({ name: "stage", unitId: unit.id, wordId: word.id })}
          onAgain={() =>
            setScreen({ name: "quiz", unitId: unit.id, wordId: word.id, try: screen.try + 1 })
          }
          onNext={next ? () => open(next.id, "stage") : null}
        />
      );
    }

    return (
      <StageScreen
        key={word.id}
        unit={unit}
        word={word}
        wordIndex={index}
        wordCount={unit.words.length}
        singerId={data.activeSingerId}
        style={data.style}
        voiceOn={data.voiceOn}
        musicOn={data.musicOn}
        onBack={() => setScreen({ name: "unit", unitId: unit.id })}
        onQuiz={() => setScreen({ name: "quiz", unitId: unit.id, wordId: word.id, try: 0 })}
        onPrev={prev ? () => open(prev.id, "stage") : null}
        onNext={next ? () => open(next.id, "stage") : null}
      />
    );
  }

  return (
    <HomeScreen
      data={data}
      onOpenUnit={(unitId) => setScreen({ name: "unit", unitId })}
      onPlay={(unitId, wordId) => setScreen({ name: "stage", unitId, wordId })}
      onParent={() => setScreen({ name: "parent" })}
    />
  );
}

function Missing({ onHome }: { onHome: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center bg-cream px-6 text-ink">
      <h1 className="font-display text-3xl">That word is gone</h1>
      <button type="button" onClick={onHome} className="mt-4 font-extrabold text-teal">
        Back home
      </button>
    </main>
  );
}
