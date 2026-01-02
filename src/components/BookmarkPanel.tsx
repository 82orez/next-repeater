// src/components/BookmarkPanel.tsx
"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Tag, Trash2, LocateFixed, Repeat2 } from "lucide-react";
import { usePlayerStore, type Bookmark } from "@/store/playerStore";
import { fmtTime } from "@/lib/time";
import { uid } from "@/lib/id";

type Props = {
  className?: string;
};

export default function BookmarkPanel({ className }: Props) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);

  const bookmarks = usePlayerStore((s) => s.bookmarks);

  const addBookmark = usePlayerStore((s) => s.addBookmark);
  const removeBookmark = usePlayerStore((s) => s.removeBookmark);
  const updateBookmark = usePlayerStore((s) => s.updateBookmark);

  const setTime = usePlayerStore((s) => s.setTime);
  const setLoopA = usePlayerStore((s) => s.setLoopA);
  const setLoopB = usePlayerStore((s) => s.setLoopB);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const resetRepeatCount = usePlayerStore((s) => s.resetRepeatCount);

  const regionList = useMemo(() => {
    const filtered = bookmarks
      .filter((b) => {
        const hitQ = !q || b.label.toLowerCase().includes(q.toLowerCase()) || (b.tag ?? "").toLowerCase().includes(q.toLowerCase());
        const hitTag = !tag || (b.tag ?? "").toLowerCase() === tag.toLowerCase();
        return hitQ && hitTag;
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return filtered;
  }, [bookmarks, q, tag]);

  const tags = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookmarks) if (b.tag) s.add(b.tag);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const canAddPoint = !!audioUrl;
  const canAddRegion = !!audioUrl && loopA != null && loopB != null && loopB > loopA;

  const onAddPoint = () => {
    if (!canAddPoint) return;
    addBookmark({
      id: uid(),
      type: "POINT",
      time: currentTime,
      label: `Point @ ${fmtTime(currentTime)}`,
      tag: tag || undefined,
      createdAt: Date.now(),
    });
  };

  const onAddRegion = () => {
    if (!canAddRegion) return;
    const a = Math.min(loopA!, loopB!);
    const b = Math.max(loopA!, loopB!);
    addBookmark({
      id: uid(),
      type: "REGION",
      start: a,
      end: b,
      label: `Phrase ${fmtTime(a)} → ${fmtTime(b)}`,
      tag: tag || undefined,
      createdAt: Date.now(),
    });
  };

  const jumpTo = (b: Bookmark) => {
    if (b.type === "POINT" && typeof b.time === "number") {
      setTime(b.time);
      return;
    }
    if (b.type === "REGION" && typeof b.start === "number" && typeof b.end === "number") {
      setLoopA(b.start);
      setLoopB(b.end);
      setLoopEnabled(true);
      resetRepeatCount();
      setTime(b.start);
    }
  };

  return (
    <div className={clsx("rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">북마크 / 구간(Phrase)</div>
          <div className="mt-1 text-xs text-zinc-500">포인트 저장 또는 A–B를 Phrase로 저장하세요.</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAddPoint}
            disabled={!canAddPoint}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Plus className="h-4 w-4" />
            포인트
          </button>
          <button
            onClick={onAddRegion}
            disabled={!canAddRegion}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            <Repeat2 className="h-4 w-4" />
            Phrase
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="text-xs font-medium text-zinc-600">검색</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="label/tag 검색"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>

        <label className="block">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <Tag className="h-4 w-4" /> 태그(선택/입력)
          </div>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="예: shadowing"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
          {!!tags.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag((prev) => (prev.toLowerCase() === t.toLowerCase() ? "" : t))}
                  className={clsx(
                    "rounded-2xl border px-2.5 py-1 text-xs font-medium",
                    tag.toLowerCase() === t.toLowerCase()
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </label>
      </div>

      <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-zinc-100">
        {regionList.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">아직 저장된 북마크가 없습니다.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {regionList.map((b) => (
              <li key={b.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => jumpTo(b)} className="min-w-0 flex-1 text-left" title="클릭하면 해당 위치/구간으로 이동">
                    <div className="truncate text-sm font-semibold text-zinc-900">{b.label}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {b.type === "POINT" && typeof b.time === "number" && (
                        <span className="inline-flex items-center gap-1">
                          <LocateFixed className="h-3.5 w-3.5" /> {fmtTime(b.time)}
                        </span>
                      )}
                      {b.type === "REGION" && typeof b.start === "number" && typeof b.end === "number" && (
                        <span className="inline-flex items-center gap-1">
                          <Repeat2 className="h-3.5 w-3.5" /> {fmtTime(b.start)} → {fmtTime(b.end)} ({fmtTime(b.end - b.start)})
                        </span>
                      )}
                      {b.tag ? <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5">#{b.tag}</span> : null}
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <input
                      value={b.tag ?? ""}
                      onChange={(e) => updateBookmark(b.id, { tag: e.target.value || undefined })}
                      placeholder="tag"
                      className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      onClick={() => removeBookmark(b.id)}
                      className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                      title="삭제">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
