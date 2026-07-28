"use client";

// ✅ 재생목록 패널 — 폴더로 불러온 트랙 목록. 표시만 담당하고 전환은 Player에 위임한다.
//    (가드용 duration 프로브와 mediaRef가 Player에 있으므로 여기서 로드하지 않는다.)
import clsx from "clsx";
import { X, Captions } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";

type Props = { onSelect: (index: number) => void };

export default function PlaylistPanel({ onSelect }: Props) {
  const playlist = usePlayerStore((s) => s.playlist);
  const playlistIndex = usePlayerStore((s) => s.playlistIndex);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);

  // 목록이 없으면 카드 자체를 렌더하지 않는다(빈 상자 방지)
  if (playlist.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">재생목록 ({playlist.length})</span>
        <button
          onClick={clearPlaylist}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
          title="재생목록 비우기">
          <X className="h-3 w-3" />
          비우기
        </button>
      </div>

      <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-100">
        {playlist.map((item, i) => (
          <li key={item.id}>
            <button
              onClick={() => onSelect(i)}
              className={clsx(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                i === playlistIndex ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-50",
              )}
              title={item.name}>
              <span className={clsx("w-8 shrink-0 text-right text-xs tabular-nums", i === playlistIndex ? "text-blue-500" : "text-zinc-400")}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.subFiles.length > 0 && (
                <Captions className={clsx("h-4 w-4 shrink-0", i === playlistIndex ? "text-blue-500" : "text-zinc-400")} aria-label="자막 있음" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
