// src/components/Waveform.tsx
"use client";

import React, { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

const AB_REGION_ID = "ab_region";

export default function Waveform() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof Regions.create> | null>(null);

  const loopTimerRef = useRef<number | null>(null);
  const loopGuardRef = useRef(false);

  const fadeRafRef = useRef<number | null>(null);

  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

  const clearAllRegions = () => {
    const regions = regionsRef.current;
    if (!regions) return;
    Object.values(regions.getRegions()).forEach((r: any) => r.remove());
  };

  const cancelFade = () => {
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
  };

  const rampVolume = (from: number, to: number, ms: number, done?: () => void) => {
    cancelFade();
    if (ms <= 0) {
      wsRef.current?.setVolume(to);
      done?.();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = from + (to - from) * t;
      wsRef.current?.setVolume(v);
      if (t < 1) fadeRafRef.current = requestAnimationFrame(step);
      else {
        fadeRafRef.current = null;
        done?.();
      }
    };
    fadeRafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = Regions.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 150,
      normalize: true,
      cursorWidth: 1,
      dragToSeek: true,
      barWidth: 2,
      barGap: 2,
      plugins: [regions],
    });

    wsRef.current = ws;
    regionsRef.current = regions;
    setWs(ws);

    const disableDrag = regions.enableDragSelection({
      color: "rgba(59, 130, 246, 0.18)",
    });

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());

      const st = usePlayerStore.getState();
      ws.setPlaybackRate(st.playbackRate);
      ws.setVolume(st.volume);
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    ws.on("timeupdate", (t) => {
      setCurrentTime(t);

      const st = usePlayerStore.getState();
      const a0 = st.loopA;
      const b0 = st.loopB;

      if (!st.loopEnabled || a0 == null || b0 == null) return;

      const a = Math.min(a0, b0);
      const b = Math.max(a0, b0);
      if (b <= a) return;
      if (loopGuardRef.current) return;

      if (t >= b) {
        // 반복 횟수 제한
        if (st.repeatTarget > 0 && st.repeatCount >= st.repeatTarget) {
          ws.pause();
          return;
        }

        loopGuardRef.current = true;
        st.incRepeatCount();

        const targetVol = st.volume;
        const preRoll = Math.max(0, st.preRollSec);
        const fadeMs = Math.max(0, st.fadeMs);
        const pauseMs = Math.max(0, st.autoPauseMs);

        const jumpStart = Math.max(0, a - preRoll);

        const doJumpAndPlay = () => {
          const ws2 = wsRef.current;
          if (!ws2) return;

          ws2.setTime(jumpStart);

          // fade-in + play
          if (fadeMs > 0) {
            ws2.setVolume(0);
            ws2.play();
            rampVolume(0, targetVol, fadeMs, () => {
              loopGuardRef.current = false;
            });
          } else {
            ws2.setVolume(targetVol);
            ws2.play();
            loopGuardRef.current = false;
          }
        };

        const afterPause = () => {
          if (pauseMs > 0) {
            if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
            loopTimerRef.current = window.setTimeout(doJumpAndPlay, pauseMs);
          } else {
            doJumpAndPlay();
          }
        };

        // fade-out + pause → (autoPause) → jump
        if (fadeMs > 0) {
          const from = targetVol; // 유저 볼륨 기준으로 자연스럽게
          rampVolume(from, 0, fadeMs, () => {
            ws.pause();
            afterPause();
          });
        } else {
          // 페이드 없이: autoPause 있으면 pause 후 점프, 없으면 즉시 점프(끊김 최소)
          if (pauseMs > 0) ws.pause();
          afterPause();
        }
      }
    });

    // 드래그로 만든 region은 값만 읽고 즉시 삭제 → AB 1개만 유지
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID) return;

      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);

      try {
        r.remove();
      } catch {}

      if (end <= start) return;

      // store setter가 자동 정렬 처리함
      setLoopA(start);
      setLoopB(end);
      setLoopEnabled(true);
      resetRepeatCount();

      clearAllRegions();
    });

    // AB region 리사이즈/드래그 시도 시 store 반영(자동 정렬)
    regions.on("region-updated", (r: any) => {
      if (r.id !== AB_REGION_ID) return;
      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);
      if (end <= start) return;

      setLoopA(start);
      setLoopB(end);
      setLoopEnabled(true);
      resetRepeatCount();
    });

    return () => {
      cancelFade();
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
      setWs(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    setReady(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);

    clearAllRegions();
    cancelFade();

    if (!audioUrl) return;
    ws.load(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    // 유저가 볼륨을 바꾸면 즉시 반영
    wsRef.current?.setVolume(volume);
  }, [volume]);

  // AB region은 항상 1개만, 정렬된 범위로 표시
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;

    clearAllRegions();

    if (loopA == null || loopB == null) return;
    const a = Math.min(loopA, loopB);
    const b = Math.max(loopA, loopB);
    if (b <= a) return;

    regions.addRegion({
      id: AB_REGION_ID,
      start: a,
      end: b,
      drag: true,
      resize: true,
      color: loopEnabled ? "rgba(59, 130, 246, 0.18)" : "rgba(113, 113, 122, 0.14)",
    });
  }, [loopA, loopB, loopEnabled]);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="w-full" />
      <p className="mt-2 text-xs text-zinc-500">A–B는 자동 정렬되며, 반복 경계에서 프리롤/페이드로 자연스럽게 반복됩니다.</p>
    </div>
  );
}
