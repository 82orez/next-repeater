// src/lib/subtitleDraft.ts
// 직접 만든/편집 중인 자막 트랙을 미디어 파일명 키로 localStorage에 보존한다.
//
// ⚠️ playerStore의 persist(partialize)에는 subs가 없다 — 자막은 미디어 종속이라 setSource가 통째로 비우기 때문.
//    그래서 되살릴 가치가 있는 "사용자가 입력한" 트랙만 여기서 따로 남긴다.
//    복원은 Player의 loadTrack(acceptFile 이후)에서 파일명이 일치할 때만 일어난다.
import type { SubTrack } from "@/lib/subtitles";

const KEY = "repeat-player-subedit-v1";
// 자막 텍스트는 작지만(1시간 분량 ~80KB) localStorage 할당량이 있으므로 최근 파일 5개분만 유지
const MAX_ENTRIES = 5;

type Entry = { savedAt: number; track: SubTrack };
type Store = Record<string, Entry>;

// localStorage 자체가 없거나(SSR) 파싱이 깨져도 편집 기능은 계속 동작해야 한다 → 조용히 빈 값
function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 할당량 초과 등 — 저장 실패가 편집을 막지는 않는다
  }
}

/** 저장된 편집 트랙(큐가 하나도 없으면 복원할 게 없으므로 null) */
export function loadDraft(mediaName: string): SubTrack | null {
  const entry = read()[mediaName];
  const track = entry?.track;
  return track && Array.isArray(track.cues) && track.cues.length > 0 ? track : null;
}

export function saveDraft(mediaName: string, track: SubTrack) {
  const store = read();
  store[mediaName] = { savedAt: Date.now(), track };

  // 최근 저장 순으로 잘라낸다
  const stale = Object.keys(store)
    .sort((a, b) => store[b].savedAt - store[a].savedAt)
    .slice(MAX_ENTRIES);
  for (const k of stale) delete store[k];

  write(store);
}

export function removeDraft(mediaName: string) {
  const store = read();
  if (!(mediaName in store)) return;
  delete store[mediaName];
  write(store);
}
