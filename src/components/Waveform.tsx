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

  // store actions (stable)
  const setWs = usePlayerStore((s) => s.setWs);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);

  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  // store state used for sync effects
  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

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

      // 최신 store값으로 적용
      const st = usePlayerStore.getState();
      ws.setPlaybackRate(st.playbackRate);
      ws.setVolume(st.volume);
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    // ✅ 핵심: timeupdate에서 항상 최신 store 상태를 읽는다!
    ws.on("timeupdate", (t) => {
      setCurrentTime(t);

      const st = usePlayerStore.getState();
      const a = st.loopA;
      const b = st.loopB;

      if (!st.loopEnabled || a == null || b == null || b <= a) return;
      if (loopGuardRef.current) return;

      if (t >= b) {
        // 반복 횟수 제한
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
          // 재생 중이면 그대로 계속 재생됨 (WaveSurfer 동작)
          loopGuardRef.current = false;
        }
      }
    });

    // region drag → AB set
    const syncFromRegion = (r: any) => {
      const start = Math.max(0, r.start ?? 0);
      const end = Math.max(0, r.end ?? 0);
      if (end <= start) return;

      setLoopA(start);
      setLoopB(end);
      setLoopEnabled(true);
      resetRepeatCount();
    };

    // ✅ AB_REGION_ID(코드로 그리는 region)는 created에서 무시 (토글/반복 꼬임 방지)
    regions.on("region-created", (r: any) => {
      if (r.id === AB_REGION_ID) return;

      // 사용자 드래그로 만든 region 하나만 유지(AB 제외)
      Object.values(regions.getRegions()).forEach((x: any) => {
        if (x.id !== r.id && x.id !== AB_REGION_ID) x.remove();
      });

      syncFromRegion(r);
    });

    // AB region을 사용자가 드래그/리사이즈하면 updated로 반영
    regions.on("region-updated", (r: any) => {
      if (r.id !== AB_REGION_ID) return; // 사용자 선택 region은 created에서 처리
      syncFromRegion(r);
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
    const regions = regionsRef.current;
    if (!ws) return;

    setReady(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);

    if (regions) {
      Object.values(regions.getRegions()).forEach((r: any) => r.remove());
    }

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

  // show AB region on waveform (loopA/loopB)
  useEffect(() => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions) return;

    // remove previous AB region
    const existing = regions.getRegions()[AB_REGION_ID] as any;
    if (existing) existing.remove();

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
      <p className="mt-2 text-xs text-zinc-500">파형을 드래그하면 A–B 구간이 선택되고 반복이 켜집니다.</p>
    </div>
  );
}
