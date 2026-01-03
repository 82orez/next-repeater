// src/components/Waveform.tsx
"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

const AB_REGION_ID = "ab_region";
const MARK_A_ID = "mark_a";
const MARK_B_ID = "mark_b";
const RB_TMP_ID = "rb_tmp";

type LabelInfo = { mode: "NONE" } | { mode: "A"; t: number } | { mode: "B"; t: number } | { mode: "AB"; a: number; b: number };

export default function Waveform() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof Regions.create> | null>(null);

  const loopTimerRef = useRef<number | null>(null);
  const loopGuardRef = useRef(false);
  const fadeRafRef = useRef<number | null>(null);

  // ✅ 우클릭 드래그 상태
  const rbSelectingRef = useRef(false);
  const rbStartTimeRef = useRef(0);
  const rbLastTimeRef = useRef(0); // ✅ pointerup 시 clientX 재계산 대신 마지막 move 시간 사용
  const rbTmpRegionRef = useRef<any | null>(null);
  const rbPointerIdRef = useRef<number | null>(null);

  const [labelInfo, setLabelInfo] = useState<LabelInfo>({ mode: "NONE" });

  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopRange = usePlayerStore((s) => s.setLoopRange); // ✅ NEW
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

  // label 위치(퍼센트)
  const pct = useMemo(() => {
    const dur = wsRef.current?.getDuration?.() || 0;
    return (t: number) => {
      if (!dur || dur <= 0) return 0;
      return Math.min(100, Math.max(0, (t / dur) * 100));
    };
  }, [audioUrl, loopA, loopB, labelInfo.mode]);

  // store 값으로 다시 그리기(우클릭 선택 취소 시 복구)
  const redrawFromValues = (a0: number | null, b0: number | null, enabled: boolean) => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    clearAllRegions();

    const dur = ws.getDuration() || 0;
    const EPS = 0.08;

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
          color: enabled ? "rgba(59, 130, 246, 0.18)" : "rgba(113, 113, 122, 0.14)",
        });
        setLabelInfo({ mode: "AB", a, b });
        return;
      }
    }

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
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = Regions.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 150,
      normalize: true,
      cursorWidth: 1,
      dragToSeek: true, // 좌클릭: 탐색
      barWidth: 2,
      barGap: 2,
      plugins: [regions],
    });

    wsRef.current = ws;
    regionsRef.current = regions;
    setWs(ws);

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

    // timeupdate: A–B 반복 처리
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
          rampVolume(targetVol, 0, fadeMs, () => {
            ws.pause();
            afterPause();
          });
        } else {
          if (pauseMs > 0) ws.pause();
          afterPause();
        }
      }
    });

    // region-created 방어(혹시 생성되면 제거 후 반영)
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID || r.id === MARK_A_ID || r.id === MARK_B_ID || r.id === RB_TMP_ID) return;

      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);

      try {
        r.remove();
      } catch {}

      if (end <= start) return;

      // ✅ 원자적 세팅
      setLoopRange(start, end);
      setLoopEnabled(true);
      resetRepeatCount();

      clearAllRegions();
    });

    // AB/마커 드래그 업데이트
    regions.on("region-updated", (r: any) => {
      if (r.id === RB_TMP_ID) return;

      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);
      if (end <= start) return;

      if (r.id === AB_REGION_ID) {
        // ✅ 원자적 세팅
        setLoopRange(start, end);
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

    // =========================
    // ✅ 우클릭 드래그(A–B 선택)
    // =========================
    const wrapperEl: HTMLElement = ((ws as any).getWrapper?.() as HTMLElement) || containerRef.current!;

    const xToTime = (clientX: number) => {
      const rect = wrapperEl.getBoundingClientRect();
      const ratio = (clientX - rect.left) / Math.max(1, rect.width);
      const dur = ws.getDuration() || 0;
      const clamped = Math.min(1, Math.max(0, ratio));
      return clamped * dur;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;

      const dur = ws.getDuration() || 0;
      if (dur <= 0) return;

      e.preventDefault();

      rbSelectingRef.current = true;
      rbPointerIdRef.current = e.pointerId;

      try {
        wrapperEl.setPointerCapture(e.pointerId);
      } catch {}

      const t0 = xToTime(e.clientX);
      rbStartTimeRef.current = t0;
      rbLastTimeRef.current = t0;

      // 기존 표시 제거 후 임시 region만 표시(항상 1개)
      clearAllRegions();
      setLabelInfo({ mode: "NONE" });

      const t1 = Math.min(dur, t0 + 0.01);
      const tmp = regions.addRegion({
        id: RB_TMP_ID,
        start: t0,
        end: t1,
        drag: false,
        resize: false,
        color: "rgba(168, 85, 247, 0.18)",
      });
      rbTmpRegionRef.current = tmp;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!rbSelectingRef.current) return;
      if (rbPointerIdRef.current !== e.pointerId) return;

      e.preventDefault();

      const dur = ws.getDuration() || 0;
      if (dur <= 0) return;

      const t = xToTime(e.clientX);
      rbLastTimeRef.current = t;

      const a = Math.min(rbStartTimeRef.current, t);
      const b = Math.max(rbStartTimeRef.current, t);

      const tmp = rbTmpRegionRef.current;
      if (!tmp) return;

      if (typeof tmp.setOptions === "function") {
        tmp.setOptions({ start: a, end: b });
      } else if (typeof tmp.update === "function") {
        tmp.update({ start: a, end: b });
      } else {
        tmp.start = a;
        tmp.end = b;
      }
    };

    const finishRightDrag = (e: PointerEvent) => {
      if (!rbSelectingRef.current) return;
      if (rbPointerIdRef.current !== e.pointerId) return;

      e.preventDefault();

      rbSelectingRef.current = false;
      rbPointerIdRef.current = null;

      try {
        wrapperEl.releasePointerCapture(e.pointerId);
      } catch {}

      // ✅ pointerup 위치로 다시 계산하지 않고 마지막 move 시간을 사용
      const a = Math.min(rbStartTimeRef.current, rbLastTimeRef.current);
      const b = Math.max(rbStartTimeRef.current, rbLastTimeRef.current);

      try {
        rbTmpRegionRef.current?.remove?.();
      } catch {}
      rbTmpRegionRef.current = null;

      // 너무 짧으면(거의 클릭) 기존 표시 복구
      if (b - a < 0.05) {
        const st = usePlayerStore.getState();
        redrawFromValues(st.loopA, st.loopB, st.loopEnabled);
        return;
      }

      // ✅ (버그#2 해결) 원자적 범위 세팅
      setLoopRange(a, b);
      setLoopEnabled(true);
      resetRepeatCount();

      // ✅ (버그#1 해결) 우클릭 드래그로 구간 잡으면 즉시 A로 이동
      usePlayerStore.getState().setTime(a);
    };

    wrapperEl.addEventListener("contextmenu", onContextMenu);
    wrapperEl.addEventListener("pointerdown", onPointerDown);
    wrapperEl.addEventListener("pointermove", onPointerMove);
    wrapperEl.addEventListener("pointerup", finishRightDrag);
    wrapperEl.addEventListener("pointercancel", finishRightDrag);

    return () => {
      cancelFade();
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }

      wrapperEl.removeEventListener("contextmenu", onContextMenu);
      wrapperEl.removeEventListener("pointerdown", onPointerDown);
      wrapperEl.removeEventListener("pointermove", onPointerMove);
      wrapperEl.removeEventListener("pointerup", finishRightDrag);
      wrapperEl.removeEventListener("pointercancel", finishRightDrag);

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

  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  // ✅ region 1개 유지(A마커/B마커/AB구간)
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    // 우클릭 선택 중에는 임시 region 유지
    if (rbSelectingRef.current) return;

    clearAllRegions();

    const a0 = loopA;
    const b0 = loopB;

    const dur = ws.getDuration() || 0;
    const EPS = 0.08;

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

  return (
    <div ref={wrapRef} className="relative w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="w-full" />

      {/* 라벨 오버레이 */}
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

      <p className="mt-2 text-xs text-zinc-500">
        좌클릭 드래그: 탐색, <b>우클릭 드래그: A–B 구간 선택(선택 즉시 A로 이동)</b>
      </p>
    </div>
  );
}
