// src/components/Waveform.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js"; // 공식 import 경로 :contentReference[oaicite:7]{index=7}
import { usePlayerStore } from "@/store/playerStore";
import { clamp } from "@/lib/time";

type Props = {
  className?: string;
};

export default function Waveform({ className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof Regions.create> | null>(null);
  const loopTimerRef = useRef<number | null>(null);

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);
  const autoPauseMs = usePlayerStore((s) => s.autoPauseMs);
  const repeatTarget = usePlayerStore((s) => s.repeatTarget);
  const repeatCount = usePlayerStore((s) => s.repeatCount);

  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);
  const incRepeatCount = usePlayerStore((s) => s.incRepeatCount);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);

  const loopKey = useMemo(() => {
    const a = loopA ?? -1;
    const b = loopB ?? -1;
    return `${loopEnabled}-${a}-${b}-${autoPauseMs}-${repeatTarget}`;
  }, [loopEnabled, loopA, loopB, autoPauseMs, repeatTarget]);

  // wavesurfer init / destroy
  useEffect(() => {
    if (!containerRef.current) return;

    const regions = Regions.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 140,
      barWidth: 2,
      barGap: 2,
      normalize: true,
      cursorWidth: 1,
      dragToSeek: true,
      plugins: [regions],
    });

    wsRef.current = ws;
    regionsRef.current = regions;

    // 드래그로 region 만들기(구간 선택)
    const disableDrag = regions.enableDragSelection({
      color: "rgba(59, 130, 246, 0.18)",
    });

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());
      ws.setPlaybackRate(playbackRate);
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    ws.on("timeupdate", (t) => {
      setCurrentTime(t);
    });

    // region 생성/수정 시 A/B 자동 반영
    const syncFromRegion = (r: any) => {
      const start = clamp(r.start ?? 0, 0, ws.getDuration());
      const end = clamp(r.end ?? 0, 0, ws.getDuration());
      if (end <= start) return;
      setLoopA(start);
      setLoopB(end);
      resetRepeatCount();
      setLoopEnabled(true);
    };

    regions.on("region-created", (r: any) => {
      // 사용자가 여러개 만들면 혼란 → 최신 하나만 유지
      Object.values(regions.getRegions()).forEach((x: any) => {
        if (x.id !== r.id) x.remove();
      });
      syncFromRegion(r);
    });

    regions.on("region-updated", (r: any) => syncFromRegion(r));

    return () => {
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      try {
        disableDrag?.();
      } catch {}
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load audio
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    setReady(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);

    // 기존 region 제거
    const regions = regionsRef.current;
    if (regions) {
      Object.values(regions.getRegions()).forEach((r: any) => r.remove());
    }

    if (!audioUrl) return;

    ws.load(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // rate sync
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  // A-B loop enforcement
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    const tick = () => {
      if (!wsRef.current) return;

      const a = loopA;
      const b = loopB;

      if (!loopEnabled || a == null || b == null || b <= a) return;

      const now = wsRef.current.getCurrentTime();

      // B를 넘으면 A로 점프 (autoPause 지원)
      if (now >= b) {
        // 반복 횟수 제한
        if (repeatTarget > 0 && repeatCount >= repeatTarget) {
          wsRef.current.pause();
          return;
        }

        incRepeatCount();

        const jump = () => {
          if (!wsRef.current) return;
          wsRef.current.setTime(a);
          wsRef.current.play();
        };

        if (autoPauseMs > 0) {
          wsRef.current.pause();
          loopTimerRef.current = window.setTimeout(jump, autoPauseMs);
        } else {
          wsRef.current.setTime(a);
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [loopKey, loopEnabled, loopA, loopB, autoPauseMs, repeatTarget, repeatCount, incRepeatCount]);

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm" />
      <p className="mt-2 text-xs text-zinc-500">파형을 드래그하면 A–B 구간이 선택되고 자동 반복이 켜집니다.</p>
    </div>
  );
}

// 외부에서 제어하고 싶으면 wsRef를 store에 넣는 패턴으로 확장 가능합니다.
