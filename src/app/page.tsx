"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

const Home = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [regions, setRegions] = useState<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false); // 재생 상태 관리
  const [volume, setVolume] = useState(0.5); // 음량 상태 관리 (기본값 50%)

  useEffect(() => {
    if (!waveformRef.current) return;

    const regionsPlugin = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "rgb(200, 0, 200)",
      progressColor: "rgb(100, 0, 100)",
      plugins: [regionsPlugin],
      minPxPerSec: 10,
      // volume: volume, // 초기 볼륨 설정
    });

    setRegions(regionsPlugin);

    const random = (min: number, max: number) => Math.random() * (max - min) + min;
    const randomColor = () => `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`;

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && waveSurfer) {
      // 기존 구간 삭제
      regions?.clearRegions();

      const file = event.target.files[0];
      const objectURL = URL.createObjectURL(file);
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

  return (
    <div className="p-4">
      <div>
        <input type="file" accept="audio/*" onChange={handleFileChange} />
      </div>

      <div id="waveform" ref={waveformRef} className="my-4 rounded-md border-2"></div>

      <div className="flex items-center gap-4">
        <button onClick={togglePlayPause} className="w-20 rounded bg-blue-500 px-4 py-2 text-white">
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={() => regions?.clearRegions()} className="rounded bg-yellow-500 px-4 py-2 text-white">
          Clear All Regions
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <label className="flex items-center gap-2">
          Zoom:
          <input type="range" id="zoom-slider" min="10" max="1000" defaultValue="10" />
        </label>

        <label className="flex items-center gap-2">
          Playback Speed:
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
