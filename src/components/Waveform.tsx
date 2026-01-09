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

// ✅ 모바일 long-press 리사이즈
const LONG_PRESS_MS = 420; // 길게 누름 기준
const EDGE_HIT_PX = 18; // 가장자리 판정(px)
const MOVE_CANCEL_PX = 8; // long-press 취소 이동량(px)
const MIN_LOOP_LEN = 0.05; // 최소 구간 길이(초)

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

  // ✅ repeatCount +2 방지: “루프 재시작이 완료될 때까지” guard 유지
  const loopPendingRef = useRef<{ b: number } | null>(null);

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

  // ✅ 터치 기반 감지: (hover none) 또는 (pointer coarse)
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

  // ✅ 모바일 long-press 리사이즈 상태
  const lpTimerRef = useRef<number | null>(null);
  const lpStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const touchResizeRef = useRef<{
    active: boolean;
    pointerId: number | null;
    side: "start" | "end" | null;
    region: any | null;
  }>({ active: false, pointerId: null, side: null, region: null });

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

  // ✅ 터치 환경 전환 시 기존 region drag/resize 즉시 반영
  // - 모바일: drag 항상 금지
  // - 모바일: 기본 resize도 금지(우리는 long-press로만 직접 리사이즈)
  const syncRegionInteractivity = () => {
    const regions = regionsRef.current;
    if (!regions) return;

    const list = regions.getRegions();
    Object.values(list).forEach((r: any) => {
      if (!r) return;

      if (r.id === AB_REGION_ID) {
        const next = isTouchLike ? { drag: false, resize: false } : { drag: true, resize: true };
        if (typeof r?.setOptions === "function") r.setOptions(next);
        else if (typeof r?.update === "function") r.update(next);
        return;
      }

      if (r.id === MARK_A_ID || r.id === MARK_B_ID) {
        const next = isTouchLike ? { drag: false, resize: false } : { drag: true, resize: false };
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

    // 모바일 리사이즈/롱프레스도 취소
    touchResizeRef.current = { active: false, pointerId: null, side: null, region: null };
    if (lpTimerRef.current) {
      window.clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
    lpStartClientRef.current = null;

    try {
      rbTmpRegionRef.current?.remove?.();
    } catch {}
    rbTmpRegionRef.current = null;

    clearAllRegions();

    loopPendingRef.current = null;
    loopGuardRef.current = false;

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
          drag: isTouchLike ? false : true,
          resize: isTouchLike ? false : true,
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
        drag: isTouchLike ? false : true,
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
        drag: isTouchLike ? false : true,
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

      const isPlayingNow = typeof ws.isPlaying === "function" ? ws.isPlaying() : false;

      if (loopGuardRef.current && loopPendingRef.current) {
        const bp = loopPendingRef.current.b;
        const EPS_BACK = 0.01;

        if (isPlayingNow && t < bp - EPS_BACK) {
          loopPendingRef.current = null;
          loopGuardRef.current = false;
        } else {
          return;
        }
      }

      if (!isPlayingNow) return;

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
        loopPendingRef.current = { b };
        st.incRepeatCount();

        const targetVol = st.volume;
        const preRoll = Math.max(0, st.preRollSec);
        const fadeMs = Math.max(0, st.fadeMs);
        const pauseMs = Math.max(0, st.autoPauseMs);

        const jumpStart = Math.max(0, a - preRoll);

        const doJumpAndPlay = () => {
          const ws2 = wsRef.current;
          if (!ws2) return;

          if (fadeMs > 0) {
            ws2.setVolume(0);
            (ws2 as any).play?.(jumpStart);
            rampVolume(0, targetVol, fadeMs);
          } else {
            ws2.setVolume(targetVol);
            (ws2 as any).play?.(jumpStart);
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
      // ✅ 모바일은 기본 resize/drag를 막아두므로, 여기서 들어오는 건 (데스크톱) 위주
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

    // ---- Pointer controls (우클릭 드래그 + 모바일 long-press 리사이즈 + zoom) ----
    const wrapperEl: HTMLElement = ((ws as any).getWrapper?.() as HTMLElement) || containerRef.current!;
    // 스크롤 UX 위해 기본은 pan-y
    try {
      (wrapperEl.style as any).touchAction = "pan-y";
    } catch {}

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

    const clearLongPressTimer = () => {
      if (lpTimerRef.current) {
        window.clearTimeout(lpTimerRef.current);
        lpTimerRef.current = null;
      }
    };

    const startMobileLongPressResize = (e: PointerEvent) => {
      // ✅ 터치 환경에서만
      if (!isTouchLike) return;
      // 좌클릭(터치)만
      if (e.button !== 0) return;
      // 오디오/구간 없으면 리사이즈 불가
      const st = usePlayerStore.getState();
      if (st.loopA == null || st.loopB == null) return;

      const ws2 = wsRef.current;
      const regs = regionsRef.current;
      if (!ws2 || !regs) return;

      const dur = ws2.getDuration() || 0;
      if (dur <= 0) return;

      const region = regs.getRegions()?.[AB_REGION_ID];
      if (!region) return;

      const rect = wrapperEl.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const width = Math.max(1, rect.width);

      const a = Math.min(st.loopA, st.loopB);
      const b = Math.max(st.loopA, st.loopB);

      const ax = (a / dur) * width;
      const bx = (b / dur) * width;

      // 가장자리 근처인지 판정
      const nearStart = Math.abs(px - ax) <= EDGE_HIT_PX;
      const nearEnd = Math.abs(px - bx) <= EDGE_HIT_PX;
      if (!nearStart && !nearEnd) return;

      const side: "start" | "end" = nearStart && nearEnd ? (Math.abs(px - ax) <= Math.abs(px - bx) ? "start" : "end") : nearStart ? "start" : "end";

      lpStartClientRef.current = { x: e.clientX, y: e.clientY };
      clearLongPressTimer();

      lpTimerRef.current = window.setTimeout(() => {
        // long press 발동 -> 우리가 직접 리사이즈 모드로 진입
        touchResizeRef.current = {
          active: true,
          pointerId: e.pointerId,
          side,
          region,
        };

        // 스크롤 방지 + 포인터 캡처
        try {
          e.preventDefault();
        } catch {}
        try {
          wrapperEl.setPointerCapture(e.pointerId);
        } catch {}
      }, LONG_PRESS_MS);
    };

    const onPointerDown = (e: PointerEvent) => {
      // ✅ 우클릭 드래그(A–B 선택): 데스크톱/마우스 기준
      if (e.button === 2) {
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

        return;
      }

      // ✅ 모바일: long-press로만 AB 리사이즈 허용(드래그는 계속 금지)
      startMobileLongPressResize(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      // ---- 우클릭 드래그 선택 ----
      if (rbSelectingRef.current) {
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
        return;
      }

      // ---- 모바일 long-press 대기 중: 이동하면 취소 ----
      if (isTouchLike && lpTimerRef.current && lpStartClientRef.current) {
        const dx = e.clientX - lpStartClientRef.current.x;
        const dy = e.clientY - lpStartClientRef.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          clearLongPressTimer();
          lpStartClientRef.current = null;
        }
      }

      // ---- 모바일 리사이즈 진행 중 ----
      if (isTouchLike && touchResizeRef.current.active) {
        if (touchResizeRef.current.pointerId !== e.pointerId) return;

        e.preventDefault();

        const ws2 = wsRef.current;
        const st = usePlayerStore.getState();
        const dur = ws2?.getDuration() || 0;
        if (!ws2 || dur <= 0) return;

        const a0 = st.loopA;
        const b0 = st.loopB;
        if (a0 == null || b0 == null) return;

        const curA = Math.min(a0, b0);
        const curB = Math.max(a0, b0);

        const t0 = snapTime(xToTime(e.clientX), dur);

        let nextA = curA;
        let nextB = curB;

        if (touchResizeRef.current.side === "start") {
          nextA = Math.min(t0, curB - MIN_LOOP_LEN);
        } else if (touchResizeRef.current.side === "end") {
          nextB = Math.max(t0, curA + MIN_LOOP_LEN);
        } else {
          return;
        }

        // region을 직접 업데이트(깜빡임 방지)
        const r = touchResizeRef.current.region;
        if (r) {
          setRegionTimes(r, nextA, nextB);
        }

        // 스토어도 업데이트(칩 텍스트 즉시 반영)
        st.setLoopRange(nextA, nextB);

        return;
      }
    };

    const finishRightDrag = (e: PointerEvent) => {
      // ---- 모바일 리사이즈 종료 ----
      if (isTouchLike && touchResizeRef.current.active) {
        if (touchResizeRef.current.pointerId !== e.pointerId) return;

        e.preventDefault();

        touchResizeRef.current = { active: false, pointerId: null, side: null, region: null };
        lpStartClientRef.current = null;
        clearLongPressTimer();

        try {
          wrapperEl.releasePointerCapture(e.pointerId);
        } catch {}

        // 조정 완료 → 반복 카운트 reset
        resetRepeatCount();
        return;
      }

      // ---- long-press 대기만 하다가 끝나면 타이머 정리 ----
      if (isTouchLike) {
        clearLongPressTimer();
        lpStartClientRef.current = null;
      }

      // ---- 우클릭 드래그 종료 ----
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

      if (!hasLoop && !rbSelectingRef.current && !touchResizeRef.current.active) return;

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

      clearLongPressTimer();

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

    loopPendingRef.current = null;
    loopGuardRef.current = false;

    // 모바일 리사이즈 상태도 리셋
    touchResizeRef.current = { active: false, pointerId: null, side: null, region: null };
    if (lpTimerRef.current) {
      window.clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
    lpStartClientRef.current = null;

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
    // ✅ 모바일 리사이즈 진행 중이면, clear/add로 깜빡이지 않도록 건너뜀
    if (touchResizeRef.current.active) return;

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
          drag: isTouchLike ? false : true, // ✅ 모바일 drag 금지
          resize: isTouchLike ? false : true, // ✅ 모바일 기본 resize 금지(롱프레스만)
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
        drag: isTouchLike ? false : true,
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
        drag: isTouchLike ? false : true,
        resize: false,
        color: "rgba(244, 63, 94, 0.22)",
      });
      return;
    }
  }, [loopA, loopB, loopEnabled, isTouchLike]);

  // ✅ 칩 클릭 시 seek
  const seekToA = () => {
    if (abText.a == null) return;
    setTime(abText.a);
  };
  const seekToB = () => {
    if (abText.b == null) return;
    setTime(abText.b);
  };

  return (
    <div className="relative w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      {/* ✅ 로딩 오버레이 */}
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
            {isTouchLike ? " · (터치: 구간 이동 금지 · 구간 끝을 길게 눌러 리사이즈)" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
