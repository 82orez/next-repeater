"use client";

// ✅ window.confirm 대체용 확인 모달.
//    네이티브 <dialog>의 showModal()을 쓰므로 포커스 트랩·Esc 닫기·배경 처리를 브라우저가 담당한다
//    (직접 만들면 접근성 처리를 다시 짜야 한다).
import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  // 문자열 외에 구조화된 내용(설정 요약 등)도 넘길 수 있다
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ open, title, description, confirmLabel = "확인", cancelLabel = "취소", onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Esc는 dialog의 cancel 이벤트로 들어온다 — 기본 닫힘을 막고 상태를 통해 닫아야 open과 어긋나지 않는다
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // 배경(::backdrop) 클릭 시 닫기. 내용 영역 클릭은 target이 내부 요소라 걸리지 않는다
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-zinc-900/40">
      <div className="p-5">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {/* ReactNode를 받으므로 <p>가 아니라 <div> — 내부에 블록 요소가 와도 유효한 마크업이 된다 */}
        {description && <div className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
