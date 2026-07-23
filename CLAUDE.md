# CLAUDE.md

## 명령어
- `npm run dev` — 개발 서버 (localhost:3000)
- `npm run build` / `npm run start` — 프로덕션 빌드 / 실행
- `npx tsc --noEmit` — 타입 검사 (`strict:false`, `noImplicitAny:false`)
- lint/test 스크립트 없음 — 만들지 마세요.

## 아키텍처
Next.js 16 App Router. 페이지 3개:
- **`/`** → `<Player />` (`src/app/page.tsx`): 오디오/비디오 A–B 반복 재생기.
- **`/tts`** → `<TtsClient />` (`src/app/tts/page.tsx`): OpenAI TTS로 텍스트→음성 변환·다운로드.
- **`/stt`** → `<SttClient />` (`src/app/stt/page.tsx`): OpenAI Whisper/gpt-4o-transcribe로 음성 파일→텍스트 추출.

로직은 `src/components`, `src/store`에 있음. 파일에 걸쳐 알아둘 사항:

- **단일 `<video>` 엘리먼트가 오디오+비디오 재생을 모두 담당.** `MediaView.tsx`가 하나의 `<video>`를 렌더(오디오이거나 비디오 숨김 시 hidden). `Player.tsx`가 그 ref를 `Waveform.tsx`로 넘기고, `Waveform.tsx`가 `media: mediaRef.current`로 WaveSurfer에 전달. iOS/Safari 호환용 의도된 구조 — `<audio>`/`<video>`로 분리하지 마세요. 영상 화면 더블클릭 시 `onToggle`(=`playPause`)로 재생/일시정지 토글.

- **구간 추출**(`src/lib/audioExport.ts`): A–B 구간 음원을 MP3/WAV로 다운로드. `mediaUrl`(blob) fetch→`decodeAudioData`→구간 슬라이스→인코딩. MP3는 `@breezystack/lamejs`(`extractRegionToMp3`, 비트레이트 인자), WAV는 순수 JS 인코더(`extractRegionToWav`). `Player.tsx`의 "구간 추출" 버튼+비트레이트 select(128/192/320k)로 호출, `canLoop`일 때만 활성.

- **재생 실패 감지·복구 변환**(`src/lib/videoTranscode.ts`): `MediaView.tsx`의 `<video onError>`가 `MediaError.code`별 안내(video면 오버레이, audio 분류/숨김이면 배너) + "호환 포맷(MP4)으로 변환" 버튼. 클릭 시 `Player.tsx`의 `convertMedia`→`runTranscode(opts, download)`→`transcodeVideo(url, name, {scaleHeight,crf,audioKbps})`가 **ffmpeg.wasm으로 H.264+AAC MP4 재인코딩**(원본 해상도 유지) 후 blob URL로 `setSource` 교체. **대용량(`mediaSize`>`LARGE_BYTES`=700MB)은 브라우저 변환 차단**(MediaView가 "브라우저에서 변환할 수 없습니다" 안내로 대체 — 로컬 변환은 사용자가 별도 처리). **코어는 싱글스레드**(`@ffmpeg/core`)라 COOP/COEP 불필요, **`/public/ffmpeg` 셀프 호스팅**(js+32MB wasm, `toBlobURL` 로드), FFmpeg는 모듈 싱글턴. 스트림은 `-map 0:v:0 -map 0:a:0?`로 비디오+오디오만. (해상도/화질 선택 "영상 최적화" 패널은 제거됨 — `transcodeVideo`는 opts 지원하나 현재 UI는 기본값만 사용.)

- **상태는 단일 Zustand 스토어**(`src/store/playerStore.ts`), `persist`로 `localStorage` 키 `repeat-player-v3`에 저장. `partialize`는 환경설정(rate/volume/zoom/repeatTarget/showVideo)+`bookmarks`+`recent`만 저장; 일시 상태(`ws`/`isPlaying`/`loopA`/`loopB`/`currentTime` 등)는 저장 안 함. **호환 깨지는 변경 시 `name` 키를 올리거나 마이그레이션 작성.**

- **WaveSurfer는 `Waveform.tsx`가 소유**, `setWs`로 스토어에 게시. 타 컴포넌트는 스토어 경유로 트랜스포트 함수(`play`/`pause`/`setTime`/`seekBy`/`setPlaybackRate`/`setVolume`) 호출→스토어가 `ws`로 전달. `Waveform.tsx` 밖에서 WaveSurfer ref 보유 금지. **라우트 복귀 시 재생 위치 복원**: `resumeTimeRef`가 렌더 시점(=load 이펙트의 `setCurrentTime(0)`보다 먼저)에 스토어 `currentTime`을 캡처→`ready`에서 1회 seek. 렌더 선행이라 Strict Mode 이중 실행에도 안전. (복귀 시 파형은 피크 캐시가 없어 재디코딩됨 — 의도된 동작.)

- **A–B 루프 = `loopEnabled` 기준 2모드:**
  - ON: A→B 반복, `repeatTarget` 따름. 재시작은 시크 경합 회피 위해 `play(start)` 사용(`setTime`+`play` 아님). `loopGuardRef`/`loopPendingRef`가 `repeatCount` 이중 증가 방지.
  - OFF+A/B 설정: "one-shot". `timeupdate`가 B에서 정지 후 커서를 A로 되감음. 시작 시점이 A–B 밖이면 `play`가 A로 점프.

- **리전 상호작용** (`Waveform.tsx`):
  - 좌클릭 = 시크(`dragToSeek`). 우클릭 드래그 = 새 A–B 리전 생성(`RB_TMP_ID` 커스텀 포인터 핸들러, `setLoopRange`로 확정). ESC = 루프 리셋.
  - Ctrl/⌘+휠 = 줌(8% 단위, `setZoomPps`). 줌 UI(±/리셋/슬라이더)는 Overview/Minimap 헤더에 인라인.
  - 터치 기기(`(hover:none),(pointer:coarse)`)는 리전 드래그/리사이즈 비활성.
  - 리전 시각은 `SNAP_SEC`(0.01초) 스냅, `snapApplyingRef`가 스냅→`region-updated` 재귀 방지.

- **북마크**는 POINT/REGION 2종. REGION은 "구문(phrase)"으로 `Player.tsx`의 이전/다음 구문 버튼 구동.

- **파일 로딩**은 `URL.createObjectURL`(`Player.tsx`의 `objectUrlRef`). blob URL 해제(`revokeObjectURL`)는 **파일 교체(`acceptFile`)·변환(`convertMedia`) 시에만** 수행 — 항상 1개만 존재하므로 누수 없음. **언마운트(STT/TTS 라우트 전환)에서는 revoke하지 않음**: Zustand 스토어가 모듈 싱글턴이라 `mediaUrl`이 유지되는데 언마운트에서 blob을 죽이면 복귀 시 죽은 URL 로드→`Format error`(오류4)가 남기 때문. **업로드 차단 가드**: `onFileChange`에서 용량 `>MAX_UPLOAD_BYTES`(1GB)는 즉시, 재생시간 `>MAX_UPLOAD_SEC`(90분)는 임시 `<video preload=metadata>`로 duration만 프로브 후 거부(전체 디코드 시 파형용 PCM이 브라우저 OOM=오류5를 유발하기 때문). 통과분만 `acceptFile`로 로드, 거부 시 토스트+`fileInputRef.value=""`(재선택). 오디오·비디오 공통 적용.

- **TTS**(`TtsClient.tsx`)는 Player와 독립, Zustand 없이 `useState`만 사용. API 라우트(`src/app/api/tts/route.ts`)가 OpenAI TTS 프록시, 키는 `.env.local`의 `OPENAI_API_KEY`. Object URL은 동일 패턴으로 언마운트 시 해제. 생성 버튼은 `window.confirm` 확인. `VOICES`는 `{id,label,gender,accent,desc}` 배열.

- **STT**(`SttClient.tsx`)는 TTS와 대칭 구조(독립·`useState`만·`window.confirm`). API 라우트(`src/app/api/stt/route.ts`)가 `request.formData()`로 파일 받아 OpenAI `audio.transcriptions`(`response_format:"text"`) 프록시, 키 동일 재사용. 모델 화이트리스트 `gpt-4o-transcribe`/`whisper-1`(기본·가운데)/`gpt-4o-mini-transcribe`. **25MB 제한**(서버+클라이언트 이중 가드). 결과는 textarea+복사+`.txt` 다운로드. `Player.tsx` 헤더에 STT/TTS 링크.

## 컨벤션
- 별칭 `@/*`→`./src/*`. `strict:false`/`noImplicitAny:false` 유지 — 문의 없이 강화 금지.
- Prettier: 큰따옴표, `tabWidth:2`, `printWidth:150`, `trailingComma:"all"`, `endOfLine:"crlf"`, `prettier-plugin-tailwindcss`.
- Tailwind v4(`@tailwindcss/postcss`), CSS는 `src/app/globals.css`(`@import "tailwindcss";`+range 슬라이더 커스텀).
- 인터랙티브 컴포넌트·스토어는 모두 `"use client"`.
- **사용자 알림은 `sonner` 토스트** — `alert` 쓰지 말 것. 전역 `<Toaster richColors position="top-center"/>`는 `layout.tsx`. `toast.error`(실패)/`toast.warning`(차단성 안내) 구분.
- UI 문구·주석은 한국어 — 사용자 노출 문자열 수정 시 기존 언어 유지.
