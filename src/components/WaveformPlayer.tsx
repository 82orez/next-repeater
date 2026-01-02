"use client";

import React, { useEffect, useMemo, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

export default function WaveformPlayer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);

  const { audioUrl, playbackRate, ab, setPlaying, setRegionId, setCurrentTime, setDuration, setA, setB } = usePlayerStore();

  const canLoad = useMemo(() => !!audioUrl && !!containerRef.current, [audioUrl]);

  useEffect(() => {
    if (!containerRef.current) return;

    // init once
    if (!wsRef.current) {
      const regions = RegionsPlugin.create();
      regionsRef.current = regions;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        height: 120,
        normalize: true,
        backend: "WebAudio",
        plugins: [regions],
      });

      // 드래그로 구간 선택 생성
      regions.enableDragSelection({
        color: "rgba(99, 102, 241, 0.15)",
      });

      // region 생성되면 AB로 채택 + store A/B 동기화
      regions.on("region-created", (region) => {
        // 마지막으로 만든 1개만 유지
        regions.getRegions().forEach((r) => {
          if (r.id !== region.id) r.remove();
        });

        setRegionId(region.id);
        setA(region.start);
        setB(region.end);
      });

      // region 수정(드래그/리사이즈) 시 store A/B 갱신
      regions.on("region-updated", (region) => {
        const state = usePlayerStore.getState();
        if (state.ab.regionId && region.id !== state.ab.regionId) return;
        setA(region.start);
        setB(region.end);
      });

      // ✅ 루프: region-out 때 최신 store state 기준으로 동작 (stale closure 방지)
      regions.on("region-out", (region) => {
        const state = usePlayerStore.getState();
        if (!state.ab.enabled) return;
        if (state.ab.regionId && region.id !== state.ab.regionId) return;
        region.play();
      });

      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));

      // ✅ 길이/시간 store 동기화
      ws.on("ready", () => {
        setDuration(ws.getDuration() || 0);
      });

      // wavesurfer v7: timeupdate 이벤트가 있음
      const onTime = (t?: number) => {
        // timeupdate는 number를 주는 경우가 많지만, 안전하게 getCurrentTime도 사용
        const time = typeof t === "number" ? t : (ws.getCurrentTime?.() ?? 0);
        setCurrentTime(time);
      };

      ws.on("timeupdate", onTime as any);
      // 일부 환경에서는 audioprocess가 더 자주/안정적으로 들어오기도 함
      ws.on("audioprocess", onTime as any);

      wsRef.current = ws;
    }

    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load audio
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !audioUrl) return;

    ws.load(audioUrl);

    // 로드할 때 초기화
    setCurrentTime(0);
    setDuration(0);

    return () => {};
  }, [audioUrl, setCurrentTime, setDuration]);

  // playback rate
  useEffect(() => {
    wsRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  // AB (A,B 값으로 region 만들기/갱신)
  useEffect(() => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions) return;

    const { a, b } = ab;
    if (a == null || b == null) return;

    const start = Math.min(a, b);
    const end = Math.max(a, b);

    // 기존 region 제거 후 1개만 생성
    regions.getRegions().forEach((r) => r.remove());

    const region = regions.addRegion({
      start,
      end,
      color: "rgba(16, 185, 129, 0.18)",
      drag: true,
      resize: true,
    });

    setRegionId(region.id);

    // AB enabled면 바로 그 구간 재생
    if (ab.enabled) region.play();
  }, [ab.a, ab.b, ab.enabled, setRegionId]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div ref={containerRef} />
      <p className="mt-2 text-xs text-gray-500">드래그로 구간 선택 / Set A·Set B 버튼으로 현재 시간 기준 A-B 지정</p>
    </div>
  );
}
