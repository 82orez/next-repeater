"use client";

import React, { useEffect, useMemo, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import { usePlayerStore } from "@/store/playerStore";

export default function WaveformPlayer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);

  const { audioUrl, playbackRate, ab, setPlaying, setRegionId } = usePlayerStore();

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
        // 색은 UI 취향대로 조절
        color: "rgba(99, 102, 241, 0.15)",
      });

      // region 생성되면 AB로 채택
      regions.on("region-created", (region) => {
        // 사용자가 여러개 만들 수 있으니, 기존 활성 region 제거 정책을 택할 수 있음
        // 여기서는 "마지막으로 만든 1개만 유지"
        regions.getRegions().forEach((r) => {
          if (r.id !== region.id) r.remove();
        });
        setRegionId(region.id);
      });

      // 루프: region 밖으로 나가면 다시 재생
      regions.on("region-out", (region) => {
        if (!ab.enabled) return;
        if (ab.regionId && region.id !== ab.regionId) return;
        region.play();
      });

      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));

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

    return () => {
      // objectURL revoke는 audioUrl을 만든 쪽에서 관리하는 편이 안전
    };
  }, [audioUrl]);

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

    // A,B 둘 다 있어야 region 생성
    if (a == null || b == null) return;

    const start = Math.min(a, b);
    const end = Math.max(a, b);

    // 기존 활성 region 제거 후 1개만 생성
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
  }, [ab.a, ab.b]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div ref={containerRef} />
      <p className="mt-2 text-xs text-gray-500">드래그로 구간 선택 / A-B 반복 가능</p>
    </div>
  );
}
