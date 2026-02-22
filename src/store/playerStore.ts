// src/store/playerStore.ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type WaveSurfer from "wavesurfer.js";

export type MediaKind = "audio" | "video";

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
  mediaUrl: string;
  mediaKind: MediaKind;
  lastTime: number;
  lastOpenedAt: number;
};

type PlayerState = {
  ws: WaveSurfer | null;
  setWs: (ws: WaveSurfer | null) => void;

  mediaUrl: string | null;
  mediaKind: MediaKind;
  fileName: string | null;

  showVideo: boolean;
  setShowVideo: (v: boolean) => void;

  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;

  playbackRate: number;
  volume: number;

  // ✅ Zoom (pixels per second)
  zoomPps: number;
  setZoomPps: (pps: number) => void;

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

  setSource: (payload: { mediaUrl: string; mediaKind: MediaKind; fileName?: string | null }) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (t: number) => void;

  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;

  // ✅ A/B를 “한 번에” 세팅(원자적 업데이트)
  setLoopRange: (a: number | null, b: number | null) => void;

  // 기존 API 유지
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

  upsertRecent: (item: { fileName: string; mediaUrl: string; mediaKind: MediaKind; lastTime: number }) => void;
  updateRecentTime: (mediaUrl: string, lastTime: number) => void;

  playPause: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setTime: (t: number) => void;
  seekBy: (deltaSeconds: number) => void;
};

const storage = createJSONStorage(() => localStorage);

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      ws: null,
      setWs: (ws) => set({ ws }),

      mediaUrl: null,
      mediaKind: "audio",
      fileName: null,

      showVideo: true,
      setShowVideo: (v) => set({ showVideo: v }),

      isReady: false,
      isPlaying: false,
      duration: 0,
      currentTime: 0,

      playbackRate: 1.0,
      volume: 1.0,

      zoomPps: 80,
      setZoomPps: (pps) => {
        const ws = get().ws;
        if (ws) ws.zoom(pps);
        set({ zoomPps: pps });
      },

      loopEnabled: false,
      loopA: null,
      loopB: null,

      autoPauseMs: 0,
      repeatTarget: 0,
      repeatCount: 0,

      preRollSec: 0,
      fadeMs: 0,

      bookmarks: [],
      recent: [],

      setSource: ({ mediaUrl, mediaKind, fileName }) => {
        set({
          mediaUrl,
          mediaKind,
          fileName: fileName ?? null,
          isReady: false,
          isPlaying: false,
          duration: 0,
          currentTime: 0,
          loopEnabled: false,
          loopA: null,
          loopB: null,
          repeatCount: 0,
        });
      },

      setReady: (ready) => set({ isReady: ready }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setDuration: (duration) => set({ duration }),
      setCurrentTime: (t) => set({ currentTime: t }),

      setPlaybackRate: (r) => {
        const ws = get().ws;
        if (ws) ws.setPlaybackRate(r);
        set({ playbackRate: r });
      },

      setVolume: (v) => {
        const ws = get().ws;
        if (ws) ws.setVolume(v);
        set({ volume: v });
      },

      setLoopRange: (a, b) => set({ loopA: a, loopB: b }),

      setLoopA: (t) => set({ loopA: t }),
      setLoopB: (t) => set({ loopB: t }),

      setLoopEnabled: (v) => set({ loopEnabled: v }),
      setAutoPauseMs: (ms) => set({ autoPauseMs: ms }),
      setRepeatTarget: (n) => set({ repeatTarget: n }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

      setPreRollSec: (sec) => set({ preRollSec: sec }),
      setFadeMs: (ms) => set({ fadeMs: ms }),

      addBookmark: (b) => set({ bookmarks: [b, ...get().bookmarks] }),
      updateBookmark: (id, patch) => set({ bookmarks: get().bookmarks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      removeBookmark: (id) => set({ bookmarks: get().bookmarks.filter((x) => x.id !== id) }),

      upsertRecent: (item) => {
        const next: RecentItem[] = [
          { fileName: item.fileName, mediaUrl: item.mediaUrl, mediaKind: item.mediaKind, lastTime: item.lastTime, lastOpenedAt: Date.now() },
          ...get().recent.filter((r) => r.mediaUrl !== item.mediaUrl),
        ].slice(0, 10);
        set({ recent: next });
      },

      updateRecentTime: (mediaUrl, lastTime) => set({ recent: get().recent.map((r) => (r.mediaUrl === mediaUrl ? { ...r, lastTime } : r)) }),

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
        zoomPps: s.zoomPps,
        autoPauseMs: s.autoPauseMs,
        repeatTarget: s.repeatTarget,
        preRollSec: s.preRollSec,
        fadeMs: s.fadeMs,
        bookmarks: s.bookmarks,
        recent: s.recent,
        showVideo: s.showVideo,
      }),
    },
  ),
);
