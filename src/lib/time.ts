// src/lib/time.ts

// ✅ A–B 구간으로 인정하는 최소 길이(초).
//    ⚠️ Player의 `canLoop`(UI 활성 판정)과 Waveform의 루프 실행 판정이 **반드시 같은 값**을 써야 한다.
//    어긋나면(예: UI는 0.05, 엔진은 `b > a`) 0 < 길이 ≤ 0.05인 구간에서
//    "반복 토글은 비활성인데 루프는 도는" 탈출 불가 상태가 된다.
//    실제로 유튜브 자동생성 자막의 10ms roll-up 큐가 이 상태를 만들었다.
export const MIN_LOOP_SEC = 0.05;

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ✅ 1시간 미만: 3:45 / 1시간 이상: 1:24:33
export function fmtTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
}

// ✅ centisecond(1/100초)까지 — 1시간 미만: 01:23.45 / 1시간 이상: 1:24:33.45
export function fmtTimeCS(sec: number) {
  if (!Number.isFinite(sec)) return "00:00.00";
  const totalCs = Math.round(Math.max(0, sec) * 100);
  const hh = Math.floor(totalCs / (3600 * 100));
  const mm = Math.floor((totalCs % (3600 * 100)) / (60 * 100));
  const ss = Math.floor((totalCs % (60 * 100)) / 100);
  const cs = totalCs % 100;
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}.${pad2(cs)}` : `${pad2(mm)}:${pad2(ss)}.${pad2(cs)}`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
