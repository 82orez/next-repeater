"use client";

// ✅ 재생목록 모달 — 폴더로 불러온 트랙 목록. 표시만 담당하고 전환은 Player에 위임한다.
//    (가드용 duration 프로브와 mediaRef가 Player에 있으므로 여기서 로드하지 않는다.)
//    ConfirmDialog와 같은 네이티브 <dialog>+showModal() 패턴 — 포커스 트랩·Esc·배경은 브라우저가 처리한다.
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { X, Captions } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";

type Props = { open: boolean; onClose: () => void; onSelect: (index: number) => void };

export default function PlaylistDialog({ open, onClose, onSelect }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);

  const playlist = usePlayerStore((s) => s.playlist);
  const playlistIndex = usePlayerStore((s) => s.playlistIndex);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // 모달 안에서 "비우기"를 누르면 목록이 비므로 스스로 닫힌다.
  // early return으로 <dialog>를 언마운트하면 close()가 불리지 않아 배경이 남을 수 있다.
  useEffect(() => {
    if (open && playlist.length === 0) onClose();
  }, [open, playlist.length, onClose]);

  return (
    <dialog
      ref={ref}
      // Esc는 dialog의 cancel 이벤트로 들어온다 — 기본 닫힘을 막고 상태를 통해 닫아야 open과 어긋나지 않는다
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // 배경(::backdrop) 클릭 시 닫기. 내용 영역 클릭은 target이 내부 요소라 걸리지 않는다
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-zinc-900/40">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">재생목록 ({playlist.length})</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={clearPlaylist}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
              title="재생목록 비우기">
              <X className="h-3 w-3" />
              비우기
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-50"
              title="닫기"
              aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ul className="max-h-[60vh] divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-100">
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
    </dialog>
  );
}
