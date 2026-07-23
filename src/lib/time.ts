// src/lib/time.ts
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
