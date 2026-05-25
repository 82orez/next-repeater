# Repeat Player

오디오/비디오 A-B 구간 반복 재생기 + 텍스트 음성 변환(TTS) 도구.

## 기능

### Repeat Player (`/`)

- 오디오·비디오 파일 로드 및 파형(waveform) 시각화
- A-B 구간 설정 및 반복 재생 (반복 횟수, 자동 일시정지, 프리롤, 페이드 지원)
- 우클릭 드래그로 구간 생성, Ctrl/Cmd+휠로 줌
- 북마크 (포인트/리전) 및 구문 단위 이전/다음 탐색
- 재생 속도·볼륨 조절
- 녹음 기능

### 텍스트 음성 변환 (`/tts`)

- OpenAI TTS API를 이용한 텍스트 → 음성 변환
- 모델 선택 (tts-1 / tts-1-hd)
- 10종 음성 선택 (각 음성별 특징 설명 제공)
- 출력 형식 (MP3, Opus, AAC, FLAC, WAV, PCM) 및 속도 조절 (0.25x ~ 4.0x)
- 브라우저 미리듣기 및 다운로드
- 오작동 방지를 위한 생성 확인창

## 시작하기

### 설치

```bash
npm install
```

### 환경 변수

TTS 기능을 사용하려면 프로젝트 루트에 `.env.local` 파일을 생성하고 OpenAI API 키를 설정하세요:

```
OPENAI_API_KEY=sk-your-api-key-here
```

### 개발 서버

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 Repeat Player를, [http://localhost:3000/tts](http://localhost:3000/tts)에서 TTS 페이지를 확인할 수 있습니다.

### 빌드

```bash
npm run build
npm run start
```

## 기술 스택

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Zustand](https://github.com/pmndrs/zustand) (상태 관리)
- [WaveSurfer.js](https://wavesurfer.xyz) (파형 시각화)
- [OpenAI API](https://platform.openai.com/docs/guides/text-to-speech) (TTS)
