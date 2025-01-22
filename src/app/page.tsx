"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import clsx from "clsx";

const Home = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef(null);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [regions, setRegions] = useState<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false); // 재생 상태 관리
  const [volume, setVolume] = useState(0.5); // 음량 상태 관리 (기본값 50%)
  const [currentTime, setCurrentTime] = useState(0); // 현재 시간
  const [duration, setDuration] = useState(0); // 전체 시간
  const [fileType, setFileType] = useState<"audio" | "video" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && videoRef.current && waveformRef.current) {
      const regionsPlugin = RegionsPlugin.create();
      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "rgb(200, 0, 200)",
        progressColor: "rgb(100, 0, 100)",
        plugins: [regionsPlugin],
        minPxPerSec: 10,
        media: videoRef.current,
        // volume: volume, // 초기 볼륨 설정
      });

      setRegions(regionsPlugin);

      const random = (min: number, max: number) => Math.random() * (max - min) + min;
      const randomColor = () => `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`;

      ws.on("ready", () => {
        setDuration(ws.getDuration()); // 전체 재생 시간 설정
      });

      ws.on("audioprocess", () => {
        setCurrentTime(ws.getCurrentTime()); // 현재 재생 시간 업데이트
      });

      ws.on("decode", () => {
        // regionsPlugin.addRegion({
        //   start: 0,
        //   end: 8,
        //   content: "Resize me",
        //   color: randomColor(),
        //   drag: false,
        //   resize: true,
        // });
        // ... (다른 region 추가 코드)
      });

      regionsPlugin.enableDragSelection({ color: "rgba(255, 0, 0, 0.1)" });

      regionsPlugin.on("region-updated", (region) => {
        console.log("Updated region", region);
      });

      ws.on("play", () => setIsPlaying(true)); // 재생 시작 시 상태 업데이트
      ws.on("pause", () => setIsPlaying(false)); // 일시정지 시 상태 업데이트

      let activeRegion: any = null;
      regionsPlugin.on("region-in", (region) => {
        activeRegion = region;
      });

      regionsPlugin.on("region-out", (region) => {
        if (activeRegion === region) {
          region.play();
        } else {
          activeRegion = null;
        }
      });

      regionsPlugin.on("region-created", (region) => {
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "X";
        deleteButton.className = "delete-region";
        deleteButton.style.position = "absolute";
        deleteButton.style.right = "2px";
        deleteButton.style.top = "2px";
        deleteButton.style.padding = "2px 5px";
        deleteButton.style.background = "red";
        deleteButton.style.color = "white";
        deleteButton.style.border = "none";
        deleteButton.style.borderRadius = "3px";
        deleteButton.style.cursor = "pointer";

        deleteButton.addEventListener("click", (e) => {
          e.stopPropagation();
          region.remove();
        });

        region.element.appendChild(deleteButton);
      });

      regionsPlugin.on("region-clicked", (region, e) => {
        e.stopPropagation();
        activeRegion = region;
        region.play();
        region.setOptions({ color: randomColor() });
      });

      ws.on("interaction", () => {
        activeRegion = null;
      });

      ws.once("decode", () => {
        const slider = document.getElementById("zoom-slider") as HTMLInputElement;
        slider.oninput = (e) => {
          ws.zoom(Number((e.target as HTMLInputElement).value));
        };
      });

      setWaveSurfer(ws);

      return () => ws.destroy();
    }
  }, []);

  useEffect(() => {
    if (waveSurfer) {
      waveSurfer.setPlaybackRate(playbackRate); // 재생 속도 업데이트
    }
  }, [playbackRate, waveSurfer]);

  useEffect(() => {
    if (waveSurfer) {
      waveSurfer.setVolume(volume); // 음량 업데이트
    }
  }, [volume, waveSurfer]);

  // Space bar 단축키 이벤트 핸들링
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault(); // 기본 스크롤 동작 방지
        togglePlayPause();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [waveSurfer]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && waveSurfer) {
      // 기존 구간 삭제
      regions?.clearRegions();

      const file = event.target.files[0];
      const objectURL = URL.createObjectURL(file);

      // 파일 타입 확인
      if (file.type.startsWith("audio")) {
        setFileType("audio");
      } else if (file.type.startsWith("video")) {
        setFileType("video");
      } else {
        setFileType(null);
        alert("오디오 또는 비디오 파일을 선택해주세요.");
        return;
      }

      waveSurfer.load(objectURL);
      setIsPlaying(false); // 파일 변경 시 재생 상태 초기화
    }
  };

  // const handlePlay = () => {
  //   if (waveSurfer) {
  //     waveSurfer.play();
  //   }
  // };
  //
  // const handleStop = () => {
  //   if (waveSurfer) {
  //     waveSurfer.playPause();
  //   }
  // };

  const togglePlayPause = () => {
    if (waveSurfer) {
      if (waveSurfer.isPlaying()) {
        waveSurfer.pause(); // 재생 중이면 일시정지
      } else {
        waveSurfer.play(); // 정지 상태면 재생
      }
    }
  };

  const skipTime = (seconds: number) => {
    if (waveSurfer) {
      let newTime = waveSurfer.getCurrentTime() + seconds;
      if (newTime < 0) newTime = 0;
      if (newTime > duration) newTime = duration;
      waveSurfer.setTime(newTime);
      setCurrentTime(newTime);
    }
  };

  // 시간 포맷 변환 함수
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(1); // 소숫점 첫째 자리까지 표시
    return `${minutes}:${seconds.padStart(4, "0")}`; // "분:초.소숫점" 형식
  };

  return (
    <div className="flex h-screen flex-col items-center p-4">
      <p className={"w-full text-center text-xl font-bold"}>재생할 파일을 선택해 주세요.</p>
      <div className={"w-full"}>
        <div>
          <input type="file" accept="audio/*, video/*" onChange={handleFileChange} />
        </div>

        <video
          ref={videoRef}
          // controls
          playsInline
          className={clsx("mx-auto mb-4 w-full max-w-3xl", {
            hidden: fileType === null || fileType === "audio",
            "pointer-events-none": fileType === "video",
          })}
        />

        {/* 파형 표시 */}
        <div id="waveform" ref={waveformRef} className="mt-4 rounded-md border-4 border-gray-300 bg-gray-100"></div>
        {/* 시간 표시 */}
        <div className="flex justify-between text-gray-700">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* progress bar */}
      <div
        className="relative mx-auto mb-8 h-4 w-full max-w-3xl cursor-pointer rounded bg-gray-300"
        onClick={(e) => {
          if (waveSurfer && duration) {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const newTime = (clickX / rect.width) * duration;
            waveSurfer.setTime(newTime);
            setCurrentTime(newTime);
          }
        }}>
        <div
          className="absolute left-0 top-0 h-full rounded"
          style={{
            width: `${(currentTime / duration) * 100}%`,
            backgroundColor: isPlaying ? "#3b82f6" : "#94a3b8",
          }}></div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={() => skipTime(-5)} className="rounded bg-gray-500 px-4 py-2 text-white">
          뒤로가기
        </button>
        <button onClick={togglePlayPause} className="w-20 rounded bg-blue-500 px-4 py-2 text-white">
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={() => skipTime(5)} className="rounded bg-gray-500 px-4 py-2 text-white">
          앞으로 가기
        </button>

        <button onClick={() => regions?.clearRegions()} className="rounded bg-yellow-500 px-4 py-2 text-white">
          Clear All Regions
        </button>
      </div>

      <div className="mt-10 flex w-full items-center justify-around gap-4">
        <label className="flex items-center gap-2">
          Zoom in-out:
          <input type="range" id="zoom-slider" min="10" max="1000" defaultValue="10" />
        </label>

        <label className="flex items-center gap-2">
          Play-Speed:
          <input type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={(e) => setPlaybackRate(parseFloat(e.target.value))} />
          <span>{playbackRate}x</span>
        </label>

        <label className="flex items-center gap-2">
          Volume:
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
          <span>{Math.round(volume * 100)}%</span>
        </label>
      </div>

      <p className="mt-4 text-blue-500">
        📖 <a href="https://wavesurfer.xyz/docs/classes/plugins_regions.RegionsPlugin">Regions plugin docs</a>
      </p>
    </div>
  );
};

export default Home;
