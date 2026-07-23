"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Copy, Download, FileText, Upload } from "lucide-react";

const MODELS = [
  { id: "gpt-4o-transcribe", label: "고품질 (gpt-4o-transcribe)" },
  { id: "whisper-1", label: "범용 (whisper-1)" },
  { id: "gpt-4o-mini-transcribe", label: "경제적 (gpt-4o-mini-transcribe)" },
] as const;

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 업로드 제한 25MB

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SttClient() {
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>("whisper-1");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtUrlRef = useRef<string | null>(null);

  const revokeTxt = () => {
    if (txtUrlRef.current) {
      URL.revokeObjectURL(txtUrlRef.current);
      txtUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => revokeTxt();
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("파일이 25MB를 초과합니다. 더 작은 파일로 시도해 주세요.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const onExtract = async () => {
    if (!file || isLoading) return;
    if (!window.confirm("해당 파일에서 텍스트를 추출하시겠습니까? OpenAI API가 호출되고 token이 소모됩니다.")) return;

    setIsLoading(true);
    setError(null);
    setResultText(null);
    revokeTxt();

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", model);

      const res = await fetch("/api/stt", { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "텍스트 추출에 실패했습니다.");
      }

      const data = await res.json();
      setResultText(typeof data?.text === "string" ? data.text : String(data?.text ?? ""));
    } catch (e: any) {
      setError(e.message || "텍스트 추출 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const onCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  };

  const downloadName = file ? `${file.name.replace(/\.[^.]+$/, "")}.txt` : "transcript.txt";
  const onDownload = () => {
    if (!resultText) return;
    revokeTxt();
    const blob = new Blob([resultText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    txtUrlRef.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.click();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {/* 헤더 */}
      <header className="mb-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          플레이어로 돌아가기
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">음성 텍스트 추출 (STT)</h1>
        <p className="mt-2 text-sm text-zinc-600">오디오·비디오 파일을 업로드하면 OpenAI로 텍스트를 추출합니다. (최대 25MB)</p>
      </header>

      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        {/* 파일 선택 */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">파일</label>
          <input ref={fileInputRef} type="file" accept="audio/*,video/*" onChange={onFileChange} className="hidden" id="stt-file-input" />
          <label
            htmlFor="stt-file-input"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-600 hover:bg-zinc-100">
            <Upload className="h-4 w-4 shrink-0" />
            {file ? (
              <span className="min-w-0 truncate">
                <span className="font-medium text-zinc-800">{file.name}</span>
                <span className="ml-2 text-xs text-zinc-400">{formatSize(file.size)}</span>
              </span>
            ) : (
              <span className="text-zinc-400">오디오·비디오 파일을 선택하세요...</span>
            )}
          </label>
        </div>

        {/* 모델 선택 */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">모델</label>
          <div className="flex flex-wrap gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={clsx(
                  "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                  model === m.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100",
                )}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 추출 버튼 */}
        <button
          onClick={onExtract}
          disabled={!file || isLoading}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
            !file || isLoading ? "cursor-not-allowed bg-zinc-300 text-zinc-500" : "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800",
          )}>
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
              추출 중...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              텍스트 추출
            </>
          )}
        </button>

        {/* 에러 */}
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* 결과 */}
        {resultText !== null && (
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">추출된 텍스트</p>
              <div className="flex gap-2">
                <button
                  onClick={onCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  onClick={onDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800">
                  <Download className="h-3.5 w-3.5" />
                  다운로드
                </button>
              </div>
            </div>
            <textarea
              value={resultText}
              readOnly
              rows={10}
              className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none"
            />
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-500">OpenAI 음성 인식 API — 음성 텍스트 추출</footer>
    </div>
  );
}
