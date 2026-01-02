// src/store/playerStore.ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type WaveSurfer from "wavesurfer.js";

export type Bookmark = {
  id: string;
  type: "POINT" | "REGION";
  time?: number; // POINT
  start?: number; // REGION
  end?: number; // REGION
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
  // wavesurfer handle (persist 제외)
  ws: WaveSurfer | null;
  setWs: (ws: WaveSurfer | null) => void;

  // source
  audioUrl: string | null;
  fileName: string | null;

  // playback
  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number; // 0.5 ~ 2.0
  volume: number; // 0 ~ 1

  // A-B loop
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  autoPauseMs: number; // 반복 사이 자동 멈춤
  repeatTarget: number; // 0이면 무제한
  repeatCount: number;

  // data
  bookmarks: Bookmark[];
  recent: RecentItem[];

  // actions (state setters)
  setSource: (payload: { audioUrl: string; fileName?: string | null }) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (t: number) => void;

  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;

  setLoopA: (t: number | null) => void;
  setLoopB: (t: number | null) => void;
  setLoopEnabled: (v: boolean) => void;
  setAutoPauseMs: (ms: number) => void;
  setRepeatTarget: (n: number) => void;
  incRepeatCount: () => void;
  resetRepeatCount: () => void;

  // bookmarks
  addBookmark: (b: Bookmark) => void;
  updateBookmark: (id: string, patch: Partial<Bookmark>) => void;
  removeBookmark: (id: string) => void;

  // recent
  upsertRecent: (item: { fileName: string; audioUrl: string; lastTime: number }) => void;
  updateRecentTime: (audioUrl: string, lastTime: number) => void;

  // wavesurfer controls
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

      setLoopA: (loopA) => set({ loopA }),
      setLoopB: (loopB) => set({ loopB }),
      setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
      setAutoPauseMs: (autoPauseMs) => set({ autoPauseMs }),
      setRepeatTarget: (repeatTarget) => set({ repeatTarget }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

      addBookmark: (b) => set({ bookmarks: [b, ...get().bookmarks] }),
      updateBookmark: (id, patch) =>
        set({
          bookmarks: get().bookmarks.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }),
      removeBookmark: (id) => set({ bookmarks: get().bookmarks.filter((x) => x.id !== id) }),

      upsertRecent: (item) => {
        const next: RecentItem[] = [
          {
            fileName: item.fileName,
            audioUrl: item.audioUrl,
            lastTime: item.lastTime,
            lastOpenedAt: Date.now(),
          },
          ...get().recent.filter((r) => r.audioUrl !== item.audioUrl),
        ].slice(0, 10);
        set({ recent: next });
      },

      updateRecentTime: (audioUrl, lastTime) =>
        set({
          recent: get().recent.map((r) => (r.audioUrl === audioUrl ? { ...r, lastTime } : r)),
        }),

      // controls
      playPause: () => {
        const ws = get().ws;
        if (!ws) return;
        ws.playPause();
      },
      play: () => {
        const ws = get().ws;
        if (!ws) return;
        ws.play();
      },
      pause: () => {
        const ws = get().ws;
        if (!ws) return;
        ws.pause();
      },
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
      name: "repeat-player-v2",
      storage,
      partialize: (s) => ({
        playbackRate: s.playbackRate,
        volume: s.volume,
        autoPauseMs: s.autoPauseMs,
        repeatTarget: s.repeatTarget,
        bookmarks: s.bookmarks,
        recent: s.recent,
      }),
    },
  ),
);
