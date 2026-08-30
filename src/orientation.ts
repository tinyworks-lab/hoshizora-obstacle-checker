/**
 * DeviceOrientation を扱い、スマートフォンの背面カメラが向いている
 * 中央方向の「高度角」「方位角」を算出するモジュール。
 *
 *  - 高度: 水平 = 0°, 真上 = 90°
 *  - 方位: 北 = 0°, 東 = 90°, 南 = 180°, 西 = 270°
 *
 * GPS・位置情報は一切使用しない。方位はデバイスの磁気センサー
 * (iOS: webkitCompassHeading / Android: 絶対方位イベント)に依存する。
 */

const D2R = Math.PI / 180;

export type HeadingSource = "webkitCompassHeading" | "alpha" | "none";

export interface OrientationReading {
  /** 生の DeviceOrientationEvent.alpha (deg) */
  alpha: number | null;
  /** 生の DeviceOrientationEvent.beta (deg) */
  beta: number | null;
  /** 生の DeviceOrientationEvent.gamma (deg) */
  gamma: number | null;
  /** 画面の回転角 (deg) */
  screenOrientation: number;
  /** 計算後の高度角 (deg, 水平=0, 真上=90) */
  altitude: number;
  /** 計算後の方位角 (deg, 北=0, 東=90, 南=180, 西=270) */
  azimuth: number;
  /** 方位が北基準の絶対値かどうか */
  absolute: boolean;
  /** 方位の取得元 */
  headingSource: HeadingSource;
}

export type OrientationCallback = (reading: OrientationReading) => void;

export type OrientationPermission = "granted" | "denied" | "unsupported";

/** iOS Safari が付与する独自プロパティ。 */
interface WebkitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

/** iOS 13+ の許可 API を持つ DeviceOrientationEvent。 */
interface RequestableDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function getScreenOrientationAngle(): number {
  const orientation = screen.orientation;
  if (orientation && typeof orientation.angle === "number") {
    return orientation.angle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? normalizeDeg(legacy) : 0;
}

/**
 * alpha / beta / gamma から背面カメラの光軸(デバイス -Z 軸)を
 * ENU ワールド座標 (x=東, y=北, z=上) に変換し、高度・方位を求める。
 *
 * W3C DeviceOrientation の Z-X'-Y'' 回転行列を用いる。
 * 画面の回転はデバイス座標系に影響しないため補正不要。
 */
function computeAltAz(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
): { altitude: number; azimuth: number } {
  const a = alphaDeg * D2R;
  const b = betaDeg * D2R;
  const g = gammaDeg * D2R;

  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);

  // R * (0, 0, -1) の各成分。
  const east = -(cG * sA * sB + cA * sG);
  const north = cA * cG * sB - sA * sG;
  const up = -cB * cG;

  const altitude = Math.asin(Math.min(1, Math.max(-1, up))) / D2R;
  const azimuth = normalizeDeg(Math.atan2(east, north) / D2R);

  return { altitude, azimuth };
}

/**
 * iOS 13+ では DeviceOrientationEvent.requestPermission() が必要。
 * それ以外の環境では "unsupported" を返す(許可不要とみなす)。
 * 必ずユーザー操作(ボタン押下)から呼び出すこと。
 */
export async function requestOrientationPermission(): Promise<OrientationPermission> {
  const doe =
    DeviceOrientationEvent as unknown as RequestableDeviceOrientationEvent;

  if (typeof doe.requestPermission !== "function") {
    return "unsupported";
  }

  try {
    const result = await doe.requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * DeviceOrientation の購読を開始する。戻り値を呼ぶと購読を解除する。
 * Android Chrome は "deviceorientationabsolute" を優先し、
 * iOS Safari は "deviceorientation" + webkitCompassHeading を使う。
 */
export function startOrientation(callback: OrientationCallback): () => void {
  let alphaForCalc = 0;
  let betaForCalc = 0;
  let gammaForCalc = 0;
  let absolute = false;
  let headingSource: HeadingSource = "none";

  const handleEvent = (rawEvent: Event): void => {
    const event = rawEvent as WebkitDeviceOrientationEvent;

    const compassHeading =
      typeof event.webkitCompassHeading === "number" &&
      !Number.isNaN(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : null;

    betaForCalc = event.beta ?? 0;
    gammaForCalc = event.gamma ?? 0;

    if (compassHeading !== null) {
      // webkitCompassHeading は「端末上端が指す方位(時計回り, 北=0)」。
      // 計算式の alpha(反時計回り)に合わせて反転する。
      alphaForCalc = normalizeDeg(360 - compassHeading);
      headingSource = "webkitCompassHeading";
      absolute = true;
    } else if (event.alpha !== null) {
      alphaForCalc = event.alpha;
      headingSource = "alpha";
      absolute =
        event.absolute === true || event.type === "deviceorientationabsolute";
    }

    const { altitude, azimuth } = computeAltAz(
      alphaForCalc,
      betaForCalc,
      gammaForCalc,
    );

    callback({
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      screenOrientation: getScreenOrientationAngle(),
      altitude,
      azimuth,
      absolute,
      headingSource,
    });
  };

  const eventName =
    "ondeviceorientationabsolute" in window
      ? "deviceorientationabsolute"
      : "deviceorientation";

  window.addEventListener(eventName, handleEvent, true);

  return () => {
    window.removeEventListener(eventName, handleEvent, true);
  };
}
