"use client";

import React, { useEffect } from "react";
import { usePlayerStore } from "@/store/playerStore";

export default function PlayerControls() {
  const { playbackRate, setRate, ab, setA, setB, toggleAB, clearAB } = usePlayerStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Wavesurfer 인스턴스 접근은 컴포넌트 구조에 따라 props로 넘기거나 store에 넣어도 됨.
      // 여기서는 “AB 단축키”만 예시로 둡니다.
      // [ : A 설정, ] : B 설정, \ : 토글, Backspace : 초기화
      // 실제로는 현재 재생시간을 가져와야 하므로 wsRef 접근 구조를 정리해서 붙이면 됩니다.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Speed</span>
          <select className="rounded-lg border px-2 py-1 text-sm" value={playbackRate} onChange={(e) => setRate(Number(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => (
              <option key={v} value={v}>
                {v.toFixed(2)}x
              </option>
            ))}
          </select>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => toggleAB()}>
          AB Loop: {ab.enabled ? "ON" : "OFF"}
        </button>

        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => clearAB()}>
          Clear AB
        </button>

        <div className="text-xs text-gray-500">
          A: {ab.a?.toFixed(2) ?? "-"} / B: {ab.b?.toFixed(2) ?? "-"}
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">A/B 설정은 “현재 재생시간”을 넣어야 하므로, 실제 앱에서는 재생시간 getter를 연결하세요.</p>
    </div>
  );
}
