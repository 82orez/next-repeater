"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Download, Volume2 } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Alloy", gender: "중성", accent: "미국식", desc: "중성적이고 균형 잡힌 톤" },
  { id: "ash", label: "Ash", gender: "남성", accent: "미국식", desc: "부드럽고 차분한 톤" },
  { id: "ballad", label: "Ballad", gender: "남성", accent: "미국식", desc: "감성적이고 표현력 있는 톤" },
  { id: "coral", label: "Coral", gender: "여성", accent: "미국식", desc: "따뜻하고 친근한 톤" },
  { id: "echo", label: "Echo", gender: "남성", accent: "미국식", desc: "명확하고 또렷한 톤" },
  { id: "fable", label: "Fable", gender: "남성", accent: "영국식", desc: "이야기체의 부드러운 톤" },
  { id: "onyx", label: "Onyx", gender: "남성", accent: "미국식", desc: "깊고 무게감 있는 톤" },
  { id: "nova", label: "Nova", gender: "여성", accent: "미국식", desc: "밝고 활기찬 톤" },
  { id: "sage", label: "Sage", gender: "여성", accent: "미국식", desc: "차분하고 신뢰감 있는 톤" },
  { id: "shimmer", label: "Shimmer", gender: "여성", accent: "미국식", desc: "맑고 경쾌한 톤" },
] as const;
const MODELS = [
  { id: "tts-1", label: "표준 (tts-1)" },
  { id: "tts-1-hd", label: "고품질 (tts-1-hd)" },
] as const;
const FORMATS = [
  { id: "mp3", label: "MP3" },
  { id: "opus", label: "Opus" },
  { id: "aac", label: "AAC" },
  { id: "flac", label: "FLAC" },
  { id: "wav", label: "WAV" },
  { id: "pcm", label: "PCM" },
] as const;
const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function TtsClient() {
  const [text, setText] = useState("");
  const [model, setModel] = useState<string>("tts-1");
  const [voice, setVoice] = useState<string>("alloy");
  const [format, setFormat] = useState<string>("mp3");
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioUrlRef = useRef<string | null>(null);

  const revokeAudio = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => revokeAudio();
  }, []);

  const onGenerate = async () => {
    if (!text.trim() || isLoading) return;
    if (!window.confirm("해당 텍스트로 음성을 생성하시겠습니까? OpenAI API가 호출되고 token이 소모됩니다.")) return;

    setIsLoading(true);
    setError(null);
    revokeAudio();
    setAudioUrl(null);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, model, voice, response_format: format, speed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "음성 생성에 실패했습니다.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
    } catch (e: any) {
      setError(e.message || "음성 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {/* 헤더 */}
      <header className="mb-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          플레이어로 돌아가기
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">텍스트 음성 변환 (TTS)</h1>
        <p className="mt-2 text-sm text-zinc-600">텍스트를 입력하면 OpenAI TTS를 이용해 자연스러운 음성 파일을 생성합니다.</p>
      </header>

      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        {/* 텍스트 입력 */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">텍스트</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4096}
            rows={6}
            placeholder="음성으로 변환할 텍스트를 입력하세요..."
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-200"
          />
          <div className="mt-1 text-right text-xs text-zinc-400">{text.length.toLocaleString()} / 4,096</div>
        </div>

        {/* 모델 선택 */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">모델</label>
          <div className="flex gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={clsx(
                  "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                  model === m.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100",
                )}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 음성 선택 */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">음성</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVoice(v.id)}
                className={clsx(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  voice === v.id ? "border-blue-600 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-100",
                )}>
                <div className={clsx("flex items-center gap-1.5 text-sm font-medium", voice === v.id ? "text-blue-700" : "text-zinc-700")}>
                  {v.label}
                  <span className={clsx("whitespace-nowrap text-[10px] font-normal", voice === v.id ? "text-blue-400" : "text-zinc-400")}>
                    {v.gender} · {v.accent}
                  </span>
                </div>
                <div className={clsx("text-xs", voice === v.id ? "text-blue-500" : "text-zinc-400")}>{v.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 포맷 & 속도 */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">출력 형식</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-200">
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">속도 ({speed.toFixed(2)}x)</label>
            <input
              type="range"
              min={0.25}
              max={4.0}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={clsx(
                    "rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors",
                    speed === s ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100",
                  )}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={onGenerate}
          disabled={!text.trim() || isLoading}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
            !text.trim() || isLoading ? "cursor-not-allowed bg-zinc-300 text-zinc-500" : "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800",
          )}>
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
              생성 중...
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" />
              음성 생성
            </>
          )}
        </button>

        {/* 에러 */}
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* 결과 */}
        {audioUrl && (
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-zinc-700">생성된 음성</p>
            <audio controls src={audioUrl} className="mb-3 w-full" />
            <a
              href={audioUrl}
              download={`tts-output.${format}`}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              <Download className="h-4 w-4" />
              다운로드
            </a>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-500">OpenAI TTS API — 텍스트 음성 변환</footer>
    </div>
  );
}
