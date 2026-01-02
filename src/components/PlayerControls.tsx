"use client";

import React, { useEffect, useMemo } from "react";
import { usePlayerStore } from "@/store/playerStore";

function fmt(t: number) {
  if (!Number.isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerControls() {
  const { playbackRate, setRate, ab, setA, setB, toggleAB, clearAB, currentTime, duration } = usePlayerStore();

  const currentLabel = useMemo(() => `${fmt(currentTime)} / ${fmt(duration)}`, [currentTime, duration]);

  const onSetA = () => setA(currentTime);
  const onSetB = () => setB(currentTime);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력창에서는 단축키 무시
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as any)?.isContentEditable) return;

      if (e.key === "[") {
        e.preventDefault();
        setA(usePlayerStore.getState().currentTime);
      } else if (e.key === "]") {
        e.preventDefault();
        setB(usePlayerStore.getState().currentTime);
      } else if (e.key === "\\") {
        e.preventDefault();
        toggleAB();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        clearAB();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setA, setB, toggleAB, clearAB]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-gray-500">{currentLabel}</div>

        <div className="h-6 w-px bg-gray-200" />

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

        {/* ✅ 현재 재생시간으로 A/B 지정 */}
        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={onSetA} title="단축키: [">
          Set A
        </button>

        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={onSetB} title="단축키: ]">
          Set B
        </button>

        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={toggleAB} title="단축키: \\">
          AB Loop: {ab.enabled ? "ON" : "OFF"}
        </button>

        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={clearAB} title="단축키: Backspace">
          Clear AB
        </button>

        <div className="text-xs text-gray-500">
          A: {ab.a != null ? fmt(ab.a) : "-"} / B: {ab.b != null ? fmt(ab.b) : "-"}
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">단축키: [ = Set A, ] = Set B, \ = AB 토글, Backspace = Clear</p>
    </div>
  );
}
