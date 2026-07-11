# KOTODAMA アーキテクチャ

## 1. 目的

KOTODAMA は、入力されたことばを `SIGNAL → SEED → LIFE` の三状態を持つ3D生命体へ変換する、バックエンド不要のインタラクティブ作品です。同じことばと変異番号からは常に同じ標本ID、色、性質が生成されます。粒子密度と文字の輪郭は、画面性能と端末フォントに適応します。

設計上の主要要件は次のとおりです。

- GitHub Pages だけで配信できる静的SPAであること
- 日本語・絵文字を含む入力を決定論的に処理できること
- 3D描画、生成音、マイク反応をすべて端末内で完結させること
- PCとモバイルで同じURL・同じ標本を再現できること
- WebGL、Web Audio、マイクが利用できない場合も段階的に機能を縮退できること
- 自動テストが画面外から状態を観測し、時間を決定論的に進められること

## 2. システム境界

実行時に利用する外部サービスはありません。GitHub Pages はビルド済みのHTML、CSS、JavaScript、マニフェストだけを配信します。入力文字列、マイク音声、生成された画像は外部へ送信されません。

共有時は次の値だけをURLフラグメントへ格納します。`#` 以降はHTTPリクエストへ含まれないため、GitHub PagesやCDNのアクセスログへことばが送られません。

| キー | 内容 | 例 |
|---|---|---|
| `w` | UTF-8のことば | `未来` |
| `m` | 変異番号 | `2` |
| `lang` | UI言語 | `ja` |

標本そのものを保存する必要はありません。クライアントがこれらの値から同じ `LifeTraits` と、端末に適応した3D表現を再生成します。旧形式との互換性のため読み取り時のみクエリも解釈しますが、新しい共有URLは常にフラグメント形式です。

## 3. ランタイム構成

| モジュール | 責務 |
|---|---|
| `src/main.ts` | CSSの読み込みとアプリ起動 |
| `src/ui/app.ts` | 画面状態、誕生シーケンス、UI、入力、共有、保存、全画面、日英切替、テストフック |
| `src/core/generation.ts` | UTF-8ハッシュ、疑似乱数、色・対称性・テンポ・気質・標本コードの決定論的生成、URL状態 |
| `src/scene/organism.ts` | Three.js/WebGLによる描画、GPUモーフ、カメラ操作、タップ共鳴、PNGキャプチャ、適応品質 |
| `src/audio/sonic-garden.ts` | Web Audioによる生成音、進化・エネルギー連動、任意マイク解析、リソース解放 |
| `src/ui/styles.css` | 磁器紙のビジュアル、レスポンシブ配置、フォーカス、低動作設定、WebGLフォールバック |

`KotodamaApp` がオーケストレーターです。描画と音響は互いを直接参照せず、`LifeTraits`、`evolution`、`energy` を介して同期します。この分離により、音を無効にした場合やWebGLが失敗した場合も残りの機能を維持できます。

## 4. 決定論的な生成

1. 入力をNFKCで正規化し、空白を除去します。
2. ことばと変異番号をUTF-8バイト列へ変換します。
3. FNV-1aとアバランシェ処理から32bit seedを作ります。
4. seed付き疑似乱数から次の `LifeTraits` を決めます。
   - 3色パレット
   - 3〜9の対称性
   - 52〜98 BPMのテンポ
   - 気質
   - 粒子形状バリアント
   - 人が読める標本コード
5. 視覚と音響は同じtraitsを受け取り、別々の表現へ展開します。

この方式はDBを必要とせず、URLだけで標本の同一性を再現できます。`mutation` を増やすと、同じことばから別個体を生成できます。粒子数、個々の微細座標、文字形状はGPU性能、画面面積、OSフォントに合わせて変わりますが、標本コード、配色、対称性、テンポ、気質は変わりません。

## 5. 3D描画パイプライン

`OrganismScene` は、各粒子について三つの位置属性を一度だけ構築します。

- `signal`: オフスクリーン2D Canvasでことばを描き、アルファ画素をサンプリングした文字座標
- `seed`: Fibonacci球に近い折り畳まれた核の座標
- `life`: symmetry、variant、seedから作る固有の有機形状

頂点シェーダーは `uEvolution` に応じて三属性をGPU上で補間します。JavaScript側で全粒子の座標を書き換えないため、タイムライン操作と誕生アニメーションを滑らかに保てます。`uTime`、`uMic`、`uPulse`、`uTempo` が呼吸、音声反応、共鳴波、個体差を加えます。

粒子以外に、彫刻的な核、ワイヤーフレーム、軌道リング、疎な塵、接地影を同じシーンへ配置します。レンダラーの背景は透過で、CSSの淡い磁器紙と重ねています。これはFable 5の暗い光粒子空間と視覚言語を分離するための意図的な構成です。

### 適応品質

- DPRは端末特性を見て上限を設定
- モバイルでは初期粒子予算を削減
- 移動平均フレーム時間が継続的に悪化した場合、表示粒子数とDPRを段階的に低減
- `prefers-reduced-motion` では動きと誕生時間を短縮
- `ResizeObserver` がCanvasとカメラ投影を同期

## 6. 音響とマイク

音はユーザー操作後にだけ開始します。`SonicGarden` は標本のseedから音階、倍音、テンポ、呼吸ノイズを作り、マスターゲインを低音量に制限します。

進化値は音色の明るさと構成へ、共鳴とマイクレベルはエネルギーへ反映されます。停止時は急にAudioContextを破棄せず、短いフェードの後でオシレーター、ノイズ、フィルター、Contextを解放します。

マイクは明示的に「声」ボタンを押した場合だけ要求します。ストリームは `AnalyserNode` にだけ接続し、出力やネットワークへ接続しません。時系列波形からRMS音量を算出した後は、0〜1の数値だけを描画へ渡します。

## 7. UI状態と時間

主要状態は `intro`、`birth`、`observe` です。

- `intro`: ことばの入力と候補を表示。背景では既定標本を静かにプレビュー
- `birth`: 5.6秒で文字座標、核、生命体へ進化。段階名をARIA liveでも通知
- `observe`: タイムライン、共鳴、音、声、変異、保存、共有、全画面を操作可能

通常は `requestAnimationFrame` が経過秒を `update` へ渡します。自動テストでは `window.advanceTime(ms)` が同じ更新処理を固定ステップで進めます。`window.render_game_to_text()` は現在の標本、段階、進化値、操作状態、カメラ状態をJSONで返します。

## 8. フォールバックとアクセシビリティ

- WebGL初期化に失敗した場合は、traitsの色と対称性を反映するCSS生命体へ切り替え
- Web Audio非対応時も視覚体験と共有を維持
- マイク拒否時はエラーにせず、端末設定を案内
- すべての機能ボタンに名前とフォーカス表示を付与し、状態を持つ音・声だけに `aria-pressed` を付与
- キーボードの `Space`、`M`、`V`、`F`、`?` に対応
- ネイティブ `dialog` とARIA live regionを使用
- タッチ対象はモバイルで44px以上を確保
- 横スクロールを発生させずsafe-areaを考慮

## 9. ビルドと公開

Viteの `base` はGitHub Pagesのプロジェクトパスに合わせて `/Special2/` に固定しています。

```text
push main
  → GitHub Actions (Node 22)
  → npm ci
  → npm run build
  → dist を Pages artifact としてアップロード
  → actions/deploy-pages
  → https://benriworks.github.io/Special2/
```

リポジトリ名を変更する場合は、`vite.config.ts`、OG URL、README、Pages URLの四箇所を同時に変更する必要があります。

## 10. 検証

`npm run verify` はビルド済み `dist` を一時プレビューし、Chromiumで次を確認します。

- introから日本語を入力してLIFEまで到達
- Spaceによる共鳴回数
- SIGNAL、SEED、LIFEのタイムライン遷移
- 変異番号と日英切替
- About dialog
- PNGダウンロード
- 390×844、320×568、844×390での横幅・標本カード・入力境界
- Console errorとアプリ由来warningがゼロ
- デスクトップ、SIGNAL、LIFE、モバイルのスクリーンショット

## 11. 主要ファイル

```text
.
├─ .github/workflows/deploy.yml
├─ docs/
│  ├─ architecture.md
│  └─ architecture-mermaid.md
├─ public/
│  ├─ favicon.svg
│  └─ manifest.webmanifest
├─ scripts/verify.mjs
├─ src/
│  ├─ audio/sonic-garden.ts
│  ├─ core/generation.ts
│  ├─ scene/organism.ts
│  ├─ ui/app.ts
│  ├─ ui/styles.css
│  └─ main.ts
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```
