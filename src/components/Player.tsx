// src/components/Player.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Pause,
  Play,
  Flag,
  Upload,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Gauge,
  RotateCcw,
  ArrowLeftToLine,
  ArrowRightFromLine,
  Download,
} from "lucide-react";
import Link from "next/link";
import Waveform from "@/components/Waveform";
import MediaView from "@/components/MediaView";
import BookmarkPanel from "@/components/BookmarkPanel";
import Recorder from "@/components/Recorder";
import { usePlayerStore } from "@/store/playerStore";
import { fmtTime, clamp } from "@/lib/time";
import { extractRegionToWav } from "@/lib/audioExport";
import { BsRepeat, BsRepeat1 } from "react-icons/bs";
import { TbRepeatOff } from "react-icons/tb";

export default function Player() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const ws = usePlayerStore((s) => s.ws);

  const mediaUrl = usePlayerStore((s) => s.mediaUrl);
  const mediaKind = usePlayerStore((s) => s.mediaKind);
  const showVideo = usePlayerStore((s) => s.showVideo);
  const setShowVideo = usePlayerStore((s) => s.setShowVideo);
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
  const repeatTarget = usePlayerStore((s) => s.repeatTarget);
  const repeatCount = usePlayerStore((s) => s.repeatCount);

  const bookmarks = usePlayerStore((s) => s.bookmarks);

  const setSource = usePlayerStore((s) => s.setSource);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const playPause = usePlayerStore((s) => s.playPause);
  const play = usePlayerStore((s) => s.play);
  const stop = usePlayerStore((s) => s.stop);
  const setTime = usePlayerStore((s) => s.setTime);
  const seekBy = usePlayerStore((s) => s.seekBy);

  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setRepeatTarget = usePlayerStore((s) => s.setRepeatTarget);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  const upsertRecent = usePlayerStore((s) => s.upsertRecent);
  const updateRecentTime = usePlayerStore((s) => s.updateRecentTime);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // ✅ 이전 ObjectURL 정리(메모리 누수 방지)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;

    const kind = f.type?.startsWith("video/") ? "video" : "audio";

    setSource({ mediaUrl: url, mediaKind: kind, fileName: f.name });
    upsertRecent({ fileName: f.name, mediaUrl: url, mediaKind: kind, lastTime: 0 });

    // ✅ iOS/Safari에서 metadata 로딩 트리거가 필요한 경우를 대비
    if (mediaRef.current) {
      try {
        mediaRef.current.src = url;
        mediaRef.current.load();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

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

  const controlsDisabled = !mediaUrl || !ws;

  // ✅ 선택 구간(A–B)을 WAV로 추출
  const [extracting, setExtracting] = useState(false);
  const extractRegion = useCallback(async () => {
    if (!mediaUrl || !canLoop || extracting) return;
    const a = Math.min(loopA!, loopB!);
    const b = Math.max(loopA!, loopB!);
    setExtracting(true);
    try {
      await extractRegionToWav(mediaUrl, a, b, fileName);
    } catch (e) {
      console.error(e);
      alert("구간 추출에 실패했습니다.");
    } finally {
      setExtracting(false);
    }
  }, [mediaUrl, canLoop, extracting, loopA, loopB, fileName]);

  // ✅ A(-3s) 버튼 동작:
  // 1) A/B 미설정이면: -3초 seek
  // 2) A/B 설정이면: A 지점부터 재생(구간 유지)
  const playFromA = useCallback(() => {
    if (!canLoop) {
      if (controlsDisabled) return;
      seekBy(-3);
      return;
    }

    const aRaw = Math.min(loopA!, loopB!);
    const a = duration > 0 ? Math.min(aRaw, Math.max(0, duration - 0.01)) : aRaw;

    setTime(a);
    play();
  }, [canLoop, controlsDisabled, seekBy, loopA, loopB, duration, setTime, play]);

  // ✅ B(+3s) 버튼 동작:
  // 1) A/B 미설정이면: +3초 seek
  // 2) A/B 설정이면: (기존) 구간 해제 + B 지점부터 재생
  const playFromBAndClearLoop = useCallback(() => {
    if (!canLoop) {
      if (controlsDisabled) return;
      seekBy(3);
      return;
    }

    const bRaw = Math.max(loopA!, loopB!);
    const b = duration > 0 ? Math.min(bRaw, Math.max(0, duration - 0.01)) : bRaw;

    // 중요: 먼저 A/B를 해제해야(스토어 기준) Waveform의 one-shot/loop 로직이 개입하지 않음
    setLoopEnabled(false);
    setLoopA(null);
    setLoopB(null);
    resetRepeatCount();

    setTime(b);
    play();
  }, [canLoop, controlsDisabled, seekBy, loopA, loopB, duration, setLoopEnabled, setLoopA, setLoopB, resetRepeatCount, setTime, play]);

  useEffect(() => {
    if (!mediaUrl) return;
    const id = window.setInterval(() => updateRecentTime(mediaUrl, currentTime), 5000);
    return () => window.clearInterval(id);
  }, [mediaUrl, currentTime, updateRecentTime]);

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
        if (!mediaUrl) return;
        playPause();
        return;
      }

      // ✅ ← : playFromA 버튼과 동일 동작 (-3s / A부터 재생)
      // ✅ Shift+← : -10s 유지
      if (ev.code === "ArrowLeft") {
        ev.preventDefault();
        if (ev.shiftKey) {
          seekBy(-10);
          return;
        }
        playFromA();
        return;
      }

      // ✅ → : playFromB 버튼과 동일 동작 (+3s / (AB 있으면) 구간해제 + B부터)
      // ✅ Shift+→ : +10s 유지
      if (ev.code === "ArrowRight") {
        ev.preventDefault();
        if (ev.shiftKey) {
          seekBy(10);
          return;
        }
        playFromBAndClearLoop();
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

      // ✅ Repeat toggle: r/R (기존 L은 유지하고 싶으면 아래 KeyL 블록도 남겨두면 됩니다)
      if (ev.code === "KeyR") {
        if (!canLoop) return;
        ev.preventDefault();
        setLoopEnabled(!loopEnabled);
        resetRepeatCount();
        return;
      }

      // (선택) 기존 L 단축키 유지
      if (ev.code === "KeyL") {
        if (!canLoop) return;
        ev.preventDefault();
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
    mediaUrl,
    canLoop,
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
    playFromA,
    playFromBAndClearLoop,
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Repeat Player</h1>
            <p className="mt-2 text-sm text-zinc-600">Ctrl/⌘+휠 줌으로 긴 오디오도 정밀하게 A–B 구간을 설정할 수 있어요.</p>
          </div>
          <Link
            href="/tts"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
            <Volume2 className="h-4 w-4" />
            TTS
          </Link>
        </div>
      </header>

      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">현재 파일</div>
            <div className="truncate text-base font-medium text-zinc-900">{fileName ?? "오디오 파일을 선택해 주세요"}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {fmtTime(currentTime)} / {fmtTime(duration)} {mediaUrl && !isReady ? "(로딩 중…)" : ""}
            </div>
          </div>

          {/* 상단: 파일 불러오기 */}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept="audio/*,video/mp4,video/*" className="hidden" onChange={onFileChange} />
            <button
              onClick={onPickFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
              <Upload className="h-4 w-4" />
              미디어 불러오기
            </button>
            {mediaKind === "video" ? (
              <button
                onClick={() => setShowVideo(!showVideo)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium shadow-sm",
                  showVideo
                    ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                    : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
                )}>
                {showVideo ? "비디오 숨기기" : "비디오 보기"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-5">
          <MediaView ref={mediaRef} mediaUrl={mediaUrl} mediaKind={mediaKind} showVideo={showVideo} onToggle={playPause} />
          <Waveform mediaRef={mediaRef} />
        </div>

        {/* ✅ Transport */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {/* Play / Pause */}
            <button
              onClick={playPause}
              disabled={controlsDisabled}
              className={clsx(
                "inline-flex w-[90px] items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium shadow-sm",
                controlsDisabled ? "cursor-not-allowed bg-zinc-900/50 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800",
              )}
              title="재생/일시정지 (Space)">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </button>

            {/* A */}
            <button
              onClick={() => {
                setLoopA(currentTime);
                resetRepeatCount();
              }}
              disabled={!mediaUrl}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="A 지정 (KeyA)">
              <Flag className="h-4 w-4" /> A
            </button>

            {/* B */}
            <button
              onClick={() => {
                setLoopB(currentTime);
                resetRepeatCount();
                setLoopEnabled(true);
              }}
              disabled={!mediaUrl}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="B 지정 (KeyB)">
              <Flag className="h-4 w-4" /> B
            </button>

            {/* Repeat Toggle */}
            <button
              onClick={() => {
                if (!canLoop) return;
                setLoopEnabled(!loopEnabled);
                resetRepeatCount();
              }}
              disabled={!canLoop}
              className={clsx(
                "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-medium shadow-sm",
                canLoop
                  ? loopEnabled
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-zinc-200 bg-amber-200 text-zinc-900 hover:bg-amber-100"
                  : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-400",
              )}
              title="반복 토글 (R)">
              {canLoop ? loopEnabled ? <BsRepeat size={16} /> : <BsRepeat1 size={16} /> : <TbRepeatOff size={16} />}
            </button>

            {/* Reset loop */}
            <button
              onClick={() => {
                setLoopA(null);
                setLoopB(null);
                setLoopEnabled(false);
                resetRepeatCount();
              }}
              disabled={!mediaUrl}
              className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="구간 초기화 (Esc)">
              <RotateCcw className="h-4 w-4" />
              <span className="inline-flex items-center gap-2">Reset</span>
            </button>

            {/* ✅ 선택 구간 WAV 추출 */}
            <button
              onClick={extractRegion}
              disabled={!canLoop || controlsDisabled || extracting}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="선택한 A/B 구간을 WAV 파일로 저장">
              <Download className="h-4 w-4" />
              {extracting ? "추출 중…" : "구간 추출(WAV)"}
            </button>

            {/* ✅ A부터 재생 (구간 유지) / (A/B 없으면 -3초) */}
            <button
              onClick={playFromA}
              disabled={controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={canLoop ? "현재 A/B 구간의 A 지점부터 다시 재생" : "-3초 이동 (←)"}>
              {canLoop ? <ArrowLeftToLine className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {canLoop ? "A" : "-3s"}
            </button>

            {/* ✅ B부터 재생 (구간 해제) / (A/B 없으면 +3초) */}
            <button
              onClick={playFromBAndClearLoop}
              disabled={controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={canLoop ? "A/B 구간을 해제하고 B 지점부터 재생" : "+3초 이동 (→)"}>
              {canLoop ? (
                <>
                  B <ArrowRightFromLine className="h-4 w-4" />
                </>
              ) : (
                <>
                  +3s <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="h-8 w-px bg-zinc-200" />

            {/* 처음으로 */}
            <button
              onClick={() => {
                stop();
                setTime(0);
              }}
              disabled={controlsDisabled}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="정지 + 00:00.00 이동">
              <RotateCcw className="h-4 w-4" />
              처음으로
            </button>

            <div className="h-8 w-px bg-zinc-200" />

            {/* Phrase nav */}
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

            {/* Volume */}
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

          {/* 내 발음 녹음 (분리 배치) */}
          <div className="mt-3 flex flex-col items-center justify-center gap-3 border-t border-zinc-100 pt-3">
            <div className="text-sm font-medium text-zinc-600">내 발음 녹음</div>
            <Recorder />
          </div>

          {/* 상태 텍스트 */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="min-w-0 truncate">
              {loopLabel} · 탐색은 <b>Overview</b> 또는 <b>파형 드래그(좌클릭)</b>. (Space: 재생/일시정지)
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600">반복: {repeatCount}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Repeat Limit */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
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
                  <b>좌클릭:</b> 탐색
                </li>
                <li>
                  <b>Space</b>: 재생/일시정지
                </li>
                <li>
                  <b>우클릭 드래그</b>: 구간 설정
                </li>
                <li>
                  <b>ESC</b>: 구간 초기화
                </li>
                <li>
                  <b>←</b>: A부터 재생 / -3초, <b>Shift+←</b>: -10초
                </li>
                <li>
                  <b>→</b>: B부터 재생 / +3초, <b>Shift+→</b>: +10초
                </li>
                <li>
                  <b>A</b>: A 지정, <b>B</b>: B 지정, <b>R</b>: 반복 토글 (L도 지원)
                </li>
                <li>
                  <b>↑/↓</b>: 속도 ±0.05
                </li>
                <li>
                  <b>Ctrl/⌘ + 휠</b>: 줌, <b>Ctrl/⌘ +/−/0</b>: 줌 조절/리셋
                </li>
                <li>
                  <b>Loop OFF:</b> A→B 1회 재생 모드
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
