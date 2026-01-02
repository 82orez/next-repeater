// src/components/Waveform.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

const AB_REGION_ID = "ab_region";
const MARK_A_ID = "mark_a";
const MARK_B_ID = "mark_b";

type LabelInfo = { mode: "NONE" } | { mode: "A"; t: number } | { mode: "B"; t: number } | { mode: "AB"; a: number; b: number };

export default function Waveform() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof Regions.create> | null>(null);

  const loopTimerRef = useRef<number | null>(null);
  const loopGuardRef = useRef(false);
  const fadeRafRef = useRef<number | null>(null);

  const [labelInfo, setLabelInfo] = useState<LabelInfo>({ mode: "NONE" });

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

  // label 위치 계산(퍼센트)
  const labelStyle = useMemo(() => {
    const ws = wsRef.current;
    const dur = ws?.getDuration?.() || 0;
    const pct = (t: number) => {
      if (!dur || dur <= 0) return 0;
      return Math.min(100, Math.max(0, (t / dur) * 100));
    };
    return { pct };
  }, [audioUrl, loopA, loopB, labelInfo.mode]);

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

    // drag region -> store 반영 후 삭제 (항상 region 1개)
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID || r.id === MARK_A_ID || r.id === MARK_B_ID) return;

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

    // region drag/resize
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

      if (r.id === MARK_A_ID) {
        setLoopA(start);
        resetRepeatCount();
        return;
      }

      if (r.id === MARK_B_ID) {
        setLoopB(start);
        resetRepeatCount();
        return;
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
    setLabelInfo({ mode: "NONE" });

    if (!audioUrl) return;
    ws.load(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // rate / volume sync
  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  // ✅ 파형 표시 region은 1개만 (A마커 / B마커 / AB구간)
  // + 라벨 정보(labelInfo)도 같이 업데이트
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    clearAllRegions();

    const a0 = loopA;
    const b0 = loopB;

    const dur = ws.getDuration() || 0;
    const EPS = 0.08;

    // AB 유효 -> AB 표시
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
        setLabelInfo({ mode: "AB", a, b });
        return;
      }
    }

    // A만 -> A 마커
    if (a0 != null && b0 == null) {
      const start = dur > 0 ? Math.min(a0, Math.max(0, dur - EPS)) : a0;
      regions.addRegion({
        id: MARK_A_ID,
        start,
        end: start + EPS,
        drag: true,
        resize: false,
        color: "rgba(245, 158, 11, 0.22)",
      });
      setLabelInfo({ mode: "A", t: start });
      return;
    }

    // ✅ B만 -> B 마커
    if (a0 == null && b0 != null) {
      const start = dur > 0 ? Math.min(b0, Math.max(0, dur - EPS)) : b0;
      regions.addRegion({
        id: MARK_B_ID,
        start,
        end: start + EPS,
        drag: true,
        resize: false,
        color: "rgba(244, 63, 94, 0.22)",
      });
      setLabelInfo({ mode: "B", t: start });
      return;
    }

    setLabelInfo({ mode: "NONE" });
  }, [loopA, loopB, loopEnabled]);

  const pct = (t: number) => labelStyle.pct(t);

  return (
    <div ref={wrapRef} className="relative w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="w-full" />

      {/* ✅ 라벨 오버레이 */}
      {labelInfo.mode === "A" && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow"
          style={{ left: `${pct(labelInfo.t)}%` }}>
          A
        </div>
      )}

      {labelInfo.mode === "B" && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow"
          style={{ left: `${pct(labelInfo.t)}%` }}>
          B
        </div>
      )}

      {labelInfo.mode === "AB" && (
        <>
          <div
            className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow"
            style={{ left: `${pct(labelInfo.a)}%` }}>
            A
          </div>
          <div
            className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow"
            style={{ left: `${pct(labelInfo.b)}%` }}>
            B
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-zinc-500">A/B 단독 선택도 파형에 즉시 표시됩니다. (A/B 라벨 포함)</p>
    </div>
  );
}
