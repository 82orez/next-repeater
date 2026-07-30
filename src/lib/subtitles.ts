// src/lib/subtitles.ts
// SRT/VTT 파서·직렬화 + 큐 조회. 외부 라이브러리 없이 직접 구현.
import { pad2 } from "@/lib/time";

// ⚠️ .srt는 MIME이 비어 있거나 text/plain으로 오므로 분류는 반드시 확장자 기준(file.type 신뢰 금지)
export const SUB_EXT_RE = /\.(srt|vtt)$/i;

export type Cue = { start: number; end: number; text: string };

export type SubTrack = {
  id: string;
  label: string;
  lang?: string; // BCP-47 — <p lang>으로 넘겨 한/중/일 글꼴 렌더링을 바르게 함
  fileName: string;
  cues: Cue[];
  enabled: boolean;
};

// 방향 제어문자(LRE/RLE/PDF/LRM/RLM/isolates) — 넷플릭스 자막이 큐마다 U+202A를 붙여둔다.
// 소스에 보이지 않는 문자를 직접 넣지 않도록 \u 이스케이프 사용.
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// <i>, <b>, <font color="...">, {\an8} 등 서식 태그
const TAG_RE = /<\/?[^>]+>|\{\\[^}]*\}/g;

// 00:00:55,096 / 00:00:55.096 / 55.096 / 01:23.45 모두 허용
const TS_RE = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;
const ARROW_RE = /-->/;

function toSec(m: RegExpMatchArray): number {
  const hh = m[1] ? Number(m[1]) : 0;
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  // 밀리초 자릿수 보정: "5" → 500ms, "05" → 50ms
  const ms = Number(m[4].padEnd(3, "0"));
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function cleanText(lines: string[]): string {
  return lines
    .map((l) => l.replace(TAG_RE, "").replace(BIDI_RE, "").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/**
 * SRT/VTT 텍스트를 시간순 정렬된 큐 배열로 변환.
 * 두 포맷의 차이는 헤더(WEBVTT)·타임스탬프 구분자(`,` vs `.`)·cue setting 정도라 한 경로로 처리한다.
 * 깨진 블록은 조용히 건너뛴다(전체 실패보다 부분 로드가 낫다).
 */
export function parseSubtitles(raw: string): Cue[] {
  // BOM 제거 + 개행 정규화
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    // 타임스탬프 줄 찾기(그 앞의 시퀀스 번호·큐 식별자는 무시)
    const tsIdx = lines.findIndex((l) => ARROW_RE.test(l) && TS_RE.test(l));
    if (tsIdx === -1) continue; // WEBVTT 헤더 / NOTE / STYLE 블록

    const [left, right] = lines[tsIdx].split(ARROW_RE);
    const s = left?.match(TS_RE);
    // 오른쪽엔 cue setting(align:start position:10%)이 붙을 수 있어 첫 타임스탬프만 취함
    const e = right?.match(TS_RE);
    if (!s || !e) continue;

    const start = toSec(s);
    const end = toSec(e);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const body = cleanText(lines.slice(tsIdx + 1));
    if (!body) continue;

    cues.push({ start, end, text: body });
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/**
 * 초 → `HH:MM:SS,mmm`(SRT) / `HH:MM:SS.mmm`(VTT).
 * time.ts의 fmtTime/fmtTimeCS는 화면 표시용(시간이 0이면 생략)이라 자막 규격에는 쓸 수 없다.
 */
function stamp(sec: number, msSep: "," | "."): string {
  const totalMs = Math.round(Math.max(0, Number.isFinite(sec) ? sec : 0) * 1000);
  const hh = Math.floor(totalMs / 3_600_000);
  const mm = Math.floor((totalMs % 3_600_000) / 60_000);
  const ss = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${msSep}${String(ms).padStart(3, "0")}`;
}

// parseSubtitles가 다시 읽을 수 있는 블록(왕복 보장). 개행은 LF 고정.
function toBlocks(cues: Cue[], msSep: "," | "."): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, msSep)} --> ${stamp(c.end, msSep)}\n${c.text.trim()}\n`).join("\n");
}

/** 큐 배열 → SRT 문자열 */
export function formatSrt(cues: Cue[]): string {
  return toBlocks(cues, ",");
}

/** 큐 배열 → VTT 문자열(헤더 + 밀리초 구분자만 다름) */
export function formatVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${toBlocks(cues, ".")}`;
}

/**
 * 시각 t에 해당하는 큐 텍스트(없으면 "").
 * ⚠️ 반드시 순수 이진 탐색이어야 한다 — A–B 루프 재시작(Waveform의 play(a))은 시간을
 *    뒤로 점프시키므로, 포인터를 전진시키는 방식은 되감김마다 desync 된다.
 */
export function findCueText(cues: Cue[], t: number): string {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c.text;
  }
  return "";
}

// 파일명 언어 코드 → [표시 라벨, BCP-47]
const LANGS: Record<string, [string, string]> = {
  kor: ["한국어", "ko"],
  ko: ["한국어", "ko"],
  eng: ["English", "en"],
  en: ["English", "en"],
  jpn: ["日本語", "ja"],
  ja: ["日本語", "ja"],
  chi: ["中文", "zh"],
  zh: ["中文", "zh"],
  spa: ["Español", "es"],
  fre: ["Français", "fr"],
  ger: ["Deutsch", "de"],
};

/** "Inventing.Anna.S01E01.720p.kor.srt" → { label: "한국어", lang: "ko" } (못 찾으면 파일명) */
export function labelFromFileName(name: string): { label: string; lang?: string } {
  const base = name.replace(SUB_EXT_RE, "");
  const parts = base.split(/[.\-_]/);
  // 뒤에서부터 훑는다 — 언어 코드는 보통 확장자 바로 앞에 붙는다
  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = LANGS[parts[i].toLowerCase()];
    if (hit) return { label: hit[0], lang: hit[1] };
  }
  return { label: base.slice(-24) };
}
