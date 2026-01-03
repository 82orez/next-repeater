// src/store/playerStore.ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type WaveSurfer from "wavesurfer.js";

export type Bookmark = {
  id: string;
  type: "POINT" | "REGION";
  time?: number;
  start?: number;
  end?: number;
  label: string;
  tag?: string;
  createdAt: number;
};

type RecentItem = {
  fileName: string;
  audioUrl: string;
  lastTime: number;
  lastOpenedAt: number;
};

type PlayerState = {
  ws: WaveSurfer | null;
  setWs: (ws: WaveSurfer | null) => void;

  audioUrl: string | null;
  fileName: string | null;

  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number;
  volume: number;

  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;

  autoPauseMs: number;
  repeatTarget: number;
  repeatCount: number;

  preRollSec: number;
  fadeMs: number;

  bookmarks: Bookmark[];
  recent: RecentItem[];

  setSource: (payload: { audioUrl: string; fileName?: string | null }) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (t: number) => void;

  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;

  // ✅ NEW: A/B를 “한 번에” 세팅(원자적 업데이트)
  setLoopRange: (a: number | null, b: number | null) => void;

  // 기존 API 유지 (내부적으로 setLoopRange 사용)
  setLoopA: (t: number | null) => void;
  setLoopB: (t: number | null) => void;

  setLoopEnabled: (v: boolean) => void;
  setAutoPauseMs: (ms: number) => void;
  setRepeatTarget: (n: number) => void;
  incRepeatCount: () => void;
  resetRepeatCount: () => void;

  setPreRollSec: (sec: number) => void;
  setFadeMs: (ms: number) => void;

  addBookmark: (b: Bookmark) => void;
  updateBookmark: (id: string, patch: Partial<Bookmark>) => void;
  removeBookmark: (id: string) => void;

  upsertRecent: (item: { fileName: string; audioUrl: string; lastTime: number }) => void;
  updateRecentTime: (audioUrl: string, lastTime: number) => void;

  playPause: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setTime: (t: number) => void;
  seekBy: (deltaSeconds: number) => void;
};

const isBrowser = typeof window !== "undefined";
const storage = isBrowser ? createJSONStorage(() => localStorage) : undefined;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      ws: null,
      setWs: (ws) => set({ ws }),

      audioUrl: null,
      fileName: null,

      isReady: false,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playbackRate: 1,
      volume: 1,

      loopEnabled: false,
      loopA: null,
      loopB: null,

      autoPauseMs: 0,
      repeatTarget: 0,
      repeatCount: 0,

      preRollSec: 0.15,
      fadeMs: 120,

      bookmarks: [],
      recent: [],

      setSource: ({ audioUrl, fileName }) =>
        set({
          audioUrl,
          fileName: fileName ?? null,
          isReady: false,
          isPlaying: false,
          duration: 0,
          currentTime: 0,
          loopEnabled: false,
          loopA: null,
          loopB: null,
          repeatCount: 0,
        }),

      setReady: (isReady) => set({ isReady }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setDuration: (duration) => set({ duration }),
      setCurrentTime: (currentTime) => set({ currentTime }),

      setPlaybackRate: (playbackRate) => {
        set({ playbackRate });
        const ws = get().ws;
        if (ws) ws.setPlaybackRate(playbackRate);
      },

      setVolume: (volume) => {
        const v = Math.min(1, Math.max(0, volume));
        set({ volume: v });
        const ws = get().ws;
        if (ws) ws.setVolume(v);
      },

      // ✅ NEW: 원자적으로 A/B 세팅 (이전 구간 섞이는 문제 방지)
      setLoopRange: (a, b) => {
        if (a == null && b == null) {
          set({ loopA: null, loopB: null });
          return;
        }
        if (a != null && b != null) {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          set({ loopA: start, loopB: end });
          return;
        }
        // 한쪽만 있는 경우
        set({ loopA: a ?? null, loopB: b ?? null });
      },

      // 기존 API는 유지하되 내부적으로 setLoopRange 사용
      setLoopA: (loopA) => {
        const b = get().loopB;
        get().setLoopRange(loopA, b);
      },

      setLoopB: (loopB) => {
        const a = get().loopA;
        get().setLoopRange(a, loopB);
      },

      setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
      setAutoPauseMs: (autoPauseMs) => set({ autoPauseMs }),
      setRepeatTarget: (repeatTarget) => set({ repeatTarget }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

      setPreRollSec: (sec) => set({ preRollSec: Math.min(2, Math.max(0, sec)) }),
      setFadeMs: (ms) => set({ fadeMs: Math.min(800, Math.max(0, ms)) }),

      addBookmark: (b) => set({ bookmarks: [b, ...get().bookmarks] }),
      updateBookmark: (id, patch) => set({ bookmarks: get().bookmarks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      removeBookmark: (id) => set({ bookmarks: get().bookmarks.filter((x) => x.id !== id) }),

      upsertRecent: (item) => {
        const next: RecentItem[] = [
          { fileName: item.fileName, audioUrl: item.audioUrl, lastTime: item.lastTime, lastOpenedAt: Date.now() },
          ...get().recent.filter((r) => r.audioUrl !== item.audioUrl),
        ].slice(0, 10);
        set({ recent: next });
      },

      updateRecentTime: (audioUrl, lastTime) => set({ recent: get().recent.map((r) => (r.audioUrl === audioUrl ? { ...r, lastTime } : r)) }),

      playPause: () => get().ws?.playPause(),
      play: () => get().ws?.play(),
      pause: () => get().ws?.pause(),
      stop: () => {
        const ws = get().ws;
        if (!ws) return;
        ws.stop();
        set({ isPlaying: false, currentTime: 0 });
      },
      setTime: (t) => {
        const ws = get().ws;
        if (!ws) return;
        ws.setTime(t);
        set({ currentTime: t });
      },
      seekBy: (deltaSeconds) => {
        const ws = get().ws;
        if (!ws) return;
        const now = ws.getCurrentTime();
        const next = Math.max(0, now + deltaSeconds);
        ws.setTime(next);
        set({ currentTime: next });
      },
    }),
    {
      name: "repeat-player-v3",
      storage,
      partialize: (s) => ({
        playbackRate: s.playbackRate,
        volume: s.volume,
        autoPauseMs: s.autoPauseMs,
        repeatTarget: s.repeatTarget,
        preRollSec: s.preRollSec,
        fadeMs: s.fadeMs,
        bookmarks: s.bookmarks,
        recent: s.recent,
      }),
    },
  ),
);
