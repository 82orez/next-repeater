"use client";

// ✅ 자막 패널 — 영상 오버레이가 아니라 독립 카드.
//    "비디오 숨기기" 상태나 오디오 전용 파일에서도 동일하게 동작한다.
import clsx from "clsx";
import { usePlayerStore } from "@/store/playerStore";
import { findCueText, type SubTrack } from "@/lib/subtitles";

// ✅ 트랙 1개의 현재 대사만 담당하는 leaf.
//    셀렉터가 "문자열"을 반환하므로 zustand가 Object.is로 비교 → 큐 경계를 넘을 때만 리렌더된다.
//    (timeupdate는 rAF 주기로 초당 ~60회 들어오지만 여기서 걸러진다. TimeReadout과 같은 전략.)
function CueLine({ track }: { track: SubTrack }) {
  const text = usePlayerStore((s) => findCueText(track.cues, s.currentTime));

  return (
    <p lang={track.lang} className="min-h-[1.5rem] text-base leading-relaxed font-medium whitespace-pre-line text-zinc-900">
      {text || <span className="text-zinc-300">·</span>}
    </p>
  );
}

// ✅ 트랙 태그 = 토글 버튼. 켜진 트랙은 자기 칸 위에, 꺼진 트랙은 윗줄에 렌더되므로
//    두 자리에서 같은 마크업을 쓴다.
function TrackChip({ track, onToggle }: { track: SubTrack; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={track.fileName}
      className={clsx(
        "rounded-lg border px-2 py-0.5 text-xs font-medium",
        track.enabled ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
      )}>
      {track.label}
      <span className="ml-1 font-normal opacity-60">{track.cues.length}</span>
    </button>
  );
}

export default function CaptionPanel() {
  const subs = usePlayerStore((s) => s.subs);
  const toggleSub = usePlayerStore((s) => s.toggleSub);
  const showCaptions = usePlayerStore((s) => s.showCaptions);

  // 자막이 없으면 카드 자체를 렌더하지 않는다(빈 상자 방지)
  if (subs.length === 0) return null;
  // 가림 토글은 Player 상단 버튼 줄에 있다 — 카드 밖이라 여기서 통째로 빠져도 다시 켤 수 있다
  if (!showCaptions) return null;

  const active = subs.filter((s) => s.enabled);
  // 켜진 트랙의 태그는 각자의 칸으로 내려가므로, 윗줄에는 꺼진 트랙만 남긴다.
  // (칸이 없는 트랙을 다시 켤 유일한 통로라 반드시 어딘가엔 있어야 한다.)
  const inactive = subs.filter((s) => !s.enabled);

  return (
    <div className="my-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* 윗줄엔 꺼진 트랙만 → 하나도 없으면 렌더하지 않는다(빈 div의 mb-3가 위쪽 여백으로 남는다) */}
      {inactive.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {inactive.map((t) => (
            <TrackChip key={t.id} track={t} onToggle={() => toggleSub(t.id)} />
          ))}
        </div>
      ) : null}

      {active.length === 0 ? (
        <p className="text-sm text-zinc-400">표시할 자막을 선택하세요.</p>
      ) : (
        // 켜진 트랙을 좌우로 균등 분할(로드 순서가 곧 좌→우 순서).
        // ⚠️ flex-1(= basis:0)이 아니라 grid 트랙(auto-cols-fr = minmax(0,1fr))을 쓴다 —
        //    flex 는 border-box 기준이라 구분선 쪽 pl-4 가 그 칸의 폭에 얹혀 첫 칸만 17px 좁아진다.
        //    1fr 트랙은 패딩과 무관하게 정확히 균등하고, 개수가 몇이든 자동으로 늘어난다.
        //    좁은 화면에선 grid-flow-row(기본)로 남아 기존 세로 배치가 유지된다.
        <div className="grid gap-1 sm:auto-cols-fr sm:grid-flow-col sm:gap-4">
          {active.map((t, i) => (
            <div key={t.id} className={clsx("min-w-0", i > 0 && "sm:border-l sm:border-zinc-100 sm:pl-4")}>
              {/* 태그를 열 머리글로 — 높이가 칸마다 같아서 대사 첫 줄이 자동으로 가로 정렬된다 */}
              <div className="mb-1.5">
                <TrackChip track={t} onToggle={() => toggleSub(t.id)} />
              </div>
              <CueLine track={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
