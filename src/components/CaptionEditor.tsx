"use client";

// ✅ 자막 직접 만들기/고치기 — A–B 구간을 큐 하나로 삼아 받아쓰기한다.
//    A–B(loopA/loopB)와 Cue(start/end)가 같은 모양이라 "구간 지정 → 입력 → 추가"가 그대로 성립한다.
//
//    ⚠️ 모달이 아니라 인라인 카드다. <dialog showModal>로 만들면 isModalOpen() 가드에 걸려
//       파형 조작(우클릭 드래그·줌)과 전역 단축키가 전부 막힌다.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Download, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { usePlayerStore } from "@/store/playerStore";
import { fmtTimeCS, MIN_LOOP_SEC } from "@/lib/time";
import { findCueIndex, findOverlapping, formatSrt, formatVtt, type Cue, type SubTrack } from "@/lib/subtitles";
import { removeDraft, saveDraft } from "@/lib/subtitleDraft";
import { uid } from "@/lib/id";

const btnBase =
  "inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

function triggerDownload(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ✅ 입력 폼 — 텍스트 state를 자기 안에 두어 타이핑이 큐 목록을 리렌더하지 않게 한다.
//    편집 대상이 바뀌면 부모가 key로 갈아끼운다(초기값 재적용).
function CueForm({
  cue,
  rangeLabel,
  canUseRange,
  onSubmit,
  onCancel,
  onApplyRange,
  onReplay,
  onPlayPause,
}: {
  cue: Cue | null;
  rangeLabel: string;
  canUseRange: boolean;
  onSubmit: (text: string) => boolean;
  onCancel: () => void;
  onApplyRange: () => void;
  onReplay: () => void;
  onPlayPause: () => void;
}) {
  const [text, setText] = useState(cue?.text ?? "");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    if (onSubmit(text)) setText("");
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span className={clsx("rounded-full px-2 py-1 font-medium", cue ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-700")}>
          {cue ? `수정 중 · ${fmtTimeCS(cue.start)} → ${fmtTimeCS(cue.end)}` : rangeLabel}
        </span>
        {cue ? (
          <button
            onClick={onApplyRange}
            disabled={!canUseRange}
            className={clsx(btnBase, "px-2 py-1 text-xs")}
            title="이 큐의 시간을 현재 A–B 구간으로 바꿉니다">
            구간을 현재 A–B로
          </button>
        ) : null}
      </div>

      {/* ⚠️ Player의 전역 keydown은 textarea에서 early return 한다(입력을 가로채면 안 되므로).
          그래서 받아쓰기에 꼭 필요한 조작만 여기서 Ctrl 조합으로 다시 제공한다. */}
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (mod && e.key === "Enter") {
            e.preventDefault();
            submit();
            return;
          }
          if (mod && e.code === "Space") {
            e.preventDefault();
            onPlayPause();
            return;
          }
          if (mod && e.key === "ArrowLeft") {
            e.preventDefault();
            onReplay();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setText("");
            onCancel();
          }
        }}
        rows={2}
        placeholder="들리는 대로 입력하세요 (Ctrl+Enter: 저장)"
        className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={!cue && !canUseRange}
          className={clsx(
            "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60",
            cue ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-900 hover:bg-zinc-800",
          )}
          title={cue ? "수정 내용 반영 (Ctrl+Enter)" : "현재 A–B 구간을 자막 한 줄로 추가 (Ctrl+Enter)"}>
          {cue ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {cue ? "수정 반영" : "구간 추가"}
        </button>
        {cue ? (
          <button onClick={onCancel} className={btnBase}>
            <X className="h-4 w-4" />
            취소
          </button>
        ) : null}
        <span className="text-[11px] text-zinc-500">Ctrl+Space: 재생/일시정지 · Ctrl+←: A부터 다시 듣기</span>
      </div>
    </div>
  );
}

// ✅ 큐 목록 — 현재 재생 중인 큐를 강조한다.
//    셀렉터가 "문자열"(큐 id)을 반환하므로 rAF 주기의 timeupdate 중 큐 경계에서만 리렌더된다(CaptionPanel과 같은 전략).
function CueList({
  track,
  editingId,
  onEdit,
  onPlay,
  onDelete,
}: {
  track: SubTrack;
  editingId: string | null;
  onEdit: (c: Cue) => void;
  onPlay: (c: Cue) => void;
  onDelete: (c: Cue) => void;
}) {
  const cues = track.cues;
  const activeId = usePlayerStore((s) => {
    const i = findCueIndex(cues, s.currentTime);
    return i < 0 ? "" : (cues[i].id ?? "");
  });

  const listRef = useRef<HTMLDivElement | null>(null);

  // 재생 중인 큐가 보이도록 목록만 스크롤한다.
  // ⚠️ scrollIntoView는 조상 스크롤 컨테이너(=페이지)까지 움직이므로 쓰지 않는다.
  useEffect(() => {
    const box = listRef.current;
    if (!box || !activeId) return;
    const row = box.querySelector<HTMLElement>(`[data-cue="${activeId}"]`);
    if (!row) return;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 8;
  }, [activeId]);

  if (cues.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-zinc-400">아직 만든 자막이 없습니다. 구간을 잡고 위에 입력해 보세요.</p>;
  }

  return (
    <div ref={listRef} className="max-h-72 overflow-y-auto">
      <ul className="divide-y divide-zinc-100">
        {cues.map((c, i) => (
          <li
            key={c.id ?? i}
            data-cue={c.id}
            className={clsx(
              "flex items-start gap-3 px-1 py-2",
              c.id === editingId ? "bg-blue-50/60" : c.id === activeId ? "bg-amber-50/60" : "hover:bg-zinc-50",
            )}>
            <span className="w-6 shrink-0 pt-0.5 text-right text-[11px] text-zinc-400">{i + 1}</span>
            <span className="w-[9.5rem] shrink-0 pt-0.5 font-mono text-[11px] text-zinc-500">
              {fmtTimeCS(c.start)} → {fmtTimeCS(c.end)}
            </span>
            <span lang={track.lang} className="min-w-0 flex-1 text-sm whitespace-pre-line text-zinc-900">
              {c.text}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => onPlay(c)}
                title="이 구간 듣기 (A–B로 지정)"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                <Play className="h-4 w-4" />
              </button>
              <button
                onClick={() => onEdit(c)}
                title="내용·시간 수정"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => onDelete(c)} title="삭제" className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CaptionEditor() {
  const mediaUrl = usePlayerStore((s) => s.mediaUrl);
  const fileName = usePlayerStore((s) => s.fileName);
  const subs = usePlayerStore((s) => s.subs);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

  const createEditTrack = usePlayerStore((s) => s.createEditTrack);
  const setTrackCues = usePlayerStore((s) => s.setTrackCues);
  const removeTrack = usePlayerStore((s) => s.removeTrack);

  const setLoopRange = usePlayerStore((s) => s.setLoopRange);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);
  const setTime = usePlayerStore((s) => s.setTime);
  const play = usePlayerStore((s) => s.play);
  const playPause = usePlayerStore((s) => s.playPause);

  const track = subs.find((s) => s.editable) ?? null;
  const others = subs.filter((s) => !s.editable);

  const [editingId, setEditingId] = useState<string | null>(null);
  // 교체 확인 대기 중인 원본("new" = 빈 트랙으로 새로 시작)
  const [pendingSource, setPendingSource] = useState<SubTrack | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editingCue = track?.cues.find((c) => c.id === editingId) ?? null;

  // ✅ 자동 보존 — 편집 트랙이 바뀔 때마다 디바운스 저장(파일명이 곧 복원 키)
  useEffect(() => {
    if (!track || !fileName) return;
    const id = window.setTimeout(() => saveDraft(fileName, track), 600);
    return () => window.clearTimeout(id);
  }, [track, fileName]);

  // 트랙이 사라지면(삭제·파일 교체) 편집 대상도 놓아준다
  useEffect(() => {
    if (!track && editingId) setEditingId(null);
  }, [track, editingId]);

  if (!mediaUrl) return null;

  // A–B 구간 = 큐 후보. canLoop(Player)와 같은 기준(MIN_LOOP_SEC)을 써야 한다.
  const range = loopA != null && loopB != null ? { a: Math.min(loopA, loopB), b: Math.max(loopA, loopB) } : null;
  const canUseRange = range != null && range.b - range.a > MIN_LOOP_SEC;
  const rangeLabel = canUseRange ? `구간 ${fmtTimeCS(range!.a)} → ${fmtTimeCS(range!.b)}` : "파형에서 우클릭 드래그로 구간을 지정하세요";

  const baseName = (fileName ?? "subtitle").replace(/\.[^.]+$/, "");

  const startTrack = (source: SubTrack | "new") => {
    const from = source === "new" ? null : source;
    // ⚠️ fileName은 addSubs의 중복 판정 키다 — 실제 자막 파일과 같은 이름을 쓰면
    //    드래프트 복원이 불러온 자막을 밀어낸다. 그래서 접미사를 붙여 충돌을 피한다(다운로드 이름과는 무관).
    createEditTrack(from ? `${from.label} 편집본` : "내 자막", `${baseName}.직접입력.srt`, from?.cues ?? []);
    setEditingId(null);
    setPendingSource(null);
  };

  const requestStart = (source: SubTrack | "new") => {
    // 입력해 둔 큐가 있으면 말없이 날리지 않는다
    if (track && track.cues.length > 0) {
      setPendingSource(source);
      return;
    }
    startTrack(source);
  };

  const submitCue = (raw: string): boolean => {
    if (!track) return false;
    const text = raw.trim();
    if (!text) {
      toast.warning("자막 내용을 입력해 주세요.");
      return false;
    }

    // 수정: 시간은 그대로 두고 내용만 바꾼다(시간 변경은 "구간을 현재 A–B로")
    if (editingCue) {
      setTrackCues(
        track.id,
        track.cues.map((c) => (c.id === editingCue.id ? { ...c, text } : c)),
      );
      setEditingId(null);
      return true;
    }

    if (!canUseRange) {
      toast.warning("먼저 A–B 구간을 지정해 주세요.");
      return false;
    }
    const hit = findOverlapping(track.cues, range!.a, range!.b);
    if (hit) {
      toast.warning(`${fmtTimeCS(hit.start)} 자막과 구간이 겹칩니다. 구간을 조정해 주세요.`);
      return false;
    }

    setTrackCues(track.id, [...track.cues, { id: uid(), start: range!.a, end: range!.b, text }]);
    return true;
  };

  // 편집 중인 큐의 시간을 현재 A–B로 교정
  const applyRangeToCue = () => {
    if (!track || !editingCue || !canUseRange) return;
    const hit = findOverlapping(track.cues, range!.a, range!.b, editingCue.id);
    if (hit) {
      toast.warning(`${fmtTimeCS(hit.start)} 자막과 구간이 겹칩니다.`);
      return;
    }
    setTrackCues(
      track.id,
      track.cues.map((c) => (c.id === editingCue.id ? { ...c, start: range!.a, end: range!.b } : c)),
    );
    toast.success("구간을 반영했습니다.");
  };

  // 큐 듣기 = 그 큐를 A–B로 지정하고 A부터 재생(문장 이동 버튼과 같은 방식)
  const playCue = (c: Cue) => {
    setLoopRange(c.start, c.end);
    resetRepeatCount();
    setTime(c.start);
    play();
  };

  const replayFromA = () => {
    if (!range) return;
    setTime(range.a);
    play();
  };

  const deleteCue = (c: Cue) => {
    if (!track) return;
    if (editingId === c.id) setEditingId(null);
    setTrackCues(
      track.id,
      track.cues.filter((x) => x.id !== c.id),
    );
  };

  const download = (kind: "srt" | "vtt") => {
    if (!track || track.cues.length === 0) return;
    triggerDownload(kind === "srt" ? formatSrt(track.cues) : formatVtt(track.cues), `${baseName}.${kind}`);
  };

  const dropTrack = () => {
    if (track) removeTrack(track.id);
    if (fileName) removeDraft(fileName);
    setEditingId(null);
    setConfirmDelete(false);
  };

  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-zinc-900">자막 만들기</div>
        {track ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">{track.cues.length}줄</span> : null}

        {/* 시작 버튼은 편집 중에도 남긴다 — 도중에 다른 자막을 원본으로 삼을 수 있어야 하고,
            덮어쓰기는 requestStart의 확인 모달이 막는다 */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => requestStart("new")} className={btnBase} title="빈 자막을 만들어 받아쓰기 시작">
            <Plus className="h-4 w-4" />새 자막 만들기
          </button>
          {/* 불러온 자막을 원본 삼아 편집(사본이므로 원본 트랙은 그대로 남는다) */}
          {others.map((t) => (
            <button key={t.id} onClick={() => requestStart(t)} className={btnBase} title={`${t.fileName}을(를) 복사해 편집합니다`}>
              <Pencil className="h-4 w-4" />
              {t.label} 편집
            </button>
          ))}
          {track ? (
            <>
              <button onClick={() => download("srt")} disabled={track.cues.length === 0} className={btnBase} title="SRT 파일로 저장">
                <Download className="h-4 w-4" />
                SRT 저장
              </button>
              <button onClick={() => download("vtt")} disabled={track.cues.length === 0} className={btnBase} title="VTT 파일로 저장">
                <Download className="h-4 w-4" />
                VTT 저장
              </button>
              <button onClick={() => setConfirmDelete(true)} className={btnBase} title="편집 중인 자막을 버립니다">
                <Trash2 className="h-4 w-4" />
                버리기
              </button>
            </>
          ) : null}
        </div>
      </div>

      {track ? (
        <>
          <CueForm
            // 편집 대상이 바뀌면 폼을 새로 만든다(초기 텍스트 재적용)
            key={editingCue?.id ?? "new"}
            cue={editingCue}
            rangeLabel={rangeLabel}
            canUseRange={canUseRange}
            onSubmit={submitCue}
            onCancel={() => setEditingId(null)}
            onApplyRange={applyRangeToCue}
            onReplay={replayFromA}
            onPlayPause={playPause}
          />
          <div className="mt-3 border-t border-zinc-100 pt-1">
            <CueList track={track} editingId={editingId} onEdit={(c) => setEditingId(c.id ?? null)} onPlay={playCue} onDelete={deleteCue} />
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-500">
          A–B 구간을 잡고 들리는 대로 입력하면 자막이 만들어집니다. 만든 자막은 자동 보존되고 SRT/VTT로 저장할 수 있어요.
        </p>
      )}

      <ConfirmDialog
        open={pendingSource != null}
        title="편집 중인 자막을 버릴까요?"
        description={`저장하지 않은 자막 ${track?.cues.length ?? 0}줄이 사라집니다. 필요하면 취소 후 먼저 SRT로 저장하세요.`}
        confirmLabel="버리고 새로 시작"
        onConfirm={() => pendingSource && startTrack(pendingSource)}
        onCancel={() => setPendingSource(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="편집 중인 자막을 버릴까요?"
        description={`자막 ${track?.cues.length ?? 0}줄과 자동 보존된 내용이 함께 삭제됩니다.`}
        confirmLabel="버리기"
        onConfirm={dropTrack}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
