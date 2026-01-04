// src/components/Player.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { Pause, Play, Square, Repeat, Flag, Upload, Timer, ChevronLeft, ChevronRight, Volume2, Gauge } from "lucide-react";
import Waveform from "@/components/Waveform";
import BookmarkPanel from "@/components/BookmarkPanel";
import { usePlayerStore } from "@/store/playerStore";
import { fmtTime, clamp } from "@/lib/time";

export default function Player() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ws = usePlayerStore((s) => s.ws);

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const fileName = usePlayerStore((s) => s.fileName);

  const isReady = usePlayerStore((s) => s.isReady);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

  // ✅ Zoom
  const zoomPps = usePlayerStore((s) => s.zoomPps);
  const setZoomPps = usePlayerStore((s) => s.setZoomPps);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);
  const autoPauseMs = usePlayerStore((s) => s.autoPauseMs);
  const repeatTarget = usePlayerStore((s) => s.repeatTarget);
  const repeatCount = usePlayerStore((s) => s.repeatCount);

  const preRollSec = usePlayerStore((s) => s.preRollSec);
  const fadeMs = usePlayerStore((s) => s.fadeMs);
  const setPreRollSec = usePlayerStore((s) => s.setPreRollSec);
  const setFadeMs = usePlayerStore((s) => s.setFadeMs);

  const bookmarks = usePlayerStore((s) => s.bookmarks);

  const setSource = usePlayerStore((s) => s.setSource);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const playPause = usePlayerStore((s) => s.playPause);
  const stop = usePlayerStore((s) => s.stop);
  const setTime = usePlayerStore((s) => s.setTime);
  const seekBy = usePlayerStore((s) => s.seekBy);

  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setAutoPauseMs = usePlayerStore((s) => s.setAutoPauseMs);
  const setRepeatTarget = usePlayerStore((s) => s.setRepeatTarget);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  const upsertRecent = usePlayerStore((s) => s.upsertRecent);
  const updateRecentTime = usePlayerStore((s) => s.updateRecentTime);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setSource({ audioUrl: url, fileName: f.name });
    upsertRecent({ fileName: f.name, audioUrl: url, lastTime: 0 });
  };

  const loopLabel = useMemo(() => {
    if (loopA == null && loopB == null) return "A/B 미설정";
    if (loopA != null && loopB == null) return `A: ${fmtTime(loopA)} (B 미설정)`;
    if (loopA == null && loopB != null) return `B: ${fmtTime(loopB)} (A 미설정)`;
    const a = Math.min(loopA!, loopB!);
    const b = Math.max(loopA!, loopB!);
    return `${fmtTime(a)} → ${fmtTime(b)} (${fmtTime(b - a)})`;
  }, [loopA, loopB]);

  const canLoop = loopA != null && loopB != null && Math.abs(loopB - loopA) > 0.05;

  const phrases = useMemo(() => {
    return bookmarks
      .filter((b) => b.type === "REGION" && typeof b.start === "number" && typeof b.end === "number" && b.end > b.start)
      .map((b) => ({ id: b.id, start: b.start!, end: b.end!, label: b.label, tag: b.tag }))
      .sort((a, b) => a.start - b.start);
  }, [bookmarks]);

  const goPrevPhrase = () => {
    if (!phrases.length) return;
    const t = currentTime;
    const prev = [...phrases].reverse().find((p) => p.start < t - 0.05) ?? phrases[phrases.length - 1];
    setLoopA(prev.start);
    setLoopB(prev.end);
    setLoopEnabled(true);
    resetRepeatCount();
    setTime(prev.start);
  };

  const goNextPhrase = () => {
    if (!phrases.length) return;
    const t = currentTime;
    const next = phrases.find((p) => p.start > t + 0.05) ?? phrases[0];
    setLoopA(next.start);
    setLoopB(next.end);
    setLoopEnabled(true);
    resetRepeatCount();
    setTime(next.start);
  };

  useEffect(() => {
    if (!audioUrl) return;
    const id = window.setInterval(() => updateRecentTime(audioUrl, currentTime), 5000);
    return () => window.clearInterval(id);
  }, [audioUrl, currentTime, updateRecentTime]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as any)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea" || (ev.target as any)?.isContentEditable) return;

      // Zoom shortcuts: Ctrl/⌘ + (+/-/0)
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "+" || ev.key === "=")) {
        ev.preventDefault();
        setZoomPps(zoomPps + 20);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "-") {
        ev.preventDefault();
        setZoomPps(zoomPps - 20);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "0") {
        ev.preventDefault();
        setZoomPps(80);
        return;
      }

      if (ev.code === "Space") {
        ev.preventDefault();
        if (!audioUrl) return;
        playPause();
        return;
      }

      if (ev.code === "ArrowLeft") {
        ev.preventDefault();
        seekBy(ev.shiftKey ? -10 : -3);
        return;
      }
      if (ev.code === "ArrowRight") {
        ev.preventDefault();
        seekBy(ev.shiftKey ? 10 : 3);
        return;
      }

      if (ev.code === "KeyA") {
        setLoopA(currentTime);
        resetRepeatCount();
        return;
      }
      if (ev.code === "KeyB") {
        setLoopB(currentTime);
        resetRepeatCount();
        setLoopEnabled(true);
        return;
      }
      if (ev.code === "KeyL") {
        setLoopEnabled(!loopEnabled);
        resetRepeatCount();
        return;
      }

      if (ev.code === "ArrowUp") {
        ev.preventDefault();
        setPlaybackRate(clamp(Number((playbackRate + 0.05).toFixed(2)), 0.5, 2));
        return;
      }
      if (ev.code === "ArrowDown") {
        ev.preventDefault();
        setPlaybackRate(clamp(Number((playbackRate - 0.05).toFixed(2)), 0.5, 2));
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    audioUrl,
    currentTime,
    loopEnabled,
    playbackRate,
    playPause,
    seekBy,
    setLoopA,
    setLoopB,
    setLoopEnabled,
    resetRepeatCount,
    setPlaybackRate,
    zoomPps,
    setZoomPps,
  ]);

  const controlsDisabled = !audioUrl || !ws;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Repeat Player</h1>
        <p className="mt-2 text-sm text-zinc-600">Zoom + Ctrl/⌘+휠 줌으로 긴 오디오도 정밀하게 A–B 구간을 설정할 수 있어요.</p>
      </header>

      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">현재 파일</div>
            <div className="truncate text-base font-medium text-zinc-900">{fileName ?? "오디오 파일을 선택해 주세요"}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {fmtTime(currentTime)} / {fmtTime(duration)} {audioUrl && !isReady ? "(로딩 중…)" : ""}
            </div>
          </div>

          {/* 상단: 파일 불러오기 */}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileChange} />
            <button
              onClick={onPickFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
              <Upload className="h-4 w-4" />
              오디오 불러오기
            </button>
          </div>
        </div>

        {/* ✅ Zoom */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Wave Zoom</div>
              <div className="mt-1 text-xs text-zinc-500">
                <b>Ctrl/⌘ + 휠</b>로도 줌이 됩니다. (⌘/Ctrl +/−/0 단축키 지원)
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomPps(zoomPps - 20)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
                disabled={!ws}>
                −
              </button>

              <div className="min-w-[80px] text-center text-sm font-medium text-zinc-900">{zoomPps} pps</div>

              <button
                onClick={() => setZoomPps(zoomPps + 20)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
                disabled={!ws}>
                +
              </button>

              <button
                onClick={() => setZoomPps(80)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                disabled={!ws}
                title="Ctrl/⌘ + 0">
                Reset
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="w-10 text-xs text-zinc-500">20</span>
            <input
              type="range"
              min={20}
              max={800}
              step={10}
              value={zoomPps}
              onChange={(e) => setZoomPps(Number(e.target.value))}
              className="w-full"
              disabled={!ws}
            />
            <span className="w-10 text-right text-xs text-zinc-500">800</span>
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-5">
          <Waveform />
        </div>

        {/* ✅ Transport(재생 버튼 있는 부분 전체) => 파형 바로 아래로 이동 */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={playPause}
              disabled={controlsDisabled}
              className={clsx(
                "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium shadow-sm",
                controlsDisabled ? "cursor-not-allowed bg-zinc-900/50 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800",
              )}
              title="Space">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "일시정지" : "재생"}
            </button>

            <button
              onClick={stop}
              disabled={controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Square className="h-4 w-4" />
              Stop
            </button>

            <div className="h-8 w-px bg-zinc-200" />

            <button
              onClick={() => seekBy(-3)}
              disabled={controlsDisabled}
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              ← 3s
            </button>
            <button
              onClick={() => seekBy(3)}
              disabled={controlsDisabled}
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              3s →
            </button>

            <div className="h-8 w-px bg-zinc-200" />

            <button
              onClick={goPrevPhrase}
              disabled={!phrases.length || controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              <ChevronLeft className="h-4 w-4" /> 이전 Phrase
            </button>

            <button
              onClick={goNextPhrase}
              disabled={!phrases.length || controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
              다음 Phrase <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Volume2 className="h-4 w-4" />
                <span className="w-10 text-right">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-40"
                disabled={!ws}
              />
            </div>
          </div>

          <div className="mt-2 text-[11px] text-zinc-500">
            탐색은 <b>Overview</b> 또는 <b>파형 드래그(좌클릭)</b>로 하세요. (Space: 재생/일시정지)
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* A-B */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">A–B 구간반복</div>
                <div className="mt-1 text-xs text-zinc-500">{loopLabel}</div>
              </div>

              <button
                onClick={() => {
                  if (!canLoop) return;
                  setLoopEnabled(!loopEnabled);
                  resetRepeatCount();
                }}
                disabled={!canLoop}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium shadow-sm",
                  canLoop
                    ? loopEnabled
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                    : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-400",
                )}
                title="KeyL">
                <Repeat className="h-4 w-4" />
                {loopEnabled ? "반복 ON" : "반복 OFF"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setLoopA(currentTime);
                  resetRepeatCount();
                }}
                disabled={!audioUrl}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="KeyA">
                <Flag className="h-4 w-4" /> A 지정
              </button>

              <button
                onClick={() => {
                  setLoopB(currentTime);
                  resetRepeatCount();
                  setLoopEnabled(true);
                }}
                disabled={!audioUrl}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="KeyB">
                <Flag className="h-4 w-4" /> B 지정
              </button>

              <button
                onClick={() => {
                  setLoopA(null);
                  setLoopB(null);
                  setLoopEnabled(false);
                  resetRepeatCount();
                }}
                className="rounded-2xl px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
                초기화
              </button>

              <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-2 py-1">반복: {repeatCount}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                  <Timer className="h-4 w-4" /> Auto Pause (ms)
                </div>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={autoPauseMs}
                  onChange={(e) => setAutoPauseMs(clamp(Number(e.target.value || 0), 0, 2000))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>

              <label className="block">
                <div className="text-xs font-medium text-zinc-600">Repeat Limit</div>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={repeatTarget}
                  onChange={(e) => setRepeatTarget(clamp(Number(e.target.value || 0), 0, 999))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>

              <label className="block">
                <div className="text-xs font-medium text-zinc-600">Pre-roll (sec)</div>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={preRollSec}
                  onChange={(e) => setPreRollSec(Number(e.target.value || 0))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <div className="mt-1 text-[11px] text-zinc-500">0.10~0.25 추천</div>
              </label>

              <label className="block">
                <div className="text-xs font-medium text-zinc-600">Fade (ms)</div>
                <input
                  type="number"
                  min={0}
                  max={800}
                  step={10}
                  value={fadeMs}
                  onChange={(e) => setFadeMs(Number(e.target.value || 0))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <div className="mt-1 text-[11px] text-zinc-500">80~180ms 추천</div>
              </label>
            </div>
          </div>

          {/* Speed */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-900">재생 속도</div>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Gauge className="h-4 w-4" />
                <span className="font-medium text-zinc-900">{playbackRate.toFixed(2)}x</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>0.5x</span>
              <span>2.0x</span>
            </div>

            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              className="mt-2 w-full"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((v) => (
                <button
                  key={v}
                  onClick={() => setPlaybackRate(v)}
                  className={clsx(
                    "rounded-2xl border px-3 py-2 text-sm font-medium shadow-sm",
                    Math.abs(playbackRate - v) < 0.001
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                  )}>
                  {v}x
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-600">
              <div className="font-medium text-zinc-800">단축키</div>
              <ul className="mt-2 list-disc pl-5">
                <li>
                  <b>Space</b>: 재생/일시정지
                </li>
                <li>
                  <b>←/→</b>: 3초 이동, <b>Shift+←/→</b>: 10초 이동
                </li>
                <li>
                  <b>A</b>: A 지정, <b>B</b>: B 지정, <b>L</b>: 반복 토글
                </li>
                <li>
                  <b>↑/↓</b>: 속도 ±0.05
                </li>
                <li>
                  <b>Ctrl/⌘ + 휠</b>: 줌, <b>Ctrl/⌘ +/−/0</b>: 줌 조절/리셋
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bookmark */}
        <div className="mt-6">
          <BookmarkPanel />
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-500">Repeat Player v3 — Zoom + Ctrl/⌘+Wheel Zoom</footer>
    </div>
  );
}
