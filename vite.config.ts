import { defineConfig } from "vite";

// GitHub Pages のプロジェクトサイトは
//   https://<user>.github.io/<repo>/
// のようにサブパス配信となるため、base をリポジトリ名に合わせる。
// ローカル開発(vite dev)やカスタムドメイン運用では base=/ にしたいので、
// 環境変数 VITE_BASE で上書きできるようにしておく。
const base = process.env.VITE_BASE ?? "/hoshizora-obstacle-checker/";

export default defineConfig(({ command }) => ({
  // dev サーバーは常にルート配信、build 時のみサブパスを適用。
  base: command === "build" ? base : "/",
  build: {
    outDir: "dist",
  },
}));
