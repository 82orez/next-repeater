// src/lib/audioExport.ts
import { clamp } from "@/lib/time";
import { Mp3Encoder } from "@breezystack/lamejs";

// ✅ 선택 구간(A–B)의 음원만 잘라 오디오 파일로 다운로드
// - 오디오/비디오 파일 모두 오디오 트랙만 디코딩하므로 동일하게 동작
// - WAV: 무압축(크지만 라이브러리 불필요), MP3: lamejs로 손실 압축(크기 대폭 감소)

type Region = { channels: Float32Array[]; sampleRate: number };

// blob URL을 fetch → decode → A–B 구간 샘플만 채널별로 슬라이스
async function decodeRegion(mediaUrl: string, startSec: number, endSec: number): Promise<Region> {
  const res = await fetch(mediaUrl);
  const arrayBuffer = await res.arrayBuffer();

  const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    // decodeAudioData는 브라우저에 따라 Promise/콜백 두 형태라 래핑
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });

    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;

    const a = Math.min(startSec, endSec);
    const b = Math.max(startSec, endSec);
    const startIdx = clamp(Math.round(a * sampleRate), 0, totalSamples);
    const endIdx = clamp(Math.round(b * sampleRate), startIdx, totalSamples);
    if (endIdx - startIdx <= 0) throw new Error("선택 구간이 비어 있습니다.");

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch).subarray(startIdx, endIdx));
    }
    return { channels, sampleRate };
  } finally {
    if (ctx.state !== "closed") ctx.close();
  }
}

// 선택 구간을 MP3로 추출
export async function extractRegionToMp3(
  mediaUrl: string,
  startSec: number,
  endSec: number,
  fileName?: string | null,
  kbps = 192,
): Promise<void> {
  const { channels, sampleRate } = await decodeRegion(mediaUrl, startSec, endSec);
  const blob = encodeMp3(channels, sampleRate, kbps);
  triggerDownload(blob, makeFileName(fileName, "mp3"));
}

// 선택 구간을 WAV로 추출(무압축)
export async function extractRegionToWav(mediaUrl: string, startSec: number, endSec: number, fileName?: string | null): Promise<void> {
  const { channels, sampleRate } = await decodeRegion(mediaUrl, startSec, endSec);
  const blob = encodeWav(channels, sampleRate);
  triggerDownload(blob, makeFileName(fileName, "wav"));
}

// Float32(-1~1) → Int16 PCM
function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = clamp(input[i], -1, 1);
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// 채널별 Float32 데이터를 MP3(Blob)로 인코딩 (lamejs)
function encodeMp3(channelData: Float32Array[], sampleRate: number, kbps: number): Blob {
  // lamejs는 mono/stereo만 지원 → 3채널 이상이면 앞 2채널만 사용
  const numChannels = channelData.length >= 2 ? 2 : 1;
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const left = floatToInt16(channelData[0]);
  const right = numChannels === 2 ? floatToInt16(channelData[1]) : undefined;

  const BLOCK = 1152; // MP3 프레임 샘플 수
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const r = right ? right.subarray(i, i + BLOCK) : undefined;
    const buf = encoder.encodeBuffer(l, r);
    if (buf.length > 0) chunks.push(buf);
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(end);

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

// 채널별 Float32 데이터를 표준 16-bit PCM WAV(Blob)로 인코딩
function encodeWav(channelData: Float32Array[], sampleRate: number): Blob {
  const numChannels = channelData.length;
  const numFrames = channelData[0]?.length ?? 0;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = clamp(channelData[ch][i], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// 원본 파일명에서 확장자를 떼고 `_구간.<ext>`를 붙임
function makeFileName(fileName: string | null | undefined, ext: string): string {
  if (!fileName) return `clip.${ext}`;
  const base = fileName.replace(/\.[^/.]+$/, "");
  return `${base}_구간.${ext}`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
