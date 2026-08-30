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

/** requestPermission() の結果(granted / denied / ...)をデバッグ表示用に保持。 */
let permissionDetail = "(未取得)";

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
    return `${error.name}: ${error.message}`;
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
    `orientation perm   : ${permissionDetail}`,
  ].join("\n");
}

function showDebugMessage(message: string): void {
  debugEl.textContent = [
    `orientation perm   : ${permissionDetail}`,
    "",
    message,
  ].join("\n");
}

async function start(): Promise<void> {
  if (running) return;
  startButton.disabled = true;
  statusEl.textContent = "方位センサーの利用許可を確認しています…";

  // ── 1. iOS Safari: DeviceOrientationEvent.requestPermission() ──
  // click ハンドラ直後、カメラ取得など他の await を一切挟まずに最初に呼ぶ。
  // (先に await するとユーザー操作の transient activation を失い、
  //  requestPermission() が NotAllowedError で失敗する)
  const orientationPerm = await requestOrientationPermission();
  permissionDetail = `${orientationPerm.state} — ${orientationPerm.detail}`;

  if (orientationPerm.state === "denied") {
    statusEl.textContent =
      "方位センサーの利用が許可されませんでした。iPhone の「設定 → Safari → モーションと画面の向きのアクセス」がオンか確認し、ページを再読み込みして再度お試しください。";
    showDebugMessage('DeviceOrientation: "denied"（ユーザーが拒否、または OS 設定で無効）');
    startButton.disabled = false;
    return;
  }

  // ── 2. カメラ (iOS の getUserMedia は transient activation 不要) ──
  try {
    camera = await startCamera(video);
  } catch (error) {
    statusEl.textContent = `カメラを開始できませんでした: ${describeError(error)}`;
    showDebugMessage(`camera error: ${describeError(error)}`);
    startButton.disabled = false;
    return;
  }

  // ── 3. DeviceOrientation 購読開始 ──
  // granted / unsupported はもちろん、error でもフォールバックとして購読を試みる。
  stopOrientation = startOrientation(render);
  running = true;
  startButton.textContent = "計測を停止";
  startButton.disabled = false;

  if (orientationPerm.state === "granted") {
    statusEl.textContent = "計測中です。";
  } else if (orientationPerm.state === "unsupported") {
    statusEl.textContent =
      "計測中です（この端末は追加の許可なしでセンサーを使用します）。";
  } else {
    statusEl.textContent =
      "計測中です。ただし方位センサーの許可取得でエラーが発生しました。値が更新されない場合は画面下部のデバッグ表示を確認してください。";
  }
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
    // start() の最初の同期部分(requestPermission 呼び出し)は
    // この click ディスパッチ内で実行される。
    void start();
  }
});
