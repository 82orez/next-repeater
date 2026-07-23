import OpenAI from "openai";
import { NextResponse } from "next/server";

const MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"] as const;
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 업로드 제한 25MB

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError("서버에 OpenAI API 키가 설정되지 않았습니다.", 500);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("잘못된 요청입니다.", 400);
  }

  const file = form.get("file");
  const model = form.get("model");

  if (!(file instanceof File) || file.size === 0) {
    return jsonError("오디오 파일을 첨부해 주세요.", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("파일이 25MB를 초과합니다. 더 작은 파일로 시도해 주세요.", 413);
  }
  if (typeof model !== "string" || !MODELS.includes(model as any)) {
    return jsonError("잘못된 모델입니다.", 400);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const text = await openai.audio.transcriptions.create({
      file,
      model,
      response_format: "text",
    });

    return NextResponse.json({ text });
  } catch (err: any) {
    if (err?.status === 401) {
      return jsonError("OpenAI API 키가 유효하지 않습니다.", 500);
    }
    if (err?.status === 429) {
      return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    return jsonError("텍스트 추출 중 오류가 발생했습니다.", 500);
  }
}
