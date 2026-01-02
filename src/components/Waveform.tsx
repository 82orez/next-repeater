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

  // store actions
  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  // store state for effects
  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

  // helper: 파형에 region 1개만 남기기
  const clearAllRegions = () => {
    const regions = regionsRef.current;
    if (!regions) return;
    Object.values(regions.getRegions()).forEach((r: any) => r.remove());
  };

  // init
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

    // ✅ timeupdate: 최신 store 상태로 A–B 반복 처리
    ws.on("timeupdate", (t) => {
      setCurrentTime(t);

      const st = usePlayerStore.getState();
      const a = st.loopA;
      const b = st.loopB;

      if (!st.loopEnabled || a == null || b == null || b <= a) return;
      if (loopGuardRef.current) return;

      if (t >= b) {
        if (st.repeatTarget > 0 && st.repeatCount >= st.repeatTarget) {
          ws.pause();
          return;
        }

        loopGuardRef.current = true;
        st.incRepeatCount();

        const jump = () => {
          const ws2 = wsRef.current;
          if (!ws2) return;
          ws2.setTime(a);
          ws2.play();
          loopGuardRef.current = false;
        };

        if (st.autoPauseMs > 0) {
          ws.pause();
          if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
          loopTimerRef.current = window.setTimeout(jump, st.autoPauseMs);
        } else {
          ws.setTime(a);
          loopGuardRef.current = false;
        }
      }
    });

    // ✅ 핵심: 드래그로 만들어진 region은 “값만 읽고 즉시 삭제”
    regions.on("region-created", (r: any) => {
      // 우리가 코드로 그리는 AB_REGION은 여기서 건드리지 않음
      if (r.id === AB_REGION_ID) return;

      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);

      // 드래그로 생성된 임시 region 제거 (이걸 안 하면 2개 보임)
      try {
        r.remove();
      } catch {}

      if (end <= start) return;

      // store에 반영
      setLoopA(start);
      setLoopB(end);
      setLoopEnabled(true);
      resetRepeatCount();

      // 파형에는 AB_REGION 1개만 다시 그리게(아래 effect가 처리하지만 즉시 정리)
      clearAllRegions();
    });

    // AB_REGION을 유저가 리사이즈/드래그하면 값 반영
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

    if (!audioUrl) return;
    ws.load(audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // sync rate & volume
  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    wsRef.current?.setVolume(volume);
  }, [volume]);

  // ✅ loopA/loopB 변경 시: region은 “딱 1개(AB_REGION)”만 유지
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;

    clearAllRegions();

    const a = loopA;
    const b = loopB;
    if (a == null || b == null || b <= a) return;

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
      <p className="mt-2 text-xs text-zinc-500">파형에서 드래그로 구간을 잡으면, 반복구간은 항상 1개만 표시됩니다.</p>
    </div>
  );
}
