/**
 * 背面カメラのライブ表示を担当するモジュール。
 * GPS・位置情報は一切使用しない。
 */

export interface CameraHandle {
  /** カメラを停止し、トラックを解放する。 */
  stop(): void;
}

/**
 * 背面カメラ(environment)のストリームを取得し、video 要素に流し込む。
 * ユーザー操作(ボタン押下)から呼び出すこと。失敗時は例外を投げる。
 */
export async function startCamera(
  video: HTMLVideoElement,
): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("このブラウザはカメラ(getUserMedia)に対応していません。");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  // iOS Safari 対策: インライン再生・ミュートを明示。
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // 自動再生が拒否されても srcObject は設定済みなので致命的ではない。
  }

  return {
    stop() {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      video.srcObject = null;
    },
  };
}
