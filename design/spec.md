# Spirits of the Forest — 第3の見た目「実物」 spec

design only。main.js・style.css は未編集。実装するときの参照用。
見本帳: `sheet.html`（単体で開ける。症状は `sheet.png` に撮った全体図）。

## キー対応表（main.js の INFO キー → 精霊名 → 数字 → 記号）

| キー | 名前 | 地/濃/淡の変数接頭辞 | 下の数字＊ | 記号 |
|---|---|---|---|---|
| `sp` | 風 | `--wind-*` | 10 | 渦巻 `sym-wind` |
| `br` | 根 | `--root-*` | 8 | 枝分かれする線 `sym-root` |
| `fl` | 花 | `--flower-*` | 8 | 五枚の花びら `sym-flower`（＋つる地紋） |
| `lv` | 葉 | `--leaf-*` | 8 | 葉脈のある一枚の葉 `sym-leaf` |
| `dw` | 水 | `--water-*` | 7 | しずく `sym-drop` |
| `fr` | 木の実 | `--nut-*` | 7 | どんぐり `sym-acorn` |
| `mu` | 茸 | `--mush-*` | 6 | かさの形 `sym-mushroom` |
| `vi` | 岩 | `--rock-*` | 6 | 六角形 `sym-hex` |
| `ms` | 苔 | `--moss-*` | 5 | 三つの丸 `sym-moss` |
| `fi` | 火 | `--fire` | - | 炎 `sym-fire` |
| `mo` | 月 | `--moon` | - | 三日月 `sym-moon` |
| `su` | 太陽 | `--sun` | - | とげのある円 `sym-sun` |
| `plus` | ＋ | - | - | `sym-plus` |

＊ **注意**: 依頼文の表の数字（上表）と、現在の `rules.js` の `SPECIES_TOTAL`（TILE_TEXT から自動計算）は、花/葉・茸/岩の組で食い違っている（依頼文は 花8・葉8・茸6・岩6、rules.js の実データは lv葉8・vi岩8・mu茸7・fl花6 のように出る可能性がある）。
見本帳・このデザインでは **依頼文の表を正として** 数字を描いている。実装する engineer は、タイルに印字する数字を `SPECIES_TOTAL[key]`（実データ）で出すか、依頼文の数字に `TILE_TEXT` 側を合わせるか、どちらかをオーナーに確認してから決めること（デザイン側は数字の位置・字形だけを決めるもので、値の出どころは関知しない）。

## 1. 色

`tokens.css` に全部ある。精霊ごとに 地(base)/濃(dark)/淡(light) の3段。地紋は地の上に濃・淡の面を重ねる。
バッジの記号色は「濃」、バッジの地は共通で `--badge: #F2F0EA`。

## 2. 記号

`symbols.svg`（`<symbol id="sym-xxx">`、viewBox 0 0 24 24、`fill="currentColor"` または `stroke="currentColor"`）。
色は使う側で `color: var(--xxx-dark)` を指定する（CSS の `currentColor` 継承）。

形の方針（見分けやすさ優先）:
- 風=渦巻（曲線） / 根=直線の枝分かれ → 曲線 vs 直線で区別
- 葉=輪郭＋葉脈の面 / 苔=丸3つの集まり → 単一の面 vs 複数の点で区別
- 岩=正六角形（面） / 葉=葉の輪郭（面だが輪郭が非対称）→ 対称な多角形 vs 非対称な曲線で区別
- 力の源は同じ白バッジの中で、形だけが違う（火=炎、月=三日月、太陽=とげ付き円）

## 3. 葉の地紋

`leaf.svg` の `#leaf-pattern`（viewBox 0 0 60 90）。角ばったポリゴンを3層（濃/淡/濃）重ねた、面を割ったような幾何学タッチ。
色は `var(--t-base)` `var(--t-dark)` `var(--t-light)` を使うので、**使う側の要素に `data-sp="xxx"` を付けて `tokens.css` の属性セレクタで t-base 等を割り当ててから** `<use href="#leaf-pattern">` する。
花だけ `#leaf-vine` を地紋の上に重ねて使う（細いつるの曲線、`var(--t-dark)`）。

`<img>` や CSS の `background-image: url(leaf.svg)` のように**別ドキュメントとして読み込むと CSS 変数が継がれない**。
必ず `symbols.svg` と同様にページに **インラインで** 貼り付け、`<use>` で参照すること（sheet.html がその実例）。

## 4. タイル・トークン・宝石

### タイル
- 縦長 108×144px 相当（縦:横=4:3）、`border-radius:10px`、影は `0 2px 0 rgba(0,0,0,.4), 0 5px 9px rgba(0,0,0,.4)` で厚紙の厚みを出す。
- 上部中央に白バッジ（28〜30px の円）を1〜2個横並び。2個目は力の源（例: 風×月、茸×火）。
- 下部中央に大きな数字。システムフォント `"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS",cursive`、`rotate(-5deg)`、`-webkit-text-stroke: 1.4px var(--ink-strong)` + `paint-order: stroke fill` で暗いふちを出す。下に短い横線（`height:3px`）。
  - **フォントの決定**: SVG パスで数字を自作する案 B もあったが、今回は **システムフォント＋ CSS 変形（案 A）** を採用。OS によって字形が変わる（Windows は Comic Sans 寄り、Mac は Chalkboard 寄り）が、太字・斜体・ふち取りで手書き感は保たれるため許容。将来もっと統一した字形が要るなら、数字だけ SVG パス化する（0〜9 の10個で済む）。
- 中央は地紋で埋め、動物の絵は置かない。

### 恩恵トークン
- 直径 40px 程度、無地の円盤 `--token-disc:#E9E8E3`、内側に軽いインセット影。中央に記号（精霊 / 力の源 / ＋）を濃い色（例 `#3a362f`）で。
- 枚数は 14 枚（9精霊＋3力の源＋ ＋ を基本に、頻度の高い記号を増量するなどは rules.js 側の仕様に合わせる。デザインは円盤＋記号の描き方のみ規定）。

### 宝石
- 丸みのあるカット面（SVG `polygon` 1枚、頂点を8つ、`radialGradient` で中心が白く抜けるハイライト）。
- `filter: drop-shadow(...)` で色つきの柔らかい落ち影。
- 色: P1 `--gem-1 #35C9D3`、P2 `--gem-2 #C3D62B`、P3(仮) `--gem-3 #F0507A`、P4(仮) `--gem-4 #9B6BFF`。

### 森（場）
- `grid-template-columns: repeat(12, 1fr)`、`gap: 3px` でほぼ隙間なく敷く。背景 `--felt:#1E5E34` の上に置く。
- 取れるタイル: `box-shadow` で `--gem-1` のネオン縁取り＋ `translateY(-3px) scale(1.02)`。
- 取れないタイル: `filter: brightness(.68) saturate(.75)` + `translateY(2px) scale(.96)` で少し沈める。
- 取られて位置が詰まる動きは、タイルの取得アニメーション後に **grid の再描画だけでよい**（CSS Grid は要素が減ると自動的に詰まる。並び替えアニメーションが欲しい場合は FLIP 手法が要るが、今回は「飛んで消える→詰まる」の2段で十分というのが設計判断）。

## 5. 画面の構成

### PC・横向き
`header（名前/手番/テーマ切替）` → 3カラム（左: 相手の集計 / 中央: 森12×4 / 右: 宝石置き場）→ 下部に自分の集計・操作。
sheet.html の `.wf-pc` に寸法付きワイヤーフレームあり。

### スマホ・縦向き（375px 基準）
**推奨: 横スクロール**（4行それぞれを独立した横スクロール帯にする。2段折り返しは不採用）。

理由:
- タイルの最小寸法は「記号バッジが判別できる・数字が読める」を満たす下限として **幅 56px × 高さ 74px**（縦横比 4:3 を維持）とした。バッジは幅の半分(28px)、記号はさらにその半分程度(14px)が要る計算で、これより縮めると記号が潰れる。
- 375px 幅に 12 枚を1行で収めようとすると 1 枚あたり 31px 前後になり、上の下限を大きく割る。2段折り返し（6枚×2段）でも 1枚 ≈ 61px×2段で縦方向を圧迫し、森全体のカードゲームらしい「束」の見た目が崩れる。
- 横スクロールなら 56px を保ったまま、行ごとに `scroll-snap-type: x mandatory` でスワイプの手応えを付けられる。

## 6. 動き

| 動き | 長さ | 内容 |
|---|---|---|
| タイルを取る | 0.32s (ease-in) | 持ち上がり→縮小＋回転しながら手元へ飛ぶ |
| 宝石を置く | 0.30s (ポップ) + 0.45s（光） | 弾んで少しオーバーシュート＋白い光が広がって消える |
| 終局の数え上げ | 各行 0.3s、90ms 刻みで順番 | 精霊の行を上から順にフェード＋横スライドで表示 |

keyframes 案（sheet.html にそのまま実装済み、コピー可）:

```css
@keyframes tileTake {
  0%   { transform: translate(0,0) scale(1) rotate(0deg); opacity: 1; }
  35%  { transform: translate(0,-14px) scale(1.08) rotate(-4deg); opacity: 1; }
  100% { transform: translate(70px,-60px) scale(.45) rotate(10deg); opacity: 0; }
}
@keyframes gemPop {
  0%   { transform: scale(.3); opacity: 0; }
  55%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes gemGlow {
  0%   { opacity: .9; transform: scale(.4); }
  100% { opacity: 0; transform: scale(2.6); }
}
@keyframes rowReveal {
  0%   { opacity: 0; transform: translateX(-10px); }
  100% { opacity: 1; transform: translateX(0); }
}
```

実際に飛ぶ先（手元の集計欄の位置）は、タイルの DOM 位置と目的地の差分を JS で計算して `translate()` に渡す（sheet.html のデモは固定値の簡易版）。

## 色覚チェック（1型・2型・3型）

`sheet.html` の最後のセクションに、`feColorMatrix` による簡易シミュレーション（4列: ノーマル/1型/2型/3型）で 9 種の記号バッジを並べてある。
記号の形がそれぞれ別物（渦巻/枝分かれ線/花びら/葉脈の葉/しずく/どんぐり/かさ/六角形/丸3つ）なので、色のシミュレーションを通しても**シルエットで判別可能**。特に見分けにくかった組はなし（色だけに依存する設計ではないため）。
ただし 2型（緑）シミュレーションで 葉(`lv`)と苔(`ms`)の地色がどちらも暗い黄緑〜茶寄りに寄って**地紋の色だけでは近く見える**。記号（葉の輪郭 vs 丸3つ）で見分ける前提を崩さないこと。
