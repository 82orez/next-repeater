"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

const Home = () => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const [waveSurfer, setWaveSurfer] = useState<WaveSurfer | null>(null);
  const [loop, setLoop] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1); // 기본 재생 속도는 1

  useEffect(() => {
    if (!waveformRef.current) return;

    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "rgb(200, 0, 200)",
      progressColor: "rgb(100, 0, 100)",
      plugins: [regions],
      minPxPerSec: 10, // 줌 기능을 위해 기본값 설정
    });

    const random = (min: number, max: number) => Math.random() * (max - min) + min;
    const randomColor = () => `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`;

    ws.on("decode", () => {
      regions.addRegion({
        start: 0,
        end: 8,
        content: "Resize me",
        color: randomColor(),
        drag: false,
        resize: true,
      });
      regions.addRegion({
        start: 9,
        end: 10,
        content: "Cramped region",
        color: randomColor(),
        minLength: 1,
        maxLength: 10,
      });
      regions.addRegion({
        start: 12,
        end: 17,
        content: "Drag me",
        color: randomColor(),
        resize: false,
      });
      regions.addRegion({ start: 19, content: "Marker", color: randomColor() });
      regions.addRegion({ start: 20, content: "Second marker", color: randomColor() });
    });

    regions.enableDragSelection({ color: "rgba(255, 0, 0, 0.1)" });

    regions.on("region-updated", (region) => {
      console.log("Updated region", region);
    });

    let activeRegion: any = null;
    regions.on("region-in", (region) => {
      activeRegion = region;
    });

    regions.on("region-out", (region) => {
      if (activeRegion === region && loop) {
        region.play();
      } else {
        activeRegion = null;
      }
    });

    regions.on("region-clicked", (region, e) => {
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
  }, [loop]);

  useEffect(() => {
    if (waveSurfer) {
      waveSurfer.setPlaybackRate(playbackRate); // 재생 속도 업데이트
    }
  }, [playbackRate, waveSurfer]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && waveSurfer) {
      const file = event.target.files[0];
      const objectURL = URL.createObjectURL(file);
      waveSurfer.load(objectURL);
    }
  };

  const handlePlay = () => {
    if (waveSurfer) {
      waveSurfer.play();
    }
  };

  const handleStop = () => {
    if (waveSurfer) {
      waveSurfer.stop();
    }
  };

  return (
    <div className="p-4">
      <div>
        <input type="file" accept="audio/*" onChange={handleFileChange} />
      </div>

      <div id="waveform" ref={waveformRef} className="mb-4"></div>

      <div className="flex items-center gap-4">
        <button onClick={handlePlay} className="rounded bg-blue-500 px-4 py-2 text-white">
          Play
        </button>
        <button onClick={handleStop} className="rounded bg-red-500 px-4 py-2 text-white">
          Stop
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          Loop regions
        </label>

        <label className="flex items-center gap-2">
          Zoom:
          <input type="range" id="zoom-slider" min="10" max="1000" defaultValue="10" />
        </label>

        <label className="flex items-center gap-2">
          Playback Speed:
          <input type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={(e) => setPlaybackRate(parseFloat(e.target.value))} />
          <span>{playbackRate}x</span>
        </label>
      </div>

      <p className="mt-4 text-blue-500">
        📖 <a href="https://wavesurfer.xyz/docs/classes/plugins_regions.RegionsPlugin">Regions plugin docs</a>
      </p>
    </div>
  );
};

export default Home;
