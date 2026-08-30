import "./style.css";
import { startCamera, type CameraHandle } from "./camera.ts";
import {
  requestOrientationPermission,
  startOrientation,
  type OrientationReading,
} from "./orientation.ts";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const altitudeEl = document.querySelector<HTMLElement>("#altitude")!;
const azimuthEl = document.querySelector<HTMLElement>("#azimuth")!;
const debugEl = document.querySelector<HTMLPreElement>("#debug")!;

let camera: CameraHandle | null = null;
let stopOrientation: (() => void) | null = null;
let running = false;

const COMPASS_LABELS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];

function formatDeg(value: number | null, digits = 0): string {
  return value === null || Number.isNaN(value) ? "--" : value.toFixed(digits);
}

function compassLabel(azimuth: number): string {
  return COMPASS_LABELS[Math.round(azimuth / 45) % 8];
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "カメラの使用が許可されませんでした。";
    if (error.name === "NotFoundError") return "利用できるカメラが見つかりませんでした。";
    return error.message;
  }
  return String(error);
}

function render(reading: OrientationReading): void {
  altitudeEl.textContent = `${formatDeg(reading.altitude, 1)}°`;
  azimuthEl.textContent = `${formatDeg(reading.azimuth, 1)}° ${compassLabel(reading.azimuth)}`;

  debugEl.textContent = [
    `alpha              : ${formatDeg(reading.alpha, 2)}`,
    `beta               : ${formatDeg(reading.beta, 2)}`,
    `gamma              : ${formatDeg(reading.gamma, 2)}`,
    `screen orientation : ${reading.screenOrientation}°`,
    `altitude (計算後)  : ${formatDeg(reading.altitude, 3)}°`,
    `azimuth  (計算後)  : ${formatDeg(reading.azimuth, 3)}°`,
    `heading source     : ${reading.headingSource}`,
    `absolute           : ${reading.absolute}`,
  ].join("\n");
}

async function start(): Promise<void> {
  if (running) return;
  startButton.disabled = true;
  statusEl.textContent = "カメラとセンサーの利用許可を確認しています…";

  try {
    camera = await startCamera(video);
  } catch (error) {
    statusEl.textContent = `カメラを開始できませんでした: ${describeError(error)}`;
    startButton.disabled = false;
    return;
  }

  const permission = await requestOrientationPermission();
  if (permission === "denied") {
    statusEl.textContent =
      "方位センサーの利用が許可されませんでした。ブラウザ設定を確認して再度お試しください。";
    camera.stop();
    camera = null;
    startButton.disabled = false;
    return;
  }

  stopOrientation = startOrientation(render);
  running = true;
  startButton.textContent = "計測を停止";
  startButton.disabled = false;
  statusEl.textContent =
    permission === "unsupported"
      ? "計測中です(この端末は追加の許可なしでセンサーを使用します)。"
      : "計測中です。";
}

function stop(): void {
  stopOrientation?.();
  stopOrientation = null;
  camera?.stop();
  camera = null;
  running = false;
  startButton.textContent = "計測を開始";
  altitudeEl.textContent = "--";
  azimuthEl.textContent = "--";
  statusEl.textContent = "計測を停止しました。もう一度開始できます。";
}

startButton.addEventListener("click", () => {
  if (running) {
    stop();
  } else {
    void start();
  }
});
