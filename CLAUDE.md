# CLAUDE.md

이 파일은 이 저장소의 코드를 다룰 때 Claude Code (claude.ai/code)가 참고해야 할 지침을 제공합니다.

## 명령어

- `npm run dev` — Turbopack 기반 Next.js 개발 서버 실행 (http://localhost:3000)
- `npm run build` — 프로덕션 빌드 (Turbopack 사용)
- `npm run start` — 빌드된 앱 실행
- `npx tsc --noEmit` — TypeScript 타입 검사 (이 저장소의 `strict: false`, `noImplicitAny: false` 설정을 따름)

lint 스크립트와 test 스크립트는 존재하지 않습니다 — 임의로 만들지 마세요.

## 아키텍처

Next.js 15 App Router 기반의 단일 페이지 앱입니다. `src/app/page.tsx`는 오직 `<Player />`만 렌더링하며, 실제 로직은 모두 `src/components`와 `src/store`에 있습니다. 여러 파일에 걸쳐 있어 알아둘 가치가 있는 사항들:

- **하나의 `<video>` 엘리먼트가 오디오와 비디오 재생을 모두 담당합니다.** `MediaView.tsx`는 단일 `<video>`를 렌더링합니다 (미디어가 오디오이거나 사용자가 비디오를 숨긴 경우에는 hidden 처리). `Player.tsx`는 해당 ref를 `Waveform.tsx`로 전달하고, `Waveform.tsx`는 `media: mediaRef.current`로 WaveSurfer에 넘깁니다. 이는 iOS/Safari 호환성을 위한 의도된 구조이므로 — `<audio>`/`<video>`를 별도 엘리먼트로 분리하지 마세요.

- **상태는 하나의 Zustand 스토어**(`src/store/playerStore.ts`)에 집중되어 있으며, `persist` 미들웨어로 `localStorage`의 `repeat-player-v3` 키에 저장됩니다. `partialize`는 사용자 환경설정(rate/volume/zoom/preRoll/fade/autoPauseMs/repeatTarget/showVideo)과 `bookmarks`, `recent`만 저장합니다. 일시적 상태(`ws`, `isPlaying`, `loopA`, `loopB`, `currentTime` 등)는 의도적으로 저장하지 않습니다. **스토어 구조에 호환되지 않는 변경을 가할 때는 `name` 키를 올리거나** 마이그레이션을 작성해야 합니다.

- **WaveSurfer는 `Waveform.tsx`가 소유**하며 `setWs`를 통해 스토어에 게시됩니다. 다른 컴포넌트는 스토어를 거쳐 트랜스포트 함수(`play`, `pause`, `setTime`, `seekBy`, `setPlaybackRate`, `setVolume`)를 호출하고, 스토어가 이를 `ws`로 전달합니다. `Waveform.tsx` 외부에서 WaveSurfer ref를 보유하지 마세요.

- **A–B 루프에는 `loopEnabled`에 따른 두 가지 모드**가 있습니다:
  - 루프 ON: A→B를 반복하며 `repeatTarget`, `autoPauseMs`, `preRollSec`, `fadeMs`를 따릅니다. 루프 재시작은 시크 경합을 피하기 위해 `setTime` + `play`가 아니라 `play(start)`를 사용합니다. `loopGuardRef`와 `loopPendingRef`는 `repeatCount`의 이중 증가를 방지합니다.
  - 루프 OFF 상태에서 A/B가 설정된 경우: "one-shot" 모드. `timeupdate`가 B에서 정지하고 커서를 A로 되감습니다. 재생 시작 시점이 남은 A–B 구간 밖이라면 `play`는 A로 점프합니다.

- **리전 상호작용** (`Waveform.tsx`):
  - 좌클릭 = 시크 (WaveSurfer의 `dragToSeek`).
  - 우클릭 드래그 = 새 A–B 리전 생성 (`RB_TMP_ID`를 이용한 커스텀 포인터 핸들러, `setLoopRange`로 확정).
  - ESC = 루프 리셋.
  - Ctrl/⌘ + 휠 = 줌 (8% 단위, `setZoomPps`).
  - 터치 기기(`(hover: none), (pointer: coarse)`)에서는 리전 드래그/리사이즈를 비활성화합니다.
  - 리전 시각은 0.01초 단위로 스냅(`SNAP_SEC`)되며, `snapApplyingRef`가 스냅 보정이 재귀적으로 `region-updated`를 발생시키는 것을 막습니다.

- **북마크**는 POINT 또는 REGION 두 종류가 있습니다. REGION 북마크는 "구문(phrase)" 역할을 하며 `Player.tsx`의 이전/다음 구문 버튼을 동작시킵니다.

- **파일 로딩**은 `URL.createObjectURL`을 사용하며 변경/언마운트 시 명시적으로 해제됩니다(`Player.tsx`의 `objectUrlRef`). 파일 입력 경로를 수정할 때 blob 누수를 방지하기 위해 이 라이프사이클을 유지하세요.

## 컨벤션

- 경로 별칭 `@/*` → `./src/*` (`tsconfig.json`).
- `tsconfig.json`은 의도적으로 `strict: false`와 `noImplicitAny: false`를 유지합니다 — 문의 없이 강화하지 마세요.
- Prettier(`.prettierrc`): 큰따옴표, `tabWidth: 2`, `printWidth: 150`, `trailingComma: "all"`, `endOfLine: "crlf"`, 클래스 정렬용 `prettier-plugin-tailwindcss` 사용.
- Tailwind v4는 `@tailwindcss/postcss`를 통해 사용하며, 유일한 CSS 파일은 `src/app/globals.css`이고 내용은 `@import "tailwindcss";` 한 줄뿐입니다.
- 모든 인터랙티브 컴포넌트는 `"use client"`이며, 스토어 파일도 `localStorage`를 사용하므로 마찬가지입니다.
- UI 문구와 인라인 주석은 한국어로 작성되어 있습니다 — 해당 파일들의 사용자 노출 문자열을 수정할 때는 기존 언어에 맞추세요.
