// src/store/playerStore.ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type WaveSurfer from "wavesurfer.js";
import type { SubTrack } from "@/lib/subtitles";

export type MediaKind = "audio" | "video";

// ⚠️ File은 직렬화되면 {}가 되므로 playlist/playlistIndex는 partialize에서 제외한다(subs와 같은 이유).
//    blob URL도 여기서 만들지 않는다 — 선택 시 Player의 acceptFile이 항상 1개만 생성·해제한다.
export type PlaylistItem = { id: string; name: string; file: File; subFiles: File[] };

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

  repeatTarget: number;
  repeatCount: number;

  recent: RecentItem[];

  // ✅ 자막 트랙(미디어 종속) — persist 대상 아님, setSource에서 초기화됨
  subs: SubTrack[];
  addSubs: (tracks: SubTrack[]) => void;
  toggleSub: (id: string) => void;
  clearSubs: () => void;

  playlist: PlaylistItem[];
  playlistIndex: number;
  setPlaylist: (items: PlaylistItem[]) => void;
  setPlaylistIndex: (i: number) => void;
  clearPlaylist: () => void;

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
  setRepeatTarget: (n: number) => void;
  incRepeatCount: () => void;
  resetRepeatCount: () => void;

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

      repeatTarget: 0,
      repeatCount: 0,

      recent: [],

      subs: [],
      // 같은 파일을 다시 고르면 교체(중복 방지)
      addSubs: (tracks) => set({ subs: [...get().subs.filter((s) => !tracks.some((t) => t.fileName === s.fileName)), ...tracks] }),
      toggleSub: (id) => set({ subs: get().subs.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) }),
      clearSubs: () => set({ subs: [] }),

      playlist: [],
      playlistIndex: -1,
      setPlaylist: (items) => set({ playlist: items, playlistIndex: -1 }),
      setPlaylistIndex: (i) => set({ playlistIndex: i }),
      clearPlaylist: () => set({ playlist: [], playlistIndex: -1 }),

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
          // ⚠️ 자막은 미디어 종속 → 새 파일을 열면 반드시 비운다.
          //    (그래서 Player의 파일 선택은 acceptFile → addSubs 순서를 지켜야 한다.)
          subs: [],
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
      setRepeatTarget: (n) => set({ repeatTarget: n }),
      incRepeatCount: () => set({ repeatCount: get().repeatCount + 1 }),
      resetRepeatCount: () => set({ repeatCount: 0 }),

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
        repeatTarget: s.repeatTarget,
        recent: s.recent,
        showVideo: s.showVideo,
      }),
    },
  ),
);
