// src/components/Recorder.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Mic, Square, Play, Pause, Trash2 } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";

type Phase = "idle" | "recording" | "ready" | "playing";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const urlRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      stopStream();
      revokeUrl();
    };
  }, [stopTimer, stopStream, revokeUrl]);

  const startRecording = useCallback(async () => {
    if (phase === "recording") return;

    usePlayerStore.getState().pause();

    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopTimer();
        const finalMs = performance.now() - startedAtRef.current;
        const blobType = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];

        revokeUrl();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setRecordingUrl(url);
        setDurationSec(finalMs / 1000);
        setPhase("ready");
        stopStream();
      };

      revokeUrl();
      setRecordingUrl(null);
      setDurationSec(0);
      setElapsedMs(0);

      recorder.start();
      startedAtRef.current = performance.now();
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - startedAtRef.current);
      }, 200);
      setPhase("recording");
    } catch (err) {
      console.error("녹음 시작 실패", err);
      stopStream();
      alert("마이크에 접근할 수 없습니다. 브라우저 권한을 확인해 주세요.");
    }
  }, [phase, revokeUrl, stopStream, stopTimer]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    try {
      rec.stop();
    } catch (err) {
      console.error("녹음 중지 실패", err);
    }
  }, []);

  const playRecording = useCallback(() => {
    const el = audioRef.current;
    if (!el || !recordingUrl) return;
    usePlayerStore.getState().pause();
    el.play()
      .then(() => setPhase("playing"))
      .catch((err) => console.error("녹음본 재생 실패", err));
  }, [recordingUrl]);

  const pauseRecording = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const clearRecording = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    revokeUrl();
    setRecordingUrl(null);
    setDurationSec(0);
    setElapsedMs(0);
    setPhase("idle");
  }, [revokeUrl]);

  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="inline-flex items-center gap-2">
      {phase === "idle" && (
        <button onClick={startRecording} className={btnBase} title="녹음 시작" aria-label="녹음 시작">
          <Mic className="h-4 w-4" />
        </button>
      )}

      {phase === "recording" && (
        <>
          <button
            onClick={stopRecording}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
            title="녹음 중지"
            aria-label="녹음 중지">
            <Square className="h-4 w-4 fill-white" />
          </button>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {fmtElapsed(elapsedMs)}
          </span>
        </>
      )}

      {(phase === "ready" || phase === "playing") && (
        <>
          <button onClick={startRecording} className={btnBase} title="다시 녹음" aria-label="다시 녹음">
            <Mic className="h-4 w-4" />
          </button>
          <button
            onClick={phase === "playing" ? pauseRecording : playRecording}
            className={btnBase}
            title={phase === "playing" ? "녹음본 일시정지" : "녹음본 재생"}
            aria-label={phase === "playing" ? "녹음본 일시정지" : "녹음본 재생"}>
            {phase === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="text-xs text-zinc-500 tabular-nums">{fmtElapsed(durationSec * 1000)}</span>

          <button onClick={clearRecording} className={clsx(btnBase, "px-2")} title="녹음본 삭제" aria-label="녹음본 삭제">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}

      <audio
        ref={audioRef}
        src={recordingUrl ?? undefined}
        onEnded={() => setPhase("ready")}
        onPause={() => setPhase((p) => (p === "playing" ? "ready" : p))}
        className="hidden"
      />
    </div>
  );
}
