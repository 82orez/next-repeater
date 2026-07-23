// src/lib/videoTranscode.ts
// ✅ ffmpeg.wasm으로 브라우저 내에서 동영상을 크롬 호환 MP4(H.264 + AAC)로 재인코딩
// - 싱글스레드 코어 사용 → SharedArrayBuffer/COOP-COEP 불필요
// - 코어(js/wasm)는 /public/ffmpeg 에 셀프 호스팅 (CDN 의존 없음)
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_BASE = "/ffmpeg";

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// FFmpeg 인스턴스를 한 번만 로드(32MB wasm 재로드 방지)
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (!loadPromise) {
    loadPromise = (async () => {
      const instance = new FFmpeg();
      await instance.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpeg = instance;
      return instance;
    })().catch((e) => {
      // 실패 시 다음 시도에서 재로드할 수 있도록 초기화
      loadPromise = null;
      throw e;
    });
  }
  return loadPromise;
}

export type TranscodeProgress = (ratio: number) => void;

export type TranscodeOptions = {
  scaleHeight?: number | null; // 세로 해상도(px). null/미지정 = 원본 유지
  crf?: number; // H.264 품질(낮을수록 고화질·큰 용량). 기본 23
  audioKbps?: number; // 오디오 비트레이트. 기본 160
};

// 원본(blob URL 등)을 크롬 호환 MP4(H.264+AAC)로 재인코딩하고 새 blob URL을 반환
// - scaleHeight로 다운스케일, crf로 화질/용량 조절
export async function transcodeVideo(
  sourceUrl: string,
  fileName?: string | null,
  opts?: TranscodeOptions,
  onProgress?: TranscodeProgress,
): Promise<{ url: string; fileName: string }> {
  const scaleHeight = opts?.scaleHeight ?? null;
  const crf = opts?.crf ?? 23;
  const audioKbps = opts?.audioKbps ?? 160;

  const ff = await getFFmpeg();

  const inName = "input" + inputExt(fileName);
  const outName = "output.mp4";

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ff.on("progress", handleProgress);

  try {
    await ff.writeFile(inName, await fetchFile(sourceUrl));

    // 데이터/자막 스트림 제외하고 첫 비디오·오디오만 사용, +faststart 로 웹 스트리밍 최적화
    const args = ["-i", inName, "-map", "0:v:0", "-map", "0:a:0?"];
    if (scaleHeight) args.push("-vf", `scale=-2:${scaleHeight}`);
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(crf),
      "-c:a", "aac",
      "-b:a", `${audioKbps}k`,
      "-movflags", "+faststart",
      outName,
    );
    await ff.exec(args);

    const data = (await ff.readFile(outName)) as Uint8Array;
    const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    // 작업 파일 정리(다음 변환에 영향 없도록)
    try {
      await ff.deleteFile(inName);
      await ff.deleteFile(outName);
    } catch {
      // ignore
    }

    return { url, fileName: makeMp4Name(fileName, scaleHeight) };
  } finally {
    ff.off("progress", handleProgress);
  }
}

// 재생 실패(코덱) 시 호환 MP4로 변환 — 원본 해상도 유지, 기본 화질
export function transcodeToPlayableMp4(
  sourceUrl: string,
  fileName?: string | null,
  onProgress?: TranscodeProgress,
): Promise<{ url: string; fileName: string }> {
  return transcodeVideo(sourceUrl, fileName, undefined, onProgress);
}

// 원본 확장자를 살려 입력 파일명 생성(ffmpeg 포맷 추정에 도움)
function inputExt(fileName?: string | null): string {
  const m = fileName?.match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : ".bin";
}

// 원본 파일명에서 확장자를 떼고 `_720p.mp4`(스케일 시) 또는 `_변환.mp4`
function makeMp4Name(fileName?: string | null, scaleHeight?: number | null): string {
  const suffix = scaleHeight ? `_${scaleHeight}p` : "_변환";
  if (!fileName) return `converted${suffix}.mp4`;
  const base = fileName.replace(/\.[^/.]+$/, "");
  return `${base}${suffix}.mp4`;
}
