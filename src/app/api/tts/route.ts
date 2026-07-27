import OpenAI from "openai";
import { NextResponse } from "next/server";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"] as const;
const MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;
const FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;

// tts-1 / tts-1-hd 가 지원하는 음성. 나머지(ballad/verse/marin/cedar)는 gpt-4o-mini-tts 전용.
const LEGACY_VOICES = new Set(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]);
// instructions(톤 지시)를 받는 모델. tts-1 계열은 파라미터를 무시하므로 명시적으로 거부한다.
const INSTRUCTABLE_MODELS = new Set(["gpt-4o-mini-tts"]);
const MAX_INSTRUCTIONS = 1000;

const MIME_MAP: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/L16",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError("서버에 OpenAI API 키가 설정되지 않았습니다.", 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.", 400);
  }

  const { input, model, voice, response_format, speed, instructions } = body;

  if (!input || typeof input !== "string" || !input.trim()) {
    return jsonError("텍스트를 입력해 주세요.", 400);
  }
  if (input.length > 4096) {
    return jsonError("텍스트는 4,096자 이하로 입력해 주세요.", 400);
  }
  if (!MODELS.includes(model)) {
    return jsonError("잘못된 모델입니다.", 400);
  }
  if (!VOICES.includes(voice)) {
    return jsonError("잘못된 음성입니다.", 400);
  }
  if (!INSTRUCTABLE_MODELS.has(model) && !LEGACY_VOICES.has(voice)) {
    return jsonError("표준/고품질 모델은 해당 음성을 지원하지 않습니다.", 400);
  }
  if (!FORMATS.includes(response_format)) {
    return jsonError("잘못된 출력 형식입니다.", 400);
  }
  if (typeof speed !== "number" || speed < 0.25 || speed > 4.0) {
    return jsonError("속도는 0.25~4.0 사이여야 합니다.", 400);
  }
  if (instructions !== undefined) {
    if (typeof instructions !== "string") {
      return jsonError("잘못된 톤 지시입니다.", 400);
    }
    if (instructions.length > MAX_INSTRUCTIONS) {
      return jsonError(`톤 지시는 ${MAX_INSTRUCTIONS.toLocaleString()}자 이하로 입력해 주세요.`, 400);
    }
    if (instructions.trim() && !INSTRUCTABLE_MODELS.has(model)) {
      return jsonError("톤 지시는 최신 모델(gpt-4o-mini-tts)에서만 사용할 수 있습니다.", 400);
    }
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model,
      input: input.trim(),
      voice,
      response_format,
      speed,
      ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = MIME_MAP[response_format] || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="tts-output.${response_format}"`,
      },
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return jsonError("OpenAI API 키가 유효하지 않습니다.", 500);
    }
    if (err?.status === 429) {
      return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    // 모델·음성 조합 등 파라미터 오류는 원인이 바로 보이도록 OpenAI 메시지를 그대로 전달한다.
    if (err?.status === 400 && err?.error?.message) {
      return jsonError(err.error.message, 400);
    }
    return jsonError("음성 생성 중 오류가 발생했습니다.", 500);
  }
}
