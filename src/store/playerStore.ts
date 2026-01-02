import { create } from "zustand";

type AB = {
  a: number | null;
  b: number | null;
  enabled: boolean;
  regionId?: string | null;
};

type PlayerState = {
  audioUrl: string | null;
  fileName: string | null;

  playbackRate: number; // 0.5 ~ 2.0
  isPlaying: boolean;

  ab: AB;

  setAudio: (audioUrl: string, fileName: string) => void;
  setRate: (rate: number) => void;
  setPlaying: (v: boolean) => void;

  setA: (t: number) => void;
  setB: (t: number) => void;
  clearAB: () => void;
  toggleAB: () => void;

  setRegionId: (id: string | null) => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  audioUrl: null,
  fileName: null,

  playbackRate: 1.0,
  isPlaying: false,

  ab: { a: null, b: null, enabled: false, regionId: null },

  setAudio: (audioUrl, fileName) =>
    set({
      audioUrl,
      fileName,
      isPlaying: false,
      ab: { a: null, b: null, enabled: false, regionId: null },
    }),

  setRate: (rate) => set({ playbackRate: rate }),
  setPlaying: (v) => set({ isPlaying: v }),

  setA: (t) => set({ ab: { ...get().ab, a: t } }),
  setB: (t) => set({ ab: { ...get().ab, b: t } }),
  clearAB: () => set({ ab: { a: null, b: null, enabled: false, regionId: null } }),
  toggleAB: () => set({ ab: { ...get().ab, enabled: !get().ab.enabled } }),
  setRegionId: (id) => set({ ab: { ...get().ab, regionId: id } }),
}));
