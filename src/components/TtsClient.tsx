"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Download, Volume2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

// legacy: tts-1 / tts-1-hd 에서도 쓸 수 있는 음성. false면 gpt-4o-mini-tts 전용.
// gender/accent/desc는 API가 주는 값이 아니라 청감 기준으로 직접 붙인 라벨이다.
const VOICES = [
  { id: "alloy", label: "Alloy", gender: "중성", accent: "미국식", desc: "중성적이고 균형 잡힌 톤", legacy: true, recommended: false },
  { id: "ash", label: "Ash", gender: "남성", accent: "미국식", desc: "거칠고 낮은 톤", legacy: true, recommended: false },
  { id: "ballad", label: "Ballad", gender: "남성", accent: "미국식", desc: "감성적이고 표현력 있는 톤", legacy: false, recommended: false },
  { id: "coral", label: "Coral", gender: "여성", accent: "미국식", desc: "따뜻하고 친근한 톤", legacy: true, recommended: false },
  { id: "echo", label: "Echo", gender: "남성", accent: "미국식", desc: "명확하고 또렷한 톤", legacy: true, recommended: false },
  { id: "fable", label: "Fable", gender: "남성", accent: "영국식", desc: "이야기체의 부드러운 톤", legacy: true, recommended: false },
  { id: "onyx", label: "Onyx", gender: "남성", accent: "미국식", desc: "깊고 무게감 있는 톤", legacy: true, recommended: false },
  { id: "nova", label: "Nova", gender: "여성", accent: "미국식", desc: "밝고 활기찬 톤", legacy: true, recommended: false },
  { id: "sage", label: "Sage", gender: "여성", accent: "미국식", desc: "차분하고 신뢰감 있는 톤", legacy: true, recommended: false },
  { id: "shimmer", label: "Shimmer", gender: "여성", accent: "미국식", desc: "맑고 경쾌한 톤", legacy: true, recommended: false },
  { id: "verse", label: "Verse", gender: "남성", accent: "미국식", desc: "생동감 있고 표현력 넓은 톤", legacy: false, recommended: false },
  { id: "marin", label: "Marin", gender: "여성", accent: "미국식", desc: "자연스럽고 또렷한 최신 음성", legacy: false, recommended: true },
  { id: "cedar", label: "Cedar", gender: "남성", accent: "미국식", desc: "자연스럽고 안정적인 최신 음성", legacy: false, recommended: true },
] as const;
const MODELS = [
  { id: "gpt-4o-mini-tts", label: "최신 (gpt-4o-mini-tts)", instructable: true },
  { id: "tts-1", label: "표준 (tts-1)", instructable: false },
  { id: "tts-1-hd", label: "고품질 (tts-1-hd)", instructable: false },
] as const;
// 라벨은 한국어, 본문은 영어 — 모델이 영어 지시를 더 안정적으로 따른다.
// ⚠️ 본문은 openai.fm 형식의 다속성 블록(Voice Affect/Tone/Pacing/...)을 유지할 것.
// 한 줄 요약으로 줄이면 톤 차이가 거의 들리지 않는다. 구체적 화자상이 형용사 나열보다 강하게 먹힌다.
const INSTRUCTION_PRESETS = [
  // 빈 문자열 = 초기 상태와 동일하므로 별도 분기 없이 하이라이트·해제가 모두 동작한다.
  { label: "없음", text: "" },
  {
    label: "뉴스 앵커",
    text: [
      "Voice Affect: Crisp, authoritative, and broadcast-trained; the steady presence of a prime-time news anchor.",
      "Tone: Neutral and factual, with no emotional coloring or editorializing.",
      "Pacing: Measured and even, with a clear beat between sentences.",
      "Emphasis: Stress proper names, numbers, and place names so they land clearly.",
      "Pronunciation: Fully articulated consonants; never drop word endings.",
    ].join("\n"),
  },
  {
    label: "차분한 강의",
    text: [
      "Voice Affect: Calm, patient, and quietly confident, like a professor explaining a difficult idea to a student who is genuinely curious.",
      "Tone: Warm but unhurried; never rushed, never condescending.",
      "Pacing: Slow and deliberate, with a distinct pause after each complete thought to let it settle.",
      "Emotion: Steady reassurance and real interest in the subject.",
      "Emphasis: Lean gently into the key term of each sentence.",
    ].join("\n"),
  },
  {
    label: "친근한 대화",
    text: [
      "Voice Affect: Relaxed and natural, like a close friend talking across a kitchen table.",
      "Tone: Casual, warm, and unpolished — this is speech, not reading.",
      "Pacing: Conversational and slightly uneven; speed up on throwaway phrases and slow down on the point that matters.",
      "Emotion: Easy familiarity, with a light smile audible throughout.",
      "Pronunciation: Relaxed and informal; let words run together the way people actually talk.",
    ].join("\n"),
  },
  {
    label: "즐겁고 들뜬",
    text: [
      "Voice Affect: Someone bursting to share news they are thrilled about, grinning so wide you can hear it.",
      "Tone: Bright, warm, and giddy, always on the edge of breaking into a laugh.",
      "Pacing: Lively and bouncy, with excited little rushes on the happiest phrases — but keep every word clearly formed.",
      "Emotion: Unguarded joy and delight; let the voice bubble and occasionally crack upward with excitement.",
      "Emphasis: Swing the pitch high on the exciting words and let the ends of sentences lift.",
    ].join("\n"),
  },
  {
    label: "동화 구연",
    text: [
      "Voice Affect: A warm storyteller reading a picture book aloud to a small child curled up beside them.",
      "Tone: Gentle, playful, and full of wonder.",
      "Pacing: Slow and lilting, with long, expectant pauses right before something exciting happens.",
      "Emotion: Delight and affection; let surprise and mischief color the voice.",
      "Emphasis: Stretch and sing the vivid, magical words.",
    ].join("\n"),
  },
  {
    label: "속삭이듯",
    text: [
      "Voice Affect: A soft, breathy whisper, as if sharing a secret in a quiet room where someone else is asleep.",
      "Tone: Intimate, conspiratorial, and hushed.",
      "Pacing: Slow and careful, the voice barely above a breath.",
      "Emotion: Quiet urgency and closeness.",
      "Pronunciation: Keep consonants soft; never let the voice rise into full speech.",
    ].join("\n"),
  },
  {
    label: "느와르 탐정",
    text: [
      "Voice Affect: Low, gravelly, and world-weary — a 1940s private detective narrating from a rain-soaked office.",
      "Tone: Cynical, brooding, and quietly amused by how bad things have gotten.",
      "Pacing: Slow and deliberate, with heavy pauses between thoughts, as if exhaling smoke between lines.",
      "Emotion: Jaded detachment with a buried streak of sentiment.",
      "Emphasis: Let the last word of each sentence drop low and linger.",
    ].join("\n"),
  },
  {
    label: "영국 신사",
    text: [
      "Voice Affect: A polished upper-class British gentleman speaking in refined Received Pronunciation.",
      "Tone: Courteous, dry, and faintly amused, with impeccable composure.",
      "Pacing: Unhurried and elegant, savoring the shape of each phrase.",
      "Pronunciation: Crisp non-rhotic English vowels; sound every T clearly.",
      "Emotion: Understated wit held just beneath the surface.",
    ].join("\n"),
  },
] as const;
const MAX_INSTRUCTIONS = 1000;

const isInstructable = (modelId: string) => MODELS.find((m) => m.id === modelId)?.instructable ?? false;
const isVoiceAllowed = (modelId: string, voice: (typeof VOICES)[number]) => isInstructable(modelId) || voice.legacy;

// 생성 시점 설정 스냅샷 — 결과 카드는 반드시 이것만 읽는다(현재 state를 읽으면 생성 후 선택을 바꿨을 때 어긋난다)
type GenMeta = {
  modelLabel: string;
  voice: (typeof VOICES)[number];
  tone: string | null; // null = 이 모델은 톤 지시를 지원하지 않음 → 행 자체를 숨긴다
  speed: number;
  format: string;
};

// instructions 문자열 → 사람이 읽는 라벨. 빈 문자열 프리셋("없음")이 있어 그 경우도 여기서 잡힌다.
const toneLabelOf = (modelId: string, instructions: string): string | null => {
  if (!isInstructable(modelId)) return null;
  const preset = INSTRUCTION_PRESETS.find((p) => p.text === instructions);
  if (preset) return preset.label;
  return instructions.trim() ? "직접 입력" : "없음";
};

const buildMeta = (modelId: string, voiceId: string, instructions: string, speed: number, format: string): GenMeta => ({
  modelLabel: MODELS.find((m) => m.id === modelId)?.label ?? modelId,
  voice: VOICES.find((v) => v.id === voiceId) ?? VOICES[0],
  tone: toneLabelOf(modelId, instructions),
  speed,
  format,
});
const FORMATS = [
  { id: "mp3", label: "MP3" },
  { id: "opus", label: "Opus" },
  { id: "aac", label: "AAC" },
  { id: "flac", label: "FLAC" },
  { id: "wav", label: "WAV" },
  { id: "pcm", label: "PCM" },
] as const;
const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

// 보이스 카드의 성별·억양 뱃지와 같은 스타일 — 확인창/결과 카드에서 시각적으로 이어지게 재사용한다
function VoiceBadges({ voice }: { voice: (typeof VOICES)[number] }) {
  return (
    <>
      <span
        className={clsx(
          "rounded px-1 py-0.5 text-[10px] font-medium",
          voice.gender === "남성" ? "bg-blue-100 text-blue-700" : voice.gender === "여성" ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-600",
        )}>
        {voice.gender}
      </span>
      <span
        className={clsx(
          "rounded px-1 py-0.5 text-[10px] font-medium",
          voice.accent === "영국식" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700",
        )}>
        {voice.accent}
      </span>
    </>
  );
}

// 확인창용 설정 요약 — 라벨/값 2열
function GenSummary({ meta }: { meta: GenMeta }) {
  return (
    <>
      <p>OpenAI API가 호출되고 token이 소모됩니다.</p>
      <dl className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <dt className="w-10 shrink-0 text-xs text-zinc-500">모델</dt>
          <dd className="text-sm text-zinc-800">{meta.modelLabel}</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-10 shrink-0 text-xs text-zinc-500">음성</dt>
          <dd className="flex items-center gap-1.5 text-sm text-zinc-800">
            {meta.voice.label}
            <VoiceBadges voice={meta.voice} />
          </dd>
        </div>
        {/* tts-1 계열은 톤 지시를 전송하지 않으므로 행 자체를 숨긴다 */}
        {meta.tone && (
          <div className="flex items-center gap-3">
            <dt className="w-10 shrink-0 text-xs text-zinc-500">톤</dt>
            <dd className="text-sm text-zinc-800">{meta.tone}</dd>
          </div>
        )}
      </dl>
    </>
  );
}

export default function TtsClient() {
  const [text, setText] = useState("");
  const [model, setModel] = useState<string>("gpt-4o-mini-tts");
  const [voice, setVoice] = useState<string>("alloy");
  const [format, setFormat] = useState<string>("mp3");
  const [speed, setSpeed] = useState(1.0);
  const [instructions, setInstructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMeta, setResultMeta] = useState<GenMeta | null>(null);

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

  // 모델을 바꾸면 현재 음성이 지원 밖일 수 있다 — 조용히 실패시키지 않고 alloy로 되돌린다.
  const onModelChange = (nextModel: string) => {
    setModel(nextModel);
    const current = VOICES.find((v) => v.id === voice);
    if (current && !isVoiceAllowed(nextModel, current)) {
      setVoice("alloy");
      toast.info(`${current.label} 음성은 최신 모델 전용이라 Alloy로 변경했습니다.`);
    }
  };

  const requestGenerate = () => {
    if (!text.trim() || isLoading) return;
    setConfirmOpen(true);
  };

  const onGenerate = async () => {
    setConfirmOpen(false);
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    revokeAudio();
    setAudioUrl(null);
    setResultMeta(null); // 실패 시 이전 결과 정보가 남지 않도록

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: text,
          model,
          voice,
          response_format: format,
          speed,
          ...(isInstructable(model) && instructions.trim() ? { instructions: instructions.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "음성 생성에 실패했습니다.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudioUrl(url);
      // 이 시점의 설정을 고정 — 이후 선택을 바꿔도 결과 카드는 실제 생성값을 유지한다
      setResultMeta(buildMeta(model, voice, instructions, speed, format));
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
                onClick={() => onModelChange(m.id)}
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
            {VOICES.map((v) => {
              const allowed = isVoiceAllowed(model, v);
              return (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  disabled={!allowed}
                  title={allowed ? undefined : "최신 모델(gpt-4o-mini-tts) 전용 음성입니다."}
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-left transition-colors",
                    !allowed
                      ? "border-zinc-200 bg-zinc-100 opacity-50"
                      : voice === v.id
                        ? "border-blue-600 bg-blue-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-100",
                  )}>
                  <div className={clsx("text-sm font-medium", voice === v.id && allowed ? "text-blue-700" : "text-zinc-700")}>{v.label}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <span
                      className={clsx(
                        "rounded px-1 py-0.5 text-[10px] font-medium",
                        v.gender === "남성"
                          ? "bg-blue-100 text-blue-700"
                          : v.gender === "여성"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-zinc-100 text-zinc-600",
                      )}>
                      {v.gender}
                    </span>
                    <span
                      className={clsx(
                        "rounded px-1 py-0.5 text-[10px] font-medium",
                        v.accent === "영국식" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700",
                      )}>
                      {v.accent}
                    </span>
                    {v.recommended && <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">추천</span>}
                  </div>
                  <div className={clsx("mt-0.5 text-xs", voice === v.id && allowed ? "text-blue-500" : "text-zinc-400")}>{v.desc}</div>
                </button>
              );
            })}
          </div>
          {!isInstructable(model) && <p className="mt-1.5 text-xs text-zinc-400">흐린 음성은 최신 모델(gpt-4o-mini-tts)에서만 사용할 수 있습니다.</p>}
        </div>

        {/* 톤 지시 — gpt-4o-mini-tts 전용 */}
        {isInstructable(model) && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">톤 지시 (선택)</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={MAX_INSTRUCTIONS}
              rows={5}
              placeholder="아래 프리셋을 누르거나 직접 작성하세요. 영어로 쓰면 더 정확하게 반영됩니다."
              className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-200"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {INSTRUCTION_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setInstructions(p.text)}
                  className={clsx(
                    "rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors",
                    instructions === p.text ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100",
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              톤·감정·억양·말하는 속도를 자연어로 지시할 수 있습니다. 짧은 문장에서는 차이가 잘 드러나지 않으니 두세 문장 이상 넣어 보세요.
            </p>
          </div>
        )}

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
          onClick={requestGenerate}
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
            <p className="text-sm font-medium text-zinc-700">생성된 음성</p>
            {/* ⚠️ 현재 state가 아니라 생성 시점 스냅샷을 읽는다 */}
            {resultMeta && (
              <div className="mt-1.5 mb-3">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-zinc-700">
                  <span>{resultMeta.modelLabel}</span>
                  <span className="text-zinc-300">·</span>
                  <span>{resultMeta.voice.label}</span>
                  <VoiceBadges voice={resultMeta.voice} />
                  {resultMeta.tone && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span>톤 {resultMeta.tone}</span>
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {resultMeta.speed.toFixed(2)}x · {resultMeta.format.toUpperCase()}
                </div>
              </div>
            )}
            <audio controls src={audioUrl} className="mb-3 w-full" />
            <a
              href={audioUrl}
              download={`tts-output.${resultMeta?.format ?? format}`}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              <Download className="h-4 w-4" />
              다운로드
            </a>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="음성을 생성할까요?"
        description={<GenSummary meta={buildMeta(model, voice, instructions, speed, format)} />}
        confirmLabel="생성"
        onConfirm={onGenerate}
        onCancel={() => setConfirmOpen(false)}
      />

      <footer className="mt-8 text-center text-xs text-zinc-500">OpenAI TTS API — 텍스트 음성 변환</footer>
    </div>
  );
}
