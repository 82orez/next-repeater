// src/components/Waveform.tsx
"use client";

import React, { useRef, useEffect, useMemo } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import Minimap from "wavesurfer.js/dist/plugins/minimap.esm.js";
import { usePlayerStore } from "@/store/playerStore";

const AB_REGION_ID = "ab_region";
const MARK_A_ID = "mark_a";
const MARK_B_ID = "mark_b";
const RB_TMP_ID = "rb_tmp";

// ✅ 스냅 간격(0.01초)
const SNAP_SEC = 0.01;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ✅ 01:23.45 형태(centisecond=1/100s)
function fmtTimeCS(sec: number) {
  const s = Math.max(0, sec);
  const totalCs = Math.round(s * 100); // centiseconds
  const mm = Math.floor(totalCs / (60 * 100));
  const ss = Math.floor((totalCs % (60 * 100)) / 100);
  const cs = totalCs % 100;
  return `${pad2(mm)}:${pad2(ss)}.${pad2(cs)}`;
}

export default function Waveform() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);

  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof Regions.create> | null>(null);

  const loopTimerRef = useRef<number | null>(null);
  const loopGuardRef = useRef(false);
  const fadeRafRef = useRef<number | null>(null);

  // ✅ region-updated에서 우리가 setOptions로 다시 보정할 때 무한루프 방지
  const snapApplyingRef = useRef(false);

  // ✅ 우클릭 드래그 상태
  const rbSelectingRef = useRef(false);
  const rbStartTimeRef = useRef(0);
  const rbLastTimeRef = useRef(0);
  const rbTmpRegionRef = useRef<any | null>(null);
  const rbPointerIdRef = useRef<number | null>(null);

  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopRange = usePlayerStore((s) => s.setLoopRange);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  const setTime = usePlayerStore((s) => s.setTime); // ✅ 칩 클릭 시 seek

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

  // ✅ A/B 텍스트 표시용 (정렬된 값)
  const abText = useMemo(() => {
    if (loopA == null && loopB == null) return { a: null as number | null, b: null as number | null, len: null as number | null };
    if (loopA != null && loopB == null) return { a: loopA, b: null, len: null };
    if (loopA == null && loopB != null) return { a: null, b: loopB, len: null };

    const a = Math.min(loopA!, loopB!);
    const b = Math.max(loopA!, loopB!);
    const len = b > a ? b - a : null;
    return { a, b, len };
  }, [loopA, loopB]);

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

  // ✅ 스냅 유틸
  const snapTime = (t: number, dur: number) => {
    const clamped = Math.min(dur, Math.max(0, t));
    return Math.round(clamped / SNAP_SEC) * SNAP_SEC;
  };

  const setRegionTimes = (r: any, start: number, end: number) => {
    if (typeof r?.setOptions === "function") r.setOptions({ start, end });
    else if (typeof r?.update === "function") r.update({ start, end });
    else {
      r.start = start;
      r.end = end;
    }
  };

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
      return;
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = Regions.create();

    const minimap =
      minimapRef.current != null
        ? Minimap.create({
            container: minimapRef.current,
            height: 44,
            waveColor: "rgba(148, 163, 184, 0.55)",
            progressColor: "rgba(59, 130, 246, 0.65)",
            cursorColor: "rgba(15, 23, 42, 0.7)",
          })
        : null;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 150,
      normalize: true,
      cursorWidth: 1,
      dragToSeek: true,
      barWidth: 2,
      barGap: 2,
      plugins: minimap ? [regions, minimap] : [regions],
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
      ws.zoom(st.zoomPps);
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

    // region-created 방어 + 스냅
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID || r.id === MARK_A_ID || r.id === MARK_B_ID || r.id === RB_TMP_ID) return;

      const dur = ws.getDuration() || 0;
      const start0 = Math.max(0, r.start ?? 0);
      const end0 = Math.max(0, r.end ?? 0);

      try {
        r.remove();
      } catch {}

      if (end0 <= start0) return;

      const start = snapTime(start0, dur);
      const end = snapTime(end0, dur);
      if (end <= start) return;

      setLoopRange(start, end);
      setLoopEnabled(true);
      resetRepeatCount();

      clearAllRegions();
    });

    // AB/마커 업데이트 + 스냅(0.01s)
    regions.on("region-updated", (r: any) => {
      if (r.id === RB_TMP_ID) return;
      if (snapApplyingRef.current) return;

      const dur = ws.getDuration() || 0;
      const EPS = 0.08;

      if (r.id === MARK_A_ID || r.id === MARK_B_ID) {
        const s0 = Math.max(0, r.start ?? 0);
        const s = snapTime(s0, dur);
        const e = Math.min(dur, s + EPS);

        if (Math.abs(s - s0) > 1e-6) {
          snapApplyingRef.current = true;
          setRegionTimes(r, s, e);
          requestAnimationFrame(() => {
            snapApplyingRef.current = false;
          });
        }

        if (r.id === MARK_A_ID) {
          setLoopA(s);
          resetRepeatCount();
        } else {
          setLoopB(s);
          resetRepeatCount();
        }
        return;
      }

      if (r.id === AB_REGION_ID) {
        const s0 = Math.max(0, r.start ?? 0);
        const e0 = Math.max(0, r.end ?? 0);

        const s = snapTime(s0, dur);
        const e = snapTime(e0, dur);
        if (e <= s) return;

        if (Math.abs(s - s0) > 1e-6 || Math.abs(e - e0) > 1e-6) {
          snapApplyingRef.current = true;
          setRegionTimes(r, s, e);
          requestAnimationFrame(() => {
            snapApplyingRef.current = false;
          });
        }

        setLoopRange(s, e);
        setLoopEnabled(true);
        resetRepeatCount();
      }
    });

    // 우클릭 드래그(A–B 선택)
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

      clearAllRegions();

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

      setRegionTimes(tmp, a, b);
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

      const dur = ws.getDuration() || 0;

      const a0 = Math.min(rbStartTimeRef.current, rbLastTimeRef.current);
      const b0 = Math.max(rbStartTimeRef.current, rbLastTimeRef.current);

      try {
        rbTmpRegionRef.current?.remove?.();
      } catch {}
      rbTmpRegionRef.current = null;

      if (b0 - a0 < 0.05) {
        const st = usePlayerStore.getState();
        redrawFromValues(st.loopA, st.loopB, st.loopEnabled);
        return;
      }

      const a = snapTime(a0, dur);
      const b = snapTime(b0, dur);
      if (b <= a) return;

      setLoopRange(a, b);
      setLoopEnabled(true);
      resetRepeatCount();

      usePlayerStore.getState().setTime(a);
    };

    // Ctrl/⌘ + Wheel Zoom
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      const st = usePlayerStore.getState();
      if (!st.ws) return;

      e.preventDefault();

      const dir = e.deltaY > 0 ? -1 : 1;
      const step = Math.max(10, Math.round(st.zoomPps * 0.08)); // 8%
      st.setZoomPps(st.zoomPps + dir * step);
    };

    wrapperEl.addEventListener("contextmenu", onContextMenu);
    wrapperEl.addEventListener("pointerdown", onPointerDown);
    wrapperEl.addEventListener("pointermove", onPointerMove);
    wrapperEl.addEventListener("pointerup", finishRightDrag);
    wrapperEl.addEventListener("pointercancel", finishRightDrag);
    wrapperEl.addEventListener("wheel", onWheel, { passive: false });

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
      wrapperEl.removeEventListener("wheel", onWheel as any);

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

  // ✅ region 1개 유지(A마커/B마커/AB구간)
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

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
      return;
    }
  }, [loopA, loopB, loopEnabled]);

  // ✅ 칩 클릭 시 seek 위치 결정(AB일 때는 min/max 사용)
  const seekToA = () => {
    if (abText.a == null) return;
    setTime(abText.a);
  };
  const seekToB = () => {
    if (abText.b == null) return;
    setTime(abText.b);
  };

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      {/* Overview / Minimap */}
      <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-medium text-zinc-700">Overview</div>
          <div className="text-[11px] text-zinc-500">클릭/드래그로 이동 · 확대 시 뷰포트 표시</div>
        </div>
        <div ref={minimapRef} className="w-full" />
      </div>

      {/* Main waveform */}
      <div ref={containerRef} className="w-full" />

      {/* ✅ A/B 텍스트 (라벨 대신) + 클릭하면 seek */}
      <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-zinc-700">
            <button
              type="button"
              onClick={seekToA}
              disabled={abText.a == null}
              className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              title={abText.a != null ? "A로 이동" : "A가 설정되지 않았습니다"}>
              A {abText.a != null ? fmtTimeCS(abText.a) : "--:--.--"}
            </button>

            <button
              type="button"
              onClick={seekToB}
              disabled={abText.b == null}
              className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              title={abText.b != null ? "B로 이동" : "B가 설정되지 않았습니다"}>
              B {abText.b != null ? fmtTimeCS(abText.b) : "--:--.--"}
            </button>

            {abText.len != null && <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">LEN {fmtTimeCS(abText.len)}</span>}
          </div>

          <div className="text-[11px] text-zinc-500">
            좌클릭: 탐색 · <b>우클릭 드래그</b>: 구간 설정 · <b>Ctrl/⌘+휠</b>: 줌 · 스냅 0.01s
          </div>
        </div>
      </div>
    </div>
  );
}
