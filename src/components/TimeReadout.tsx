"use client";

// ✅ 현재 재생 위치 / 전체 길이 표시
// - timeupdate마다 리렌더되는 범위를 이 작은 컴포넌트로 한정하기 위해 별도 파일로 분리
//   (Waveform은 currentTime을 "쓰기만" 하고 구독하지 않는 상태를 유지)
import { usePlayerStore } from "@/store/playerStore";
import { fmtTimeCS } from "@/lib/time";

export default function TimeReadout() {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  return (
    <div className="text-sm font-semibold text-zinc-900 tabular-nums">
      {fmtTimeCS(currentTime)} <span className="font-normal text-zinc-400">/ {fmtTimeCS(duration)}</span>
    </div>
  );
}
