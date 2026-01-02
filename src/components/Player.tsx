// src/components/Player.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { Pause, Play, Square, Repeat, Flag, Upload, Timer } from "lucide-react";
import Waveform from "@/components/Waveform";
import { usePlayerStore } from "@/store/playerStore";
import { fmtTime, clamp } from "@/lib/time";

export default function Player() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const fileName = usePlayerStore((s) => s.fileName);

  const isReady = usePlayerStore((s) => s.isReady);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const playbackRate = usePlayerStore((s) => s.playbackRate);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);
  const autoPauseMs = usePlayerStore((s) => s.autoPauseMs);
  const repeatTarget = usePlayerStore((s) => s.repeatTarget);
  const repeatCount = usePlayerStore((s) => s.repeatCount);

  const setSource = usePlayerStore((s) => s.setSource);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setAutoPauseMs = usePlayerStore((s) => s.setAutoPauseMs);
  const setRepeatTarget = usePlayerStore((s) => s.setRepeatTarget);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);
  const upsertRecent = usePlayerStore((s) => s.upsertRecent);

  // NOTE: Waveform.tsx 안에서 ws 인스턴스를 내부 관리 중이라
  // 여기서 Play/Pause/Stop을 직접 제어하려면 "wsRef를 store에 저장" 패턴으로 확장해야 합니다.
  // MVP에서는 Waveform 영역 클릭/스페이스바로 제어하도록 하고,
  // 아래 버튼은 "미디어 엘리먼트"를 따로 두는 방식으로도 가능하지만,
  // 간단히 하기 위해 1단계에서는 Waveform에 컨트롤 패널을 붙이는 방식(확장 섹션) 권장.
  //
  // ✅ 그래서 이 MVP는 “Waveform 드래그/클릭 중심 UX”로 먼저 완성하고,
  // 다음 턴에서 “store에 ws 핸들 저장” 버전으로 Play/Pause/Stop을 완전히 연결해드릴게요.
  //
  // 여기서는 UI/상태와 학습 기능(AB/속도/반복)을 먼저 탄탄히 잡습니다.

  // 파일 업로드
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setSource({ audioUrl: url, fileName: f.name });
    upsertRecent({ fileName: f.name, audioUrl: url, lastTime: 0 });
  };

  // 키보드 숏컷
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as any)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea" || (ev.target as any)?.isContentEditable) return;

      if (ev.code === "KeyA") {
        setLoopA(currentTime);
        resetRepeatCount();
      }
      if (ev.code === "KeyB") {
        setLoopB(currentTime);
        resetRepeatCount();
        setLoopEnabled(true);
      }
      if (ev.code === "KeyL") {
        setLoopEnabled(!loopEnabled);
        resetRepeatCount();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTime, loopEnabled, setLoopA, setLoopB, setLoopEnabled, resetRepeatCount]);

  const loopLabel = useMemo(() => {
    if (loopA == null || loopB == null) return "A–B 미설정";
    const a = Math.min(loopA, loopB);
    const b = Math.max(loopA, loopB);
    return `${fmtTime(a)} → ${fmtTime(b)} (${fmtTime(b - a)})`;
  }, [loopA, loopB]);

  const canLoop = loopA != null && loopB != null && Math.abs(loopB - loopA) > 0.05;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Repeat Player</h1>
        <p className="mt-2 text-sm text-zinc-600">파형에서 구간을 선택하고 A–B 반복으로 쉐도잉/리스닝을 빠르게.</p>
      </header>

      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-zinc-500">현재 파일</div>
            <div className="truncate text-base font-medium text-zinc-900">{fileName ?? "파일을 선택해 주세요"}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {fmtTime(currentTime)} / {fmtTime(duration)} {isReady ? "" : audioUrl ? " (로딩 중...)" : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileChange} />

            <button
              onClick={onPickFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
              <Upload className="h-4 w-4" />
              오디오 불러오기
            </button>

            <div className="h-9 w-px bg-zinc-200" />

            {/* 아래 3개 버튼은 2단계에서 wavesurfer 핸들 store 연결하면 완벽히 동작 */}
            <button
              disabled={!audioUrl}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-60 shadow-sm hover:opacity-100 disabled:cursor-not-allowed"
              title="(MVP 1단계) Waveform에 재생 연결 확장 예정">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              재생/일시정지
            </button>

            <button
              disabled={!audioUrl}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="(MVP 1단계) Waveform에 Stop 연결 확장 예정">
              <Square className="h-4 w-4" />
              Stop
            </button>
          </div>
        </div>

        <div className="mt-5">
          <Waveform />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* A-B */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
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
                )}>
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
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
                <Flag className="h-4 w-4" /> A 지정 (KeyA)
              </button>

              <button
                onClick={() => {
                  setLoopB(currentTime);
                  resetRepeatCount();
                  setLoopEnabled(true);
                }}
                disabled={!audioUrl}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
                <Flag className="h-4 w-4" /> B 지정 (KeyB)
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
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                  <Timer className="h-4 w-4" /> 반복 사이 자동 Pause (ms)
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
                <div className="text-xs font-medium text-zinc-600">반복 횟수 제한 (0=무제한)</div>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={repeatTarget}
                  onChange={(e) => setRepeatTarget(clamp(Number(e.target.value || 0), 0, 999))}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <div className="mt-1 text-xs text-zinc-500">현재 반복: {repeatCount}</div>
              </label>
            </div>
          </div>

          {/* Speed */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">재생 속도</div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>0.5x</span>
              <span className="font-medium text-zinc-900">{playbackRate.toFixed(2)}x</span>
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
                <li>A 지정: KeyA</li>
                <li>B 지정: KeyB</li>
                <li>반복 토글: KeyL</li>
                <li>(확장) Space 재생/일시정지, ←/→ 3초 이동 등</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-500">
        MVP 1단계: 파형 기반 구간 선택/반복/속도. 2단계에서 Play/Pause/Stop을 wavesurfer 인스턴스와 완전 연결 + 북마크/자막 패널 추가 권장.
      </footer>
    </div>
  );
}
