// src/components/Waveform.tsx
"use client";

import React, { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

const AB_REGION_ID = "ab_region";
const MARK_REGION_ID = "mark_region"; // ✅ A(또는 B 단독) 표시용

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

    // timeupdate: 최신 store 상태로 A–B 반복 처리(이미 적용된 버전)
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

        if (fadeMs > 0) {
          const from = targetVol;
          rampVolume(from, 0, fadeMs, () => {
            ws.pause();
            afterPause();
          });
        } else {
          if (pauseMs > 0) ws.pause();
          afterPause();
        }
      }
    });

    // 드래그로 만든 region은 값만 읽고 즉시 삭제 → AB 1개만 유지
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID || r.id === MARK_REGION_ID) return;

      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);

      try {
        r.remove();
      } catch {}

      if (end <= start) return;

      setLoopA(start);
      setLoopB(end);
      setLoopEnabled(true);
      resetRepeatCount();

      clearAllRegions();
    });

    // ✅ region 업데이트: AB 구간이면 A/B 둘 다, 마커면 현재 상태에 따라 A 또는 B만 업데이트
    regions.on("region-updated", (r: any) => {
      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);
      if (end <= start) return;

      if (r.id === AB_REGION_ID) {
        setLoopA(start);
        setLoopB(end);
        setLoopEnabled(true);
        resetRepeatCount();
        return;
      }

      if (r.id === MARK_REGION_ID) {
        // 마커는 "단독 지정 중"에만 존재
        const st = usePlayerStore.getState();
        if (st.loopA != null && st.loopB == null) {
          setLoopA(start);
          resetRepeatCount();
        } else if (st.loopA == null && st.loopB != null) {
          setLoopB(start);
          resetRepeatCount();
        } else if (st.loopA != null && st.loopB != null) {
          // 혹시 상태가 바뀐 경우 안전 처리: AB로 승격
          setLoopA(start);
          setLoopB(end);
          setLoopEnabled(true);
          resetRepeatCount();
        }
      }
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

  // load audio
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
    wsRef.current?.setVolume(volume);
  }, [volume]);

  // ✅ 핵심: 파형에는 "항상 1개 region"만 표시
  // - A만 있으면: A 마커(짧은 구간)
  // - A,B 있으면: AB 구간
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    clearAllRegions();

    const a0 = loopA;
    const b0 = loopB;

    const dur = ws.getDuration() || 0;
    const EPS = 0.08; // ✅ 마커 두께(초) - 취향에 따라 0.05~0.12 추천

    // AB가 유효하면 AB만 표시
    if (a0 != null && b0 != null) {
      const a = Math.min(a0, b0);
      const b = Math.max(a0, b0);
      if (b > a) {
        regions.addRegion({
          id: AB_REGION_ID,
          start: a,
          end: b,
          drag: true,
          resize: true,
          color: loopEnabled ? "rgba(59, 130, 246, 0.18)" : "rgba(113, 113, 122, 0.14)",
        });
        return;
      }
    }

    // A만 있는 경우: A 마커 표시
    if (a0 != null && b0 == null) {
      const start = dur > 0 ? Math.min(a0, Math.max(0, dur - EPS)) : a0;
      const end = start + EPS;

      regions.addRegion({
        id: MARK_REGION_ID,
        start,
        end,
        drag: true, // 마커 자체를 드래그해서 A 미세조정 가능
        resize: false,
        color: "rgba(245, 158, 11, 0.22)", // amber 느낌 (A 지정중 강조)
      });
      return;
    }

    // (선택) B만 있는 경우도 마커 표시하고 싶다면 아래 활성화
    // if (a0 == null && b0 != null) { ... }
  }, [loopA, loopB, loopEnabled]);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="w-full" />
      <p className="mt-2 text-xs text-zinc-500">A만 지정해도 파형에 즉시 표시됩니다. (A 마커 → B 지정 시 AB 구간으로 전환)</p>
    </div>
  );
}
