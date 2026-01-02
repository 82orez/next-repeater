"use client";

import React, { useCallback } from "react";
import WaveformPlayer from "@/components/WaveformPlayer";
import PlayerControls from "@/components/PlayerControls";
import { usePlayerStore } from "@/store/playerStore";

export default function PlayerPage() {
  const { audioUrl, fileName, setAudio } = usePlayerStore();

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setAudio(url, file.name);
    },
    [setAudio],
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Repeat Player</h1>
          <p className="text-sm text-gray-500">Waveform + A-B loop + Speed (WorkAudioBook 스타일)</p>
        </div>

        <label className="cursor-pointer rounded-xl border bg-white px-4 py-2 text-sm shadow-sm hover:bg-gray-50">
          <input className="hidden" type="file" accept="audio/*" onChange={onPick} />
          오디오 불러오기
        </label>
      </header>

      {audioUrl ? (
        <div className="grid gap-4">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium">{fileName}</div>
            <div className="mt-1 text-xs text-gray-500">로컬 파일(Object URL) 재생</div>
          </div>

          <WaveformPlayer />
          <PlayerControls />
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">상단 버튼으로 MP3/오디오 파일을 불러오세요.</div>
      )}
    </div>
  );
}
