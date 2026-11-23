"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Speech out: browser speechSynthesis, a different voice per agent ----------

const VOICE_STYLE: Record<string, { pitch: number; rate: number; prefer: RegExp[] }> = {
  cfo: { pitch: 0.85, rate: 1.0, prefer: [/Daniel|Alex|Fred|Google UK English Male|Aaron|Arthur/i] },
  tech: { pitch: 1.05, rate: 1.08, prefer: [/Samantha|Google US English|Evan|Nathan|Tom/i] },
  procurement: { pitch: 1.2, rate: 0.98, prefer: [/Karen|Moira|Tessa|Victoria|Google UK English Female|Serena|Kate/i] },
  analyst: { pitch: 1.0, rate: 1.1, prefer: [/Fiona|Veena|Rishi/i] },
};

function englishVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

function voiceFor(agent: string): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  if (!voices.length) return undefined;
  const style = VOICE_STYLE[agent];
  for (const re of style?.prefer ?? []) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  const order = ["cfo", "tech", "procurement", "analyst"];
  return voices[Math.max(0, order.indexOf(agent)) % voices.length];
}

export function speak(text: string, agent: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const style = VOICE_STYLE[agent] ?? { pitch: 1, rate: 1 };
  const v = voiceFor(agent);
  if (v) u.voice = v;
  u.pitch = style.pitch;
  u.rate = style.rate;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  u.onend = finish;
  u.onerror = finish;
  // Safety net: some browsers never fire onend.
  setTimeout(finish, Math.max(2500, text.length * 85));
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

// ---------- Speech in: Web Speech API, push to talk (hold space) ----------

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Hold space to talk. Releasing space sends the transcript to `onFinal`.
 * Ignored while typing in an input so the text box still works.
 */
export function usePushToTalk(onFinal: (text: string) => void, enabled: boolean) {
  const [supported] = useState(() => !!makeRecognition());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const text = useRef("");
  const holding = useRef(false);
  const cb = useRef(onFinal);
  useEffect(() => {
    cb.current = onFinal;
  }, [onFinal]);

  const start = useCallback(() => {
    if (holding.current) return;
    const r = makeRecognition();
    if (!r) return;
    holding.current = true;
    text.current = "";
    setInterim("");
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      text.current = (finalText + " " + interimText).trim();
      setInterim(text.current);
    };
    r.onerror = () => {};
    r.onend = () => {
      setListening(false);
      const said = (text.current || "").trim();
      holding.current = false;
      if (said) cb.current(said);
      setInterim("");
    };
    rec.current = r;
    stopSpeaking();
    r.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    if (!holding.current) return;
    // Keep interim words: promote them to final on release.
    rec.current?.stop();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target) || e.repeat) return;
      e.preventDefault();
      start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, start, stop]);

  return { supported, listening, interim, start, stop };
}
