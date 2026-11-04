import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import type { Unit, WordItem } from "@/lib/spelljam/data";
import type { StyleId } from "@/lib/spelljam/melody";
import { playSong, stopPlayback } from "@/lib/spelljam/audio";
import {
  getVoiceLoad,
  prepareSpokenWord,
  subscribeVoiceLoad,
  warmClearVoice,
} from "@/lib/spelljam/kokoro";
import { recordSong, setMusicOn, setStyle, setVoiceOn } from "@/lib/spelljam/store";
import { tokenize } from "@/lib/spelljam/words";
import { cn } from "@/lib/cn";
import { BackButton, Shell, StylePicker, Toggle } from "./ui";

export function StageScreen({
  unit,
  word,
  wordIndex,
  wordCount,
  singerId,
  style,
  voiceOn,
  musicOn,
  onBack,
  onQuiz,
  onPrev,
  onNext,
}: {
  unit: Unit;
  word: WordItem;
  wordIndex: number;
  wordCount: number;
  singerId: string;
  style: StyleId;
  voiceOn: boolean;
  musicOn: boolean;
  onBack: () => void;
  onQuiz: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const tokens = tokenize(word.word);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [caption, setCaption] = useState("Sing every letter out loud");
  const [hot, setHot] = useState(-1);
  const [nonce, setNonce] = useState(0);
  const [wordHot, setWordHot] = useState(false);
  const alive = useRef(true);
  const finished = useRef(false);
  const voiceLoad = useSyncExternalStore(subscribeVoiceLoad, getVoiceLoad, getVoiceLoad);

  useEffect(() => {
    warmClearVoice();
    prepareSpokenWord(word.word);
  }, [word.word]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopPlayback();
    };
  }, []);

  function start() {
    finished.current = false;
    setPlaying(true);
    setCaption(slow ? "Slow and clear" : "Find the beat");
    playSong(word.word, style, { slow, voice: voiceOn, music: musicOn }, {
      onEvent: (ev) => {
        if (!alive.current) return;
        if (ev.role === "count") {
          setHot(-1);
          setWordHot(false);
          setCaption("Ready");
        } else if (ev.role === "letter") {
          setWordHot(false);
          setHot(ev.letterIndex);
          setNonce((n) => n + 1);
          setCaption(ev.say && ev.say.length > 1 ? ev.say : "Sing it");
        } else if (ev.role === "word") {
          setHot(-1);
          setWordHot(true);
          setCaption("The whole word");
        }
      },
      onEnd: () => {
        if (!alive.current) return;
        setPlaying(false);
        setHot(-1);
        setWordHot(false);
        setCaption("Your turn to spell it");
        if (!finished.current) {
          finished.current = true;
          recordSong(unit.id, word.id, singerId);
        }
      },
    });
  }

  function stop() {
    stopPlayback();
    setPlaying(false);
    setHot(-1);
    setWordHot(false);
    setCaption("Stopped");
  }

  function pickStyle(next: StyleId) {
    setStyle(next);
    if (playing) {
      stopPlayback();
      setPlaying(false);
    }
  }

  const sungCount = tokens.filter((t) => t.say).length;
  const tile =
    sungCount > 12
      ? "h-10 min-w-8 px-1 text-lg"
      : sungCount > 8
        ? "h-12 min-w-9 px-1 text-2xl"
        : "h-16 min-w-12 px-1.5 text-4xl";

  return (
    <Shell stage>
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} light label={unit.name} />
        <p className="text-sm font-extrabold text-gold tabular-nums">
          {wordIndex + 1}/{wordCount}
        </p>
      </div>

      <p className="mt-4 text-center text-xs font-extrabold tracking-widest text-gold uppercase">
        Now singing
      </p>
      <h1
        className={cn(
          "mt-1 text-center font-display text-5xl leading-none text-spot",
          wordHot && "hop text-gold",
        )}
      >
        {word.word}
      </h1>
      {word.meaning ? (
        <p className="mt-2 text-center text-sm font-semibold text-spot">{word.meaning}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-end justify-center gap-2" aria-label="Spelling">
        {tokens.map((token, i) =>
          token.say ? (
            <span
              key={`${token.index}-${i}`}
              className={cn(
                "inline-flex items-center justify-center rounded-2xl font-display",
                tile,
                hot === token.index ? "hop bg-gold text-ink" : "bg-stage-2 text-spot",
              )}
              data-nonce={hot === token.index ? nonce : undefined}
            >
              {token.ch}
            </span>
          ) : (
            <span key={`m-${i}`} className="pb-2 font-display text-3xl text-gold">
              {token.ch}
            </span>
          ),
        )}
      </div>
      <p className="mt-3 h-6 text-center text-sm font-extrabold text-gold" aria-live="polite">
        {caption}
      </p>
      {voiceLoad.state === "loading" ? (
        <p className="text-center text-xs font-semibold text-spot">
          Getting a clearer voice
          {voiceLoad.progress > 0 ? ` ${Math.round(voiceLoad.progress)}%` : "…"}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col items-center gap-4 pt-6">
        <StylePicker value={style} onChange={pickStyle} onStage />
        <button
          type="button"
          onClick={playing ? stop : start}
          className="lift lift-gold flex size-20 items-center justify-center rounded-full bg-gold text-ink"
          aria-label={playing ? "Stop the song" : "Play the song"}
        >
          {playing ? <Pause className="size-8 fill-ink" /> : <Play className="size-8 fill-ink" />}
        </button>
        <div className="flex flex-wrap justify-center gap-2">
          <Toggle on={slow} onClick={() => setSlow((v) => !v)} onStage>
            Slower
          </Toggle>
          <Toggle on={voiceOn} onClick={() => setVoiceOn(!voiceOn)} onStage>
            Voice
          </Toggle>
          <Toggle on={musicOn} onClick={() => setMusicOn(!musicOn)} onStage>
            Band
          </Toggle>
        </div>
        <p className="text-center text-xs font-semibold text-spot">
          Same word, same tune — the style only changes the band.
        </p>
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!onPrev}
            onClick={onPrev ?? undefined}
            className="rounded-full bg-stage-2 py-3 text-sm font-extrabold text-spot disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!onNext}
            onClick={onNext ?? undefined}
            className="rounded-full bg-stage-2 py-3 text-sm font-extrabold text-spot disabled:opacity-40"
          >
            Next
          </button>
        </div>
        <button
          type="button"
          onClick={onQuiz}
          className="lift lift-gold w-full rounded-full bg-gold py-4 font-display text-xl text-ink"
        >
          Your turn
        </button>
      </div>
    </Shell>
  );
}
