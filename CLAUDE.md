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

- **구간 추출**(`src/lib/audioExport.ts`): A–B 구간 음원을 MP3/WAV로 다운로드. `mediaUrl`(blob) fetch→`decodeAudioData`→구간 슬라이스→인코딩. MP3는 `@breezystack/lamejs`(`extractRegionToMp3`, 비트레이트 인자), WAV는 순수 JS 인코더(`extractRegionToWav`). `Player.tsx`의 "구간 추출" 버튼+비트레이트 select(128/192/320k)로 호출, `canLoop`일 때만 활성. ⚠️ **메모리**: `decodeAudioData`는 구간 길이와 무관하게 **파일 전체를 하드웨어 샘플레이트(보통 48kHz) PCM으로 펼친다** — 65분 영상이면 PCM만 ~1.5GB(+파일 바이트)라 피크 약 2GB. 리포지토리에서 전체를 풀 레이트로 디코드하는 유일한 지점이다(WaveSurfer는 기본 `sampleRate:8000`이라 6배 적게 쓴다 — 파형은 되는데 추출만 실패하면 이 차이를 의심할 것). 근본 해결은 ffmpeg.wasm으로 구간만 잘라내는 것.

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

- **이전/다음 문장 버튼은 활성 자막 트랙의 큐로 구동**(`Player.tsx`의 `sentences` = `subs.find(s=>s.enabled) ?? subs[0]`의 `cues`). 자막이 없으면 비활성. 여러 트랙을 합치지 말 것 — 구간이 겹친다. `parseSubtitles`가 start 정렬을 보장하므로 재정렬 불필요. **북마크(POINT/REGION) 기능은 제거됨** — 되살리지 말 것.

- **파일 로딩**은 `URL.createObjectURL`(`Player.tsx`의 `objectUrlRef`). blob URL 해제(`revokeObjectURL`)는 **파일 교체(`acceptFile`)·변환(`convertMedia`) 시에만** 수행 — 항상 1개만 존재하므로 누수 없음. **언마운트(STT/TTS 라우트 전환)에서는 revoke하지 않음**: Zustand 스토어가 모듈 싱글턴이라 `mediaUrl`이 유지되는데 언마운트에서 blob을 죽이면 복귀 시 죽은 URL 로드→`Format error`(오류4)가 남기 때문. **업로드 차단 가드**: `onFileChange`에서 용량 `>MAX_UPLOAD_BYTES`(1GB)는 즉시, 재생시간 `>MAX_UPLOAD_SEC`(90분)는 임시 `<video preload=metadata>`로 duration만 프로브 후 거부(전체 디코드 시 파형용 PCM이 브라우저 OOM=오류5를 유발하기 때문). 통과분만 `acceptFile`로 로드, 거부 시 토스트+`fileInputRef.value=""`(재선택). 오디오·비디오 공통 적용. 이 가드+로드 흐름은 `loadTrack(file, subFiles)`로 추출돼 **단일 파일 선택과 재생목록 전환이 공유**한다(성공 시 `true` 반환 → 인덱스는 성공 시에만 이동). **`loadSeqRef` 순번 가드 필수** — 프로브·자막 파싱이 비동기라 트랙을 연속 클릭하면 늦게 시작한 요청이 먼저 끝나 이전 트랙이 적용될 수 있다. `acceptFile` 직전과 `readSubtitleFiles` 직후 두 지점에서 최신 호출인지 확인한다(자막만 이전 트랙 것으로 남는 경우를 막으려면 두 번째 확인이 반드시 필요).

- **폴더 불러오기(재생목록)**: 별도 hidden input의 `webkitdirectory`(React 타입에 없어 `{...({webkitdirectory:""} as any)}` 스프레드 필요). ⚠️ **`playlist`는 `File` 객체만 보관하고 blob URL을 미리 만들지 않는다** — URL은 트랙 선택 시 `acceptFile`이 1개만 생성·해제하므로 기존 "blob URL 1개" 불변식이 유지된다. `File`은 직렬화 불가라 `playlist`/`playlistIndex`는 **`partialize` 제외**. 폴더엔 `.DS_Store`·이미지가 섞이므로 MIME 또는 `MEDIA_EXT_RE`로 필터, 정렬은 `Intl.Collator({numeric:true})`(001/010 처리), 자막은 `matchSubFiles`가 basename으로 매칭(`001.srt`/`001.en.srt`). 단일 파일을 새로 열면 `clearPlaylist()`. 패널(`PlaylistPanel.tsx`)은 표시만 하고 전환은 `onSelect` prop으로 Player에 위임(프로브·ref가 Player에 있음).

- **자막**(`src/lib/subtitles.ts` + `CaptionPanel.tsx`): 미디어 입력과 **같은 file input**으로 받는다(`multiple`, `accept`에 `.srt,.vtt`). **분류는 확장자(`SUB_EXT_RE`) 기준 — `.srt`는 MIME이 비거나 `text/plain`이라 `file.type` 신뢰 금지.** `parseSubtitles`가 SRT/VTT를 한 경로로 파싱(BOM·CRLF·`WEBVTT`/`NOTE` 블록·cue setting·`<i>` 태그·**방향제어문자 U+202A**(넷플릭스 자막) 제거, start 정렬). ⚠️ **`setSource`가 `subs: []`로 비우므로 자막 장착은 반드시 `acceptFile` 이후**(`onFileChange`의 `acceptWithSubs`) — 순서 뒤집으면 조용히 사라짐. 자막만 선택 시엔 미디어를 건드리지 않고 `addSubs`만. **`findCueText`는 순수 이진 탐색이어야 한다** — A–B 루프 재시작(`play(a)`)이 시간을 뒤로 점프시켜 전진 포인터 방식은 되감김마다 desync. 렌더는 트랙당 leaf(`CueLine`)가 **문자열 반환 셀렉터**를 써서 rAF(~60Hz) `timeupdate` 중 큐 경계에서만 리렌더(`TimeReadout`과 동일 전략). `subs`는 미디어 종속이라 **`partialize` 제외**. 표시는 영상 오버레이가 아닌 독립 카드 → 비디오 숨김·오디오 전용에서도 동작하며 **`MediaView`는 무관여**. 위치는 미디어 블록(`mt-5`) 안 `MediaView`와 `Waveform` 사이 — `Waveform`에 상단 여백이 없어 자막 카드가 아래 간격까지 책임진다(`mt-4` 아닌 **`my-4`**).

- **TTS**(`TtsClient.tsx`)는 Player와 독립, Zustand 없이 `useState`만 사용. API 라우트(`src/app/api/tts/route.ts`)가 OpenAI TTS 프록시, 키는 `.env.local`의 `OPENAI_API_KEY`. Object URL은 동일 패턴으로 언마운트 시 해제. 생성 버튼은 `window.confirm` 확인. 모델 3종 `gpt-4o-mini-tts`(기본)/`tts-1`/`tts-1-hd`. **`instructions`(톤 지시)는 `gpt-4o-mini-tts` 전용** — tts-1 계열은 파라미터를 무시하므로 서버가 400으로 거부하고, UI는 해당 모델일 때만 입력란을 렌더. **`INSTRUCTION_PRESETS` 본문은 영어 + openai.fm 형식의 다속성 블록(`Voice Affect:`/`Tone:`/`Pacing:`/`Emotion:`/`Emphasis:`)을 유지할 것** — 한 줄 요약으로 줄이면 톤 차이가 거의 안 들린다(실측). 형용사 나열보다 구체적 화자상("a morning radio host who…")이 강하게 먹히고, 속삭임·억양·캐릭터처럼 음향이 바뀌는 지시가 미묘한 운율 조정보다 체감이 크다. **극단적 고속·고함 지시는 반영되지 않는다** — '스포츠 중계' 프리셋을 이 사유로 제거했으니 되살리지 말 것. 흥분은 속도가 아니라 미소·웃음기·음높이 진폭으로 표현한다. 또한 **동일 입력 3회 생성 시 재생 길이가 최대 3초 흔들리므로 길이로 프리셋 효과를 판정하지 말 것**(1~2초 차이는 노이즈). **`VOICES`(13종, `{id,label,gender,accent,desc,legacy,recommended}`)의 `legacy:false`(ballad/verse/marin/cedar)는 tts-1 계열이 지원하지 않는다** — 서버가 조합을 검증하고, UI는 버튼 비활성 + 모델 전환 시 `alloy` 폴백(토스트). gender/accent/desc는 API 메타데이터가 아니라 직접 붙인 라벨.

- **STT**(`SttClient.tsx`)는 TTS와 대칭 구조(독립·`useState`만·`window.confirm`). API 라우트(`src/app/api/stt/route.ts`)가 `request.formData()`로 파일 받아 OpenAI `audio.transcriptions`(`response_format:"text"`) 프록시, 키 동일 재사용. 모델 화이트리스트 `gpt-4o-transcribe`/`whisper-1`(기본·가운데)/`gpt-4o-mini-transcribe`. **25MB 제한**(서버+클라이언트 이중 가드). 결과는 textarea+복사+`.txt` 다운로드. `Player.tsx` 헤더에 STT/TTS 링크.

## 컨벤션

- 별칭 `@/*`→`./src/*`. `strict:false`/`noImplicitAny:false` 유지 — 문의 없이 강화 금지.
- Prettier: 큰따옴표, `tabWidth:2`, `printWidth:150`, `trailingComma:"all"`, **`endOfLine:"lf"`**, **`bracketSameLine:true`**(JSX 여는 태그의 `>`는 마지막 속성과 같은 줄), `prettier-plugin-tailwindcss`. 리포지토리는 전부 LF이고 `core.autocrlf=input`이라 커밋 시에도 LF로 정규화된다 — CRLF로 저장하지 말 것.
- Tailwind v4(`@tailwindcss/postcss`), CSS는 `src/app/globals.css`(`@import "tailwindcss";`+range 슬라이더 커스텀).
- **커서는 전역 처리** — `globals.css`의 `@layer base`가 `button`/`select`/`label[for]`/`[role=button]`에 `cursor-pointer`, disabled에 `cursor-not-allowed`를 건다. **새 버튼에 `cursor-pointer` 붙이지 말 것**(중복). `@layer base`라 개별 `cursor-*` 유틸리티는 그대로 오버라이드됨. 파형/미니맵 컨테이너는 `<div>`라 미적용(의도).
- **로딩 표시는 CSS 스피너** — `animate-spin rounded-full border-2` + `border-t-*`(밝은 배경엔 `border-zinc-300 border-t-zinc-700`, 어두운 버튼엔 `border-zinc-400 border-t-white`). lucide 스피너 아이콘 쓰지 말 것. 버튼에선 **아이콘 자리만 스피너로 교체**하고 라벨은 진행 상태로 바꾼다(`Player.tsx` 구간 추출: `구간 추출`→`추출 중`, `TtsClient.tsx`: `음성 생성`→`생성 중...`).
- 인터랙티브 컴포넌트·스토어는 모두 `"use client"`.
- **사용자 알림은 `sonner` 토스트** — `alert` 쓰지 말 것. 전역 `<Toaster richColors position="top-center"/>`는 `layout.tsx`. `toast.error`(실패)/`toast.warning`(차단성 안내) 구분.
- UI 문구·주석은 한국어 — 사용자 노출 문자열 수정 시 기존 언어 유지.
