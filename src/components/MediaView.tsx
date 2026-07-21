// src/components/MediaView.tsx
"use client";

import React, { forwardRef, useEffect, useState } from "react";
import { AlertTriangle, Wand2 } from "lucide-react";
import type { MediaKind } from "@/store/playerStore";

type Props = {
  mediaUrl: string | null;
  mediaKind: MediaKind;
  showVideo: boolean;
  onToggle?: () => void; // 화면 더블클릭 시 재생/일시정지 토글
  onRequestConvert?: () => void; // 호환 포맷으로 변환 요청
  converting?: boolean; // 변환 진행 중
  convertProgress?: number; // 0~1
};

// MediaError.code → 사용자 안내 문구
function errorMessage(code?: number): string {
  switch (code) {
    case 2: // MEDIA_ERR_NETWORK
      return "네트워크 오류로 미디어를 불러오지 못했습니다.";
    case 3: // MEDIA_ERR_DECODE
      return "미디어를 디코딩할 수 없습니다. 파일이 손상되었거나 지원하지 않는 코덱일 수 있습니다.";
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return "이 브라우저가 지원하지 않는 형식이거나 코덱입니다. (H.264 코덱의 MP4 파일을 권장합니다)";
    default:
      return "미디어를 재생할 수 없습니다.";
  }
}

const MediaView = forwardRef<HTMLVideoElement, Props>(function MediaView(
  { mediaUrl, mediaKind, showVideo, onToggle, onRequestConvert, converting, convertProgress },
  ref,
) {
  // ✅ video 엘리먼트를 “단일 재생 소스”로 사용 (audio 파일도 video 엘리먼트로 재생 가능)
  // - audio 모드에서는 UI를 숨기고(파형/컨트롤만 노출)
  // - video 모드에서는 화면을 보여줌
  const visible = mediaKind === "video" && showVideo;

  // ✅ 재생 실패(코덱/컨테이너 미지원 등) 감지
  const [error, setError] = useState<string | null>(null);

  // 소스가 바뀌면 이전 에러 초기화
  useEffect(() => {
    setError(null);
  }, [mediaUrl]);

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const code = e.currentTarget.error?.code;
    // 1 = MEDIA_ERR_ABORTED: 소스 교체/초기화 시 발생하므로 무시
    if (code === 1) return;
    setError(errorMessage(code));
  };

  const box = "overflow-hidden rounded-3xl border shadow-sm";
  const pct = Math.round(Math.max(0, Math.min(1, convertProgress ?? 0)) * 100);

  // 변환 버튼 / 진행률 표시
  const convertUI = onRequestConvert ? (
    converting ? (
      <div className="flex flex-col items-center gap-2">
        <div className="text-xs font-medium text-white">호환 포맷으로 변환 중… {pct}%</div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-white/70">동영상 길이에 따라 다소 시간이 걸릴 수 있어요.</div>
      </div>
    ) : (
      <button
        onClick={onRequestConvert}
        className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-600">
        <Wand2 className="h-4 w-4" />
        호환 포맷(MP4)으로 변환
      </button>
    )
  ) : null;

  return (
    <>
      {/* 비디오 화면 (에러 시 오버레이 표시) */}
      <div className={visible ? "w-full" : "hidden"}>
        <div className={`relative border-zinc-200 bg-black ${box}`}>
          <video
            ref={ref}
            src={mediaUrl ?? undefined}
            playsInline
            preload="metadata"
            controls={false}
            onError={handleError}
            onDoubleClick={onToggle}
            className="h-full w-full cursor-pointer select-none"
          />
          {error || converting ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              {!converting ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                  <div className="text-sm font-medium text-white">{error}</div>
                </>
              ) : null}
              {convertUI}
            </div>
          ) : null}
        </div>
      </div>

      {/* 화면이 숨겨진 상태(오디오로 분류되었거나 비디오 숨김)에서의 에러 안내 배너 */}
      {(error || converting) && !visible ? (
        <div className={`flex flex-col gap-3 border-amber-200 bg-amber-50 p-4 ${box}`}>
          {!converting ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="text-sm font-medium text-amber-800">{error}</div>
            </div>
          ) : null}
          {onRequestConvert ? (
            converting ? (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-amber-800">호환 포맷으로 변환 중… {pct}%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                  <div className="h-full bg-amber-500 transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : (
              <button
                onClick={onRequestConvert}
                className="inline-flex w-fit items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-600">
                <Wand2 className="h-4 w-4" />
                호환 포맷(MP4)으로 변환
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </>
  );
});

export default MediaView;
