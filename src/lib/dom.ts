// 모달(<dialog showModal>)이 떠 있는 동안에는 전역 단축키를 넘긴다.
// Player/Waveform의 keydown 리스너가 window에 붙어 있어 모달 위에서도 발동하기 때문.
export const isModalOpen = () => typeof document !== "undefined" && document.querySelector("dialog[open]") != null;
