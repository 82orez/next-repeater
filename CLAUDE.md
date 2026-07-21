# CLAUDE.md

## 명령어
- `npm run dev` — 개발 서버 (localhost:3000)
- `npm run build` / `npm run start` — 프로덕션 빌드 / 실행
- `npx tsc --noEmit` — 타입 검사 (`strict:false`, `noImplicitAny:false`)
- lint/test 스크립트 없음 — 만들지 마세요.

## 아키텍처
Next.js 16 App Router. 페이지 2개:
- **`/`** → `<Player />` (`src/app/page.tsx`): 오디오/비디오 A–B 반복 재생기.
- **`/tts`** → `<TtsClient />` (`src/app/tts/page.tsx`): OpenAI TTS로 텍스트→음성 변환·다운로드.

로직은 `src/components`, `src/store`에 있음. 파일에 걸쳐 알아둘 사항:

- **단일 `<video>` 엘리먼트가 오디오+비디오 재생을 모두 담당.** `MediaView.tsx`가 하나의 `<video>`를 렌더(오디오이거나 비디오 숨김 시 hidden). `Player.tsx`가 그 ref를 `Waveform.tsx`로 넘기고, `Waveform.tsx`가 `media: mediaRef.current`로 WaveSurfer에 전달. iOS/Safari 호환용 의도된 구조 — `<audio>`/`<video>`로 분리하지 마세요. 영상 화면 더블클릭 시 `onToggle`(=`playPause`)로 재생/일시정지 토글.

- **구간 추출**(`src/lib/audioExport.ts`): A–B 구간 음원을 MP3/WAV로 다운로드. `mediaUrl`(blob) fetch→`decodeAudioData`→구간 슬라이스→인코딩. MP3는 `@breezystack/lamejs`(`extractRegionToMp3`, 비트레이트 인자), WAV는 순수 JS 인코더(`extractRegionToWav`). `Player.tsx`의 "구간 추출" 버튼+비트레이트 select(128/192/320k)로 호출, `canLoop`일 때만 활성.

- **재생 실패 감지·변환·최적화**(`src/lib/videoTranscode.ts`): `MediaView.tsx`의 `<video onError>`가 `MediaError.code`별 안내(video면 오버레이, audio 분류/숨김이면 배너). 변환/최적화는 `Player.tsx`의 `runTranscode(opts, download)`(공용)→`transcodeVideo(url, name, {scaleHeight,crf,audioKbps})`가 **ffmpeg.wasm으로 H.264+AAC MP4 재인코딩** 후 blob URL로 `setSource` 교체(+옵션 다운로드). 두 진입점: ①코덱 오류 복구=`convertMedia`(원본 해상도 유지), ②"영상 최적화" 패널(video 로드 시 노출)=해상도(원본/720p/480p)·화질(crf 20/23/28) select+다운로드. `mediaSize`>700MB면 `confirm` 경고(wasm 메모리 한계). **코어는 싱글스레드**(`@ffmpeg/core`)라 COOP/COEP 불필요, **`/public/ffmpeg` 셀프 호스팅**(js+32MB wasm, `toBlobURL` 로드), FFmpeg는 모듈 싱글턴. 스트림은 `-map 0:v:0 -map 0:a:0?`로 비디오+오디오만.

- **상태는 단일 Zustand 스토어**(`src/store/playerStore.ts`), `persist`로 `localStorage` 키 `repeat-player-v3`에 저장. `partialize`는 환경설정(rate/volume/zoom/repeatTarget/showVideo)+`bookmarks`+`recent`만 저장; 일시 상태(`ws`/`isPlaying`/`loopA`/`loopB`/`currentTime` 등)는 저장 안 함. **호환 깨지는 변경 시 `name` 키를 올리거나 마이그레이션 작성.**

- **WaveSurfer는 `Waveform.tsx`가 소유**, `setWs`로 스토어에 게시. 타 컴포넌트는 스토어 경유로 트랜스포트 함수(`play`/`pause`/`setTime`/`seekBy`/`setPlaybackRate`/`setVolume`) 호출→스토어가 `ws`로 전달. `Waveform.tsx` 밖에서 WaveSurfer ref 보유 금지.

- **A–B 루프 = `loopEnabled` 기준 2모드:**
  - ON: A→B 반복, `repeatTarget` 따름. 재시작은 시크 경합 회피 위해 `play(start)` 사용(`setTime`+`play` 아님). `loopGuardRef`/`loopPendingRef`가 `repeatCount` 이중 증가 방지.
  - OFF+A/B 설정: "one-shot". `timeupdate`가 B에서 정지 후 커서를 A로 되감음. 시작 시점이 A–B 밖이면 `play`가 A로 점프.

- **리전 상호작용** (`Waveform.tsx`):
  - 좌클릭 = 시크(`dragToSeek`). 우클릭 드래그 = 새 A–B 리전 생성(`RB_TMP_ID` 커스텀 포인터 핸들러, `setLoopRange`로 확정). ESC = 루프 리셋.
  - Ctrl/⌘+휠 = 줌(8% 단위, `setZoomPps`). 줌 UI(±/리셋/슬라이더)는 Overview/Minimap 헤더에 인라인.
  - 터치 기기(`(hover:none),(pointer:coarse)`)는 리전 드래그/리사이즈 비활성.
  - 리전 시각은 `SNAP_SEC`(0.01초) 스냅, `snapApplyingRef`가 스냅→`region-updated` 재귀 방지.

- **북마크**는 POINT/REGION 2종. REGION은 "구문(phrase)"으로 `Player.tsx`의 이전/다음 구문 버튼 구동.

- **파일 로딩**은 `URL.createObjectURL`, 변경/언마운트 시 명시적 해제(`Player.tsx`의 `objectUrlRef`). blob 누수 방지 위해 이 라이프사이클 유지.

- **TTS**(`TtsClient.tsx`)는 Player와 독립, Zustand 없이 `useState`만 사용. API 라우트(`src/app/api/tts/route.ts`)가 OpenAI TTS 프록시, 키는 `.env.local`의 `OPENAI_API_KEY`. Object URL은 동일 패턴으로 언마운트 시 해제. 생성 버튼은 `window.confirm` 확인. `VOICES`는 `{id,label,gender,accent,desc}` 배열.

## 컨벤션
- 별칭 `@/*`→`./src/*`. `strict:false`/`noImplicitAny:false` 유지 — 문의 없이 강화 금지.
- Prettier: 큰따옴표, `tabWidth:2`, `printWidth:150`, `trailingComma:"all"`, `endOfLine:"crlf"`, `prettier-plugin-tailwindcss`.
- Tailwind v4(`@tailwindcss/postcss`), CSS는 `src/app/globals.css`(`@import "tailwindcss";`+range 슬라이더 커스텀).
- 인터랙티브 컴포넌트·스토어는 모두 `"use client"`.
- UI 문구·주석은 한국어 — 사용자 노출 문자열 수정 시 기존 언어 유지.
