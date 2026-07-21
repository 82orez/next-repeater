// src/lib/audioExport.ts
import { clamp } from "@/lib/time";

// ✅ 선택 구간(A–B)의 음원만 잘라 16-bit PCM WAV 파일로 다운로드
// - 오디오/비디오 파일 모두 오디오 트랙만 디코딩하므로 동일하게 동작
// - 원본의 채널 수·샘플레이트를 그대로 유지
export async function extractRegionToWav(mediaUrl: string, startSec: number, endSec: number, fileName?: string | null): Promise<void> {
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
    const frameCount = endIdx - startIdx;
    if (frameCount <= 0) throw new Error("선택 구간이 비어 있습니다.");

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch).subarray(startIdx, endIdx));
    }

    const blob = encodeWav(channels, sampleRate);
    triggerDownload(blob, makeFileName(fileName));
  } finally {
    // 리소스 정리
    if (ctx.state !== "closed") ctx.close();
  }
}

// 원본 파일명에서 확장자를 떼고 `_구간.wav`를 붙임
function makeFileName(fileName?: string | null): string {
  if (!fileName) return "clip.wav";
  const base = fileName.replace(/\.[^/.]+$/, "");
  return `${base}_구간.wav`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다운로드 트리거 후 URL 해제(약간의 지연으로 안전하게)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  // RIFF 헤더
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  // fmt 청크
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM 헤더 크기
  view.setUint16(20, 1, true); // audioFormat = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bitsPerSample
  // data 청크
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // 인터리브 + Float→Int16 변환
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
