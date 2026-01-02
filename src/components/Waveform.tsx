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

  const setWs = usePlayerStore((s) => s.setWs);

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const volume = usePlayerStore((s) => s.volume);

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
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);
  const incRepeatCount = usePlayerStore((s) => s.incRepeatCount);

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
      ws.setPlaybackRate(playbackRate);
      ws.setVolume(volume);
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    ws.on("timeupdate", (t) => {
      setCurrentTime(t);

      // A-B loop enforcement
      const a = loopA;
      const b = loopB;
      if (!loopEnabled || a == null || b == null || b <= a) return;
      if (loopGuardRef.current) return;

      if (t >= b) {
        // repeat target check
        if (repeatTarget > 0 && repeatCount >= repeatTarget) {
          ws.pause();
          return;
        }

        loopGuardRef.current = true;
        incRepeatCount();

        const jump = () => {
          if (!wsRef.current) return;
          wsRef.current.setTime(a);
          wsRef.current.play();
          loopGuardRef.current = false;
        };

        if (autoPauseMs > 0) {
          ws.pause();
          if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
          loopTimerRef.current = window.setTimeout(jump, autoPauseMs);
        } else {
          ws.setTime(a);
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

    regions.on("region-created", (r: any) => {
      // 새로 만든 region 하나만 남기기(AB region 제외)
      Object.values(regions.getRegions()).forEach((x: any) => {
        if (x.id !== r.id && x.id !== AB_REGION_ID) x.remove();
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

  // ensure AB region shown on waveform when loop changes
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
      // loopEnabled 상태에 따라 색만 바꾸고 싶으면 여기서 조정
      color: loopEnabled ? "rgba(59, 130, 246, 0.18)" : "rgba(113, 113, 122, 0.14)",
    });
  }, [loopA, loopB, loopEnabled]);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} className="w-full" />
      <p className="mt-2 text-xs text-zinc-500">파형을 드래그하면 A–B 구간이 선택됩니다. (A/B 버튼으로도 지정 가능)</p>
    </div>
  );
}
