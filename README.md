# KOTODAMA — ことばの生命体

入力したことばを、星座・種・光の生命体へ進化させるインタラクティブな3D作品です。ブラウザ上だけで動作し、言葉ごとに固有の色、形、鼓動、音を生成します。

公開URL: https://benriworks.github.io/Special2/

## 体験

- 日本語を含む任意のことばから、決定論的な標本ID・色・性質を持つ3D生命体を生成
- `SIGNAL → SEED → LIFE` の進化をタイムラインで行き来
- タップ／クリックで「共鳴」、ドラッグで視点操作、ホイールでズーム
- マイク入力に反応する呼吸（音声データは保存・送信しません）
- ことばから生成したWeb Audioサウンドスケープ
- URL共有、PNG保存、フルスクリーン、日英表示
- モバイル、キーボード操作、`prefers-reduced-motion` に対応

## ローカル開発

```bash
npm install
npm run dev
npm run build
npm run verify
```

## ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [Mermaidアーキテクチャ図](docs/architecture-mermaid.md)

## ライセンス

[MIT](LICENSE)
