"use client";

// ✅ 자막 패널 — 영상 오버레이가 아니라 독립 카드.
//    "비디오 숨기기" 상태나 오디오 전용 파일에서도 동일하게 동작한다.
import clsx from "clsx";
import { X } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";
import { findCueText, type SubTrack } from "@/lib/subtitles";

// ✅ 트랙 1개의 현재 대사만 담당하는 leaf.
//    셀렉터가 "문자열"을 반환하므로 zustand가 Object.is로 비교 → 큐 경계를 넘을 때만 리렌더된다.
//    (timeupdate는 rAF 주기로 초당 ~60회 들어오지만 여기서 걸러진다. TimeReadout과 같은 전략.)
function CueLine({ track, dim }: { track: SubTrack; dim: boolean }) {
  const text = usePlayerStore((s) => findCueText(track.cues, s.currentTime));

  return (
    <p
      lang={track.lang}
      className={clsx("min-h-[1.5rem] leading-relaxed whitespace-pre-line", dim ? "text-sm text-zinc-500" : "text-base font-medium text-zinc-900")}>
      {text || <span className="text-zinc-300">·</span>}
    </p>
  );
}

export default function CaptionPanel() {
  const subs = usePlayerStore((s) => s.subs);
  const toggleSub = usePlayerStore((s) => s.toggleSub);
  const clearSubs = usePlayerStore((s) => s.clearSubs);

  // 자막이 없으면 카드 자체를 렌더하지 않는다(빈 상자 방지)
  if (subs.length === 0) return null;

  const active = subs.filter((s) => s.enabled);

  return (
    <div className="my-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">자막</span>
        {subs.map((t) => (
          <button
            key={t.id}
            onClick={() => toggleSub(t.id)}
            title={t.fileName}
            className={clsx(
              "rounded-lg border px-2 py-0.5 text-xs font-medium",
              t.enabled ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
            )}>
            {t.label}
            <span className="ml-1 font-normal opacity-60">{t.cues.length}</span>
          </button>
        ))}
        <button
          onClick={clearSubs}
          title="자막 모두 지우기"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50">
          <X className="h-3 w-3" />
          지우기
        </button>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-zinc-400">표시할 자막을 선택하세요.</p>
      ) : (
        <div className="space-y-1">
          {/* 첫 트랙을 크게, 나머지는 보조로 — 로드 순서가 곧 표시 순서 */}
          {active.map((t, i) => (
            <CueLine key={t.id} track={t} dim={i > 0} />
          ))}
        </div>
      )}
    </div>
  );
}
