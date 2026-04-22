# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server with Turbopack at http://localhost:3000
- `npm run build` — Production build (also Turbopack)
- `npm run start` — Serve the built app
- `npx tsc --noEmit` — TypeScript check (respecting this repo's `strict: false`, `noImplicitAny: false`)

There is no lint or test script — don't invent one.

## Architecture

Single-page Next.js 15 App Router app. `src/app/page.tsx` renders only `<Player />`; all real logic lives in `src/components` + `src/store`. Points worth knowing because they span multiple files:

- **One `<video>` element drives playback for both audio and video.** `MediaView.tsx` renders a single `<video>` (hidden when the media is audio or when the user hides video). `Player.tsx` passes its ref to `Waveform.tsx`, which hands it to WaveSurfer via `media: mediaRef.current`. This is deliberate for iOS/Safari compatibility — don't split into separate `<audio>`/`<video>` elements.

- **State lives in one Zustand store** (`src/store/playerStore.ts`) with `persist` middleware keyed `repeat-player-v3` in `localStorage`. `partialize` persists only preferences (rate/volume/zoom/preRoll/fade/autoPauseMs/repeatTarget/showVideo) + `bookmarks` + `recent`. Transient state (`ws`, `isPlaying`, `loopA`, `loopB`, `currentTime`, etc.) intentionally does not persist. **Breaking changes to the store shape require bumping the `name` key** or writing a migration.

- **WaveSurfer is owned by `Waveform.tsx`** and published to the store via `setWs`. Other components call transport through the store (`play`, `pause`, `setTime`, `seekBy`, `setPlaybackRate`, `setVolume`), which forwards to `ws`. Don't hold WaveSurfer refs outside `Waveform.tsx`.

- **A–B loop has two modes** driven by `loopEnabled`:
  - Loop ON: repeats A→B, honoring `repeatTarget`, `autoPauseMs`, `preRollSec`, `fadeMs`. Loop restart uses `play(start)` (not `setTime` + `play`) to avoid seek races. `loopGuardRef` + `loopPendingRef` prevent double-increment of `repeatCount`.
  - Loop OFF with A/B set: "one-shot" mode. `timeupdate` pauses at B and rewinds cursor to A; `play` jumps to A if playback starts outside the remaining A–B window.

- **Region interaction** (`Waveform.tsx`):
  - Left-click = seek (WaveSurfer `dragToSeek`).
  - Right-click drag = new A–B region (custom pointer handlers via `RB_TMP_ID`, commits with `setLoopRange`).
  - ESC = reset loop.
  - Ctrl/⌘ + wheel = zoom (8% step; `setZoomPps`).
  - Touch devices (`(hover: none), (pointer: coarse)`) disable region drag/resize.
  - Region times snap to 0.01s (`SNAP_SEC`); `snapApplyingRef` stops the snap correction from recursively firing `region-updated`.

- **Bookmarks** are POINT or REGION. REGION bookmarks are "phrases" and drive the prev/next phrase buttons in `Player.tsx`.

- **File loading** uses `URL.createObjectURL` with explicit revocation on change/unmount (`objectUrlRef` in `Player.tsx`). Preserve this lifecycle when editing the file-input path to avoid blob leaks.

## Conventions

- Path alias `@/*` → `./src/*` (`tsconfig.json`).
- `tsconfig.json` keeps `strict: false` and `noImplicitAny: false` intentionally — don't tighten without asking.
- Prettier (`.prettierrc`): double quotes, `tabWidth: 2`, `printWidth: 150`, `trailingComma: "all"`, `endOfLine: "crlf"`, `prettier-plugin-tailwindcss` for class sorting.
- Tailwind v4 via `@tailwindcss/postcss`; the only CSS file is `src/app/globals.css` with a single `@import "tailwindcss";`.
- All interactive components are `"use client"`; the store file is too (it touches `localStorage`).
- UI copy and inline comments are in Korean — match the existing language when editing user-facing strings in these files.
