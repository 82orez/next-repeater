import OpenAI from "openai";
import { NextResponse } from "next/server";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
const MODELS = ["tts-1", "tts-1-hd"] as const;
const FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;

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

  const { input, model, voice, response_format, speed } = body;

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
  if (!FORMATS.includes(response_format)) {
    return jsonError("잘못된 출력 형식입니다.", 400);
  }
  if (typeof speed !== "number" || speed < 0.25 || speed > 4.0) {
    return jsonError("속도는 0.25~4.0 사이여야 합니다.", 400);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model,
      input: input.trim(),
      voice,
      response_format,
      speed,
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
    return jsonError("음성 생성 중 오류가 발생했습니다.", 500);
  }
}
