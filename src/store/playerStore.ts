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

  // ✅ 추가: 경계 부드럽게
  preRollSec: number; // 0~2초 추천
  fadeMs: number; // 0~800ms 추천

  bookmarks: Bookmark[];
  recent: RecentItem[];

  setSource: (payload: { audioUrl: string; fileName?: string | null }) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (t: number) => void;

  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;

  // ✅ A/B 자동 정렬 포함
  setLoopA: (t: number | null) => void;
  setLoopB: (t: number | null) => void;

  setLoopEnabled: (v: boolean) => void;
  setAutoPauseMs: (ms: number) => void;
  setRepeatTarget: (n: number) => void;
  incRepeatCount: () => void;
  resetRepeatCount: () => void;

  // ✅ 추가 설정
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

      // ✅ 기본값 추천
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

      // ✅ 핵심: A/B 자동 정렬(스왑)
      setLoopA: (loopA) => {
        const b = get().loopB;
        if (loopA == null) return set({ loopA: null });
        if (b != null && loopA > b) return set({ loopA: b, loopB: loopA });
        return set({ loopA });
      },

      setLoopB: (loopB) => {
        const a = get().loopA;
        if (loopB == null) return set({ loopB: null });
        if (a != null && loopB < a) return set({ loopA: loopB, loopB: a });
        return set({ loopB });
      },

      setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
      setAutoPauseMs: (autoPauseMs) => set({ autoPauseMs }),
      setRepeatTarget: (repeatTarget) => set({ repeatTarget }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

      // ✅ 추가 설정
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
