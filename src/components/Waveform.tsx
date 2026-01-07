// src/components/Waveform.tsx
"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
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

  // ✅ 로딩 인디케이터
  const [isLoadingWave, setIsLoadingWave] = useState(false);
  const [loadingPct, setLoadingPct] = useState<number | null>(null);

  // ✅ 터치 기반 감지: (hover none) 또는 (pointer coarse)면 region drag/resize 비활성화
  const [isTouchLike, setIsTouchLike] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(hover: none), (pointer: coarse)");
    const onChange = () => setIsTouchLike(mql.matches);
    onChange();

    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const duration = usePlayerStore((s) => s.duration);

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

  // ✅ 터치 환경 전환 시 이미 존재하는 region drag/resize 즉시 반영
  const syncRegionInteractivity = () => {
    const regions = regionsRef.current;
    if (!regions) return;

    const list = regions.getRegions();
    Object.values(list).forEach((r: any) => {
      if (!r) return;

      if (r.id === AB_REGION_ID) {
        const next = { drag: !isTouchLike, resize: !isTouchLike };
        if (typeof r?.setOptions === "function") r.setOptions(next);
        else if (typeof r?.update === "function") r.update(next);
        return;
      }

      if (r.id === MARK_A_ID || r.id === MARK_B_ID) {
        const next = { drag: !isTouchLike, resize: false };
        if (typeof r?.setOptions === "function") r.setOptions(next);
        else if (typeof r?.update === "function") r.update(next);
        return;
      }
    });
  };

  // ✅ ESC로 구간 초기화(스토어 + UI)
  const resetLoopAll = () => {
    rbSelectingRef.current = false;
    rbPointerIdRef.current = null;

    try {
      rbTmpRegionRef.current?.remove?.();
    } catch {}
    rbTmpRegionRef.current = null;

    clearAllRegions();

    setLoopEnabled(false);
    setLoopA(null);
    setLoopB(null);
    resetRepeatCount();
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
          drag: !isTouchLike,
          resize: !isTouchLike,
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
        drag: !isTouchLike,
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
        drag: !isTouchLike,
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

    // ✅ 로딩 진행률 (0~100)
    ws.on("loading", (pct) => {
      setIsLoadingWave(true);
      setLoadingPct(typeof pct === "number" ? pct : null);
    });

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());

      const st = usePlayerStore.getState();
      ws.setPlaybackRate(st.playbackRate);
      ws.setVolume(st.volume);
      ws.zoom(st.zoomPps);

      setIsLoadingWave(false);
      setLoadingPct(null);

      syncRegionInteractivity();
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

      if (typeof ws.isPlaying === "function" && !ws.isPlaying()) return;

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

    // ✅ 터치 환경에서는 롱프레스 contextmenu 동작을 굳이 막지 않음
    const onContextMenu = (e: MouseEvent) => {
      if (!isTouchLike) e.preventDefault();
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

    // ✅ ESC 키로 구간 초기화
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget = tag === "input" || tag === "textarea" || tag === "select" || (target as any)?.isContentEditable;

      if (isTypingTarget) return;

      const st = usePlayerStore.getState();
      const hasLoop = st.loopA != null || st.loopB != null || st.loopEnabled;

      if (!hasLoop && !rbSelectingRef.current) return;

      e.preventDefault();
      resetLoopAll();
    };

    wrapperEl.addEventListener("contextmenu", onContextMenu);
    wrapperEl.addEventListener("pointerdown", onPointerDown);
    wrapperEl.addEventListener("pointermove", onPointerMove);
    wrapperEl.addEventListener("pointerup", finishRightDrag);
    wrapperEl.addEventListener("pointercancel", finishRightDrag);
    wrapperEl.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

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
      window.removeEventListener("keydown", onKeyDown);

      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      setWs(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouchLike]);

  // ✅ 터치 환경 전환 시 기존 region drag/resize를 즉시 반영
  useEffect(() => {
    syncRegionInteractivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouchLike]);

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

    if (audioUrl) {
      setIsLoadingWave(true);
      setLoadingPct(null);
      ws.load(audioUrl);
    } else {
      setIsLoadingWave(false);
      setLoadingPct(null);
    }
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
          drag: !isTouchLike,
          resize: !isTouchLike,
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
        drag: !isTouchLike,
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
        drag: !isTouchLike,
        resize: false,
        color: "rgba(244, 63, 94, 0.22)",
      });
      return;
    }
  }, [loopA, loopB, loopEnabled, isTouchLike]);

  // ✅ 칩 클릭 시 seek 위치 결정(AB일 때는 min/max 사용)
  const seekToA = () => {
    if (abText.a == null) return;
    setTime(abText.a);
  };
  const seekToB = () => {
    if (abText.b == null) return;
    setTime(abText.b);
  };

  // =====================================================================================
  // ✅ (NEW) 터치 전용: 파형 아래 A/B 드래그 핸들로 구간 리사이즈
  // =====================================================================================
  const touchTrackRef = useRef<HTMLDivElement | null>(null);
  const touchDragRef = useRef<{ which: "A" | "B" | null; pointerId: number | null }>({ which: null, pointerId: null });
  const [touchDragging, setTouchDragging] = useState<"A" | "B" | null>(null);

  const durForTouch = Math.max(0, duration || 0);
  const hasAnyAB = (abText.a != null || abText.b != null) && durForTouch > 0;

  const timeToPct = (t: number) => {
    if (durForTouch <= 0) return 0;
    const p = (t / durForTouch) * 100;
    return Math.min(100, Math.max(0, p));
  };

  const clientXToTimeOnTrack = (clientX: number) => {
    const el = touchTrackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = x / Math.max(1, rect.width);
    const clamped = Math.min(1, Math.max(0, ratio));
    return clamped * durForTouch;
  };

  const applyTouchTime = (which: "A" | "B", nextTimeRaw: number) => {
    const dur = durForTouch;
    if (dur <= 0) return;

    const snapped = snapTime(nextTimeRaw, dur);

    // ✅ A/B가 모두 있을 때는 "핸들의 정체성"이 바뀌지 않도록 A<=B로 강제
    if (which === "A") {
      if (abText.b != null) {
        const maxA = Math.max(0, abText.b - SNAP_SEC);
        const nextA = Math.min(snapped, maxA);
        setLoopA(nextA);
        resetRepeatCount();
        return;
      }
      setLoopA(snapped);
      resetRepeatCount();
      return;
    }

    // which === "B"
    if (abText.a != null) {
      const minB = Math.min(dur, abText.a + SNAP_SEC);
      const nextB = Math.max(snapped, minB);
      setLoopB(nextB);
      resetRepeatCount();
      return;
    }
    setLoopB(snapped);
    resetRepeatCount();
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = touchDragRef.current;
      if (!st.which || st.pointerId == null) return;
      if (e.pointerId !== st.pointerId) return;
      e.preventDefault();

      const t = clientXToTimeOnTrack(e.clientX);
      applyTouchTime(st.which, t);
    };

    const onUp = (e: PointerEvent) => {
      const st = touchDragRef.current;
      if (!st.which || st.pointerId == null) return;
      if (e.pointerId !== st.pointerId) return;
      e.preventDefault();

      touchDragRef.current = { which: null, pointerId: null };
      setTouchDragging(null);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });

    return () => {
      window.removeEventListener("pointermove", onMove as any);
      window.removeEventListener("pointerup", onUp as any);
      window.removeEventListener("pointercancel", onUp as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abText.a, abText.b, durForTouch, isLoadingWave]);

  const startTouchDrag = (which: "A" | "B") => (e: React.PointerEvent) => {
    if (!isTouchLike) return;
    if (isLoadingWave) return;
    if (durForTouch <= 0) return;

    e.preventDefault();

    touchDragRef.current = { which, pointerId: e.pointerId };
    setTouchDragging(which);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  // Track 탭으로도 미세 조정(가까운 핸들 이동) - UX 보너스
  const onTouchTrackTap = (e: React.PointerEvent) => {
    if (!isTouchLike) return;
    if (isLoadingWave) return;
    if (durForTouch <= 0) return;

    // 드래그 중이면 무시
    if (touchDragging) return;

    const t = clientXToTimeOnTrack(e.clientX);

    // ✅ A/B 둘 다 있으면 가까운 쪽을 이동
    if (abText.a != null && abText.b != null) {
      const da = Math.abs(t - abText.a);
      const db = Math.abs(t - abText.b);
      applyTouchTime(da <= db ? "A" : "B", t);
      return;
    }

    // ✅ 하나만 있으면 그거 이동
    if (abText.a != null) {
      applyTouchTime("A", t);
      return;
    }
    if (abText.b != null) {
      applyTouchTime("B", t);
      return;
    }
  };

  // 핸들/레인지 표시용 값
  const aPct = abText.a != null ? timeToPct(abText.a) : null;
  const bPct = abText.b != null ? timeToPct(abText.b) : null;

  const rangeLeft = abText.a != null && abText.b != null ? Math.min(aPct!, bPct!) : null;
  const rangeRight = abText.a != null && abText.b != null ? Math.max(aPct!, bPct!) : null;

  return (
    <div className="relative w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      {/* ✅ 로딩 오버레이 (파형/미니맵 위에) */}
      {isLoadingWave && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
            <div className="flex flex-col">
              <div className="text-sm font-semibold text-zinc-800">Loading audio…</div>
              <div className="text-xs text-zinc-500">
                {loadingPct != null ? `${Math.max(0, Math.min(100, Math.round(loadingPct)))}%` : "잠시만 기다려주세요"}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* ✅ (NEW) 터치 전용: 파형 아래 A/B 리사이즈 핸들 */}
      {isTouchLike && hasAnyAB && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-700">A/B 조절 (Touch)</div>
            <div className="text-[11px] text-zinc-500">아래 핸들을 드래그해서 구간을 미세 조정하세요</div>
          </div>

          <div
            ref={touchTrackRef}
            onPointerDown={onTouchTrackTap}
            className="relative h-10 w-full rounded-full border border-zinc-200 bg-white select-none">
            {/* 기준 트랙 라인 */}
            <div className="absolute top-1/2 right-2 left-2 h-1 -translate-y-1/2 rounded-full bg-zinc-200" />

            {/* AB 범위 하이라이트 */}
            {rangeLeft != null && rangeRight != null && (
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-300"
                style={{
                  left: `calc(${rangeLeft}% + 0.5rem)`,
                  width: `calc(${Math.max(0, rangeRight - rangeLeft)}% - 0rem)`,
                }}
              />
            )}

            {/* A 핸들 */}
            {aPct != null && (
              <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${aPct}% )` }}>
                <button
                  type="button"
                  onPointerDown={startTouchDrag("A")}
                  disabled={isLoadingWave}
                  className={[
                    "relative -translate-x-1/2 touch-none",
                    "h-8 w-8 rounded-full border shadow-sm",
                    "border-amber-200 bg-amber-50",
                    "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                    touchDragging === "A" ? "ring-2 ring-amber-300" : "",
                  ].join(" ")}
                  title="Drag A"
                  style={{ touchAction: "none" }}>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-amber-700">A</span>
                </button>
              </div>
            )}

            {/* B 핸들 */}
            {bPct != null && (
              <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${bPct}% )` }}>
                <button
                  type="button"
                  onPointerDown={startTouchDrag("B")}
                  disabled={isLoadingWave}
                  className={[
                    "relative -translate-x-1/2 touch-none",
                    "h-8 w-8 rounded-full border shadow-sm",
                    "border-rose-200 bg-rose-50",
                    "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                    touchDragging === "B" ? "ring-2 ring-rose-300" : "",
                  ].join(" ")}
                  title="Drag B"
                  style={{ touchAction: "none" }}>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-rose-700">B</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white px-2 py-1">A {abText.a != null ? fmtTimeCS(abText.a) : "--:--.--"}</span>
              <span className="rounded-full bg-white px-2 py-1">B {abText.b != null ? fmtTimeCS(abText.b) : "--:--.--"}</span>
              {abText.len != null && <span className="rounded-full bg-white px-2 py-1">LEN {fmtTimeCS(abText.len)}</span>}
            </div>
            <div className="text-zinc-500">탭: 가까운 핸들 이동 · 드래그: 정밀 조정 · 스냅 0.01s</div>
          </div>
        </div>
      )}

      {/* A/B 텍스트 + 클릭하면 seek */}
      <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-zinc-700">
            <button
              type="button"
              onClick={seekToA}
              disabled={abText.a == null || isLoadingWave}
              className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 hover:bg-amber-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              title={abText.a != null ? "A로 이동" : "A가 설정되지 않았습니다"}>
              A {abText.a != null ? fmtTimeCS(abText.a) : "--:--.--"}
            </button>

            <button
              type="button"
              onClick={seekToB}
              disabled={abText.b == null || isLoadingWave}
              className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              title={abText.b != null ? "B로 이동" : "B가 설정되지 않았습니다"}>
              B {abText.b != null ? fmtTimeCS(abText.b) : "--:--.--"}
            </button>

            {abText.len != null && <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">LEN {fmtTimeCS(abText.len)}</span>}
          </div>

          <div className="text-[11px] text-zinc-500">
            좌클릭: 탐색 · <b>우클릭 드래그</b>: 구간 설정 · <b>Ctrl/⌘+휠</b>: 줌 · <b>ESC</b>: 구간 초기화 · 스냅 0.01s
            {isTouchLike ? " · (터치: 파형 아래 A/B 핸들로 구간 조절)" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
