// src/lib/id.ts
export function uid() {
  // 브라우저 우선
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
