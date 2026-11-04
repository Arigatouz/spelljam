import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import type { WordItem } from "@/lib/spelljam/data";
import { letterMidi, type StyleId } from "@/lib/spelljam/melody";
import { playBuzz, playFanfare, playNote, playSong, playWord, stopPlayback } from "@/lib/spelljam/audio";
import {
  getVoiceLoad,
  prepareVoice,
  subscribeVoiceLoad,
  voiceStatusText,
  warmClearVoice,
} from "@/lib/spelljam/kokoro";
import { recordQuiz } from "@/lib/spelljam/store";
import { makeBank, tokenize, type BankTile } from "@/lib/spelljam/words";
import { cn } from "@/lib/cn";
import { BackButton, Shell, Stars } from "./ui";

function earnedStars(mistakes: number, hinted: boolean) {
  if (hinted) return mistakes === 0 ? 2 : 1;
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

function cheer(stars: number) {
  if (stars >= 3) return "Three stars. That spelling will stick.";
  if (stars === 2) return "Two stars. A clean try gets the third.";
  return "One star. Hear the song, then spell it again.";
}

export function QuizScreen({
  unitId,
  word,
  singerId,
  style,
  voiceOn,
  musicOn,
  onBack,
  onAgain,
  onNext,
}: {
  unitId: string;
  word: WordItem;
  singerId: string;
  style: StyleId;
  voiceOn: boolean;
  musicOn: boolean;
  onBack: () => void;
  onAgain: () => void;
  onNext: (() => void) | null;
}) {
  const tokens = tokenize(word.word);
  const sung = tokens.filter((t) => t.say);
  const [salt] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [bank, setBank] = useState<BankTile[]>(() => makeBank(word.word, salt));
  const [picked, setPicked] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [shake, setShake] = useState(false);
  const [ghost, setGhost] = useState(-1);
  const [listening, setListening] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const saved = useRef(false);
  const alive = useRef(true);
  useSyncExternalStore(subscribeVoiceLoad, getVoiceLoad, getVoiceLoad);
  const voiceNote = voiceStatusText();

  useEffect(() => {
    warmClearVoice();
    prepareVoice(word.word);
  }, [word.word]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (stars !== null || listening) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        undo();
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        const ch = event.key.toUpperCase();
        const tile = bank.find((item) => !picked.includes(item.id) && item.ch === ch);
        if (tile) choose(tile);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function undo() {
    setPicked((prev) => prev.slice(0, -1));
  }

  function choose(tile: BankTile) {
    if (stars !== null || listening || picked.includes(tile.id)) return;
    const need = sung[picked.length];
    if (!need || tile.ch !== need.ch) {
      setMistakes((n) => n + 1);
      setShake(true);
      playBuzz();
      window.setTimeout(() => setShake(false), 360);
      return;
    }
    playNote(letterMidi(word.word, need.index));
    const next = [...picked, tile.id];
    setPicked(next);
    if (next.length === sung.length) {
      const got = earnedStars(mistakes, hinted);
      setStars(got);
      playFanfare(letterMidi(word.word, 0));
      if (!saved.current) {
        saved.current = true;
        recordQuiz(unitId, word.id, singerId, got);
      }
    }
  }

  function hearWord() {
    if (listening) return;
    playWord(word.word);
  }

  function hearSpelling() {
    setHinted(true);
    setPicked([]);
    setListening(true);
    setGhost(-1);
    playSong(word.word, style, { slow: true, voice: voiceOn, music: musicOn }, {
      onEvent: (ev) => {
        if (!alive.current) return;
        if (ev.role === "letter") setGhost(ev.letterIndex);
        if (ev.role === "word") setGhost(-1);
      },
      onEnd: () => {
        if (!alive.current) return;
        setListening(false);
        setGhost(-1);
      },
    });
  }

  const tileSize =
    sung.length > 10 ? "h-11 min-w-8 text-xl" : sung.length > 7 ? "h-12 min-w-10 text-2xl" : "h-14 min-w-12 text-3xl";

  return (
    <Shell stage>
      <BackButton onClick={onBack} light label="Song" />
      <p className="mt-4 text-center text-xs font-extrabold tracking-widest text-gold uppercase">
        Your turn
      </p>
      <h1 className="mt-1 text-center font-display text-3xl text-spot">
        {word.meaning ? word.meaning : "Spell what you hear"}
      </h1>

      <div className={cn("mt-6 flex flex-wrap items-end justify-center gap-2", shake && "shake")}>
        {tokens.map((token, i) => {
          if (!token.say) {
            return (
              <span key={`m-${i}`} className="pb-2 font-display text-3xl text-gold">
                {token.ch}
              </span>
            );
          }
          const place = sung.findIndex((s) => s.index === token.index);
          const fromPick = place >= 0 && place < picked.length;
          const fromGhost = listening && ghost === token.index;
          const show = fromPick || fromGhost || (stars !== null && place >= 0);
          return (
            <span
              key={token.index}
              className={cn(
                "inline-flex items-center justify-center rounded-2xl border-2 font-display",
                tileSize,
                show ? "border-gold bg-gold text-ink" : "border-dashed border-stage-glow bg-stage-2 text-spot",
              )}
            >
              {show ? token.ch : ""}
            </span>
          );
        })}
      </div>

      {stars !== null ? (
        <div className="mt-8 rounded-3xl bg-card p-5 text-center text-ink">
          <Stars n={stars} />
          <p className="mt-3 font-display text-2xl">{cheer(stars)}</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onAgain}
              className="lift lift-teal rounded-full bg-teal py-3 font-display text-lg text-cream"
            >
              Spell it again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-line py-3 font-extrabold"
            >
              Hear the song
            </button>
            {onNext ? (
              <button type="button" onClick={onNext} className="rounded-full py-3 font-extrabold text-teal">
                Next word
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {bank.map((tile) => {
              const used = picked.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={used || listening}
                  onClick={() => choose(tile)}
                  className={cn(
                    "lift lift-ink h-14 min-w-14 rounded-2xl px-3 font-display text-3xl",
                    used ? "bg-stage-2 text-transparent shadow-none" : "bg-card text-ink",
                  )}
                >
                  {tile.ch}
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={hearWord}
                disabled={listening}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stage-2 py-3 text-sm font-extrabold text-spot disabled:opacity-40"
              >
                <Volume2 className="size-4" aria-hidden />
                Hear it
              </button>
              <button
                type="button"
                onClick={undo}
                disabled={picked.length === 0 || listening}
                className="rounded-full bg-stage-2 py-3 text-sm font-extrabold text-spot disabled:opacity-40"
              >
                Oops
              </button>
            </div>
            <button
              type="button"
              onClick={hearSpelling}
              disabled={listening}
              className="rounded-full py-3 text-sm font-extrabold text-gold disabled:opacity-40"
            >
              {listening ? "Listening…" : "Stuck? Hear the spelling"}
            </button>
            {voiceNote ? <p className="text-center text-xs font-semibold text-muted">{voiceNote}</p> : null}
          </div>
        </>
      )}
    </Shell>
  );
}
