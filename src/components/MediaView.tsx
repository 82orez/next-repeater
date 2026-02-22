// src/components/MediaView.tsx
"use client";

import React, { forwardRef } from "react";
import type { MediaKind } from "@/store/playerStore";

type Props = {
  mediaUrl: string | null;
  mediaKind: MediaKind;
  showVideo: boolean;
};

const MediaView = forwardRef<HTMLVideoElement, Props>(function MediaView({ mediaUrl, mediaKind, showVideo }, ref) {
  // ✅ video 엘리먼트를 “단일 재생 소스”로 사용 (audio 파일도 video 엘리먼트로 재생 가능)
  // - audio 모드에서는 UI를 숨기고(파형/컨트롤만 노출)
  // - video 모드에서는 화면을 보여줌
  const visible = mediaKind === "video" && showVideo;

  return (
    <div className={visible ? "w-full" : "hidden"}>
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-sm">
        <video ref={ref} src={mediaUrl ?? undefined} playsInline preload="metadata" controls={false} className="h-full w-full" />
      </div>
    </div>
  );
});

export default MediaView;
