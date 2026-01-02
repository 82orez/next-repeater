// src/store/playerStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Bookmark = {
  id: string;
  type: "POINT" | "REGION";
  time: number; // POINT
  start?: number; // REGION
  end?: number; // REGION
  label: string;
  tag?: string;
};

type PlayerState = {
  // source
  audioUrl: string | null;
  fileName: string | null;

  // playback
  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number; // 0.5 ~ 2.0

  // A-B loop
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  autoPauseMs: number; // 반복 사이 자동 멈춤(밀리초)
  repeatTarget: number; // 0이면 무제한
  repeatCount: number;

  // UI / data
  bookmarks: Bookmark[];
  recent: Array<{ fileName: string; audioUrl: string; lastTime: number; lastOpenedAt: number }>;

  // actions
  setSource: (payload: { audioUrl: string; fileName?: string | null }) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (t: number) => void;
  setPlaybackRate: (r: number) => void;

  setLoopA: (t: number | null) => void;
  setLoopB: (t: number | null) => void;
  setLoopEnabled: (v: boolean) => void;
  setAutoPauseMs: (ms: number) => void;
  setRepeatTarget: (n: number) => void;
  incRepeatCount: () => void;
  resetRepeatCount: () => void;

  addBookmark: (b: Bookmark) => void;
  removeBookmark: (id: string) => void;

  upsertRecent: (item: { fileName: string; audioUrl: string; lastTime: number }) => void;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      audioUrl: null,
      fileName: null,

      isReady: false,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playbackRate: 1,

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
      setPlaybackRate: (playbackRate) => set({ playbackRate }),

      setLoopA: (loopA) => set({ loopA }),
      setLoopB: (loopB) => set({ loopB }),
      setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
      setAutoPauseMs: (autoPauseMs) => set({ autoPauseMs }),
      setRepeatTarget: (repeatTarget) => set({ repeatTarget }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

      addBookmark: (b) => set({ bookmarks: [b, ...get().bookmarks] }),
      removeBookmark: (id) => set({ bookmarks: get().bookmarks.filter((x) => x.id !== id) }),

      upsertRecent: (item) => {
        const next = [
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
    }),
    {
      name: "repeat-player-v1",
      partialize: (s) => ({
        playbackRate: s.playbackRate,
        autoPauseMs: s.autoPauseMs,
        repeatTarget: s.repeatTarget,
        bookmarks: s.bookmarks,
        recent: s.recent,
      }),
    },
  ),
);
