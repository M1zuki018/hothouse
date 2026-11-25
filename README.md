# HOTHOUSE

一本道の選択型ADV（プレイ時間 30分〜2時間）のモック。

## 動かし方

`index.html` をブラウザで開く。ビルド不要。

- 画面：16:9（1920×1080 をウィンドウに合わせて縮小）
- HUD：WebGL シェーダーによる liquid glass
- 素材：すべて仮置き（キャラはシルエット、音なし）

## 収録範囲

プロローグ「流れ星の夜」（P-1〜P-4）→ 第1章 介入（4択）→ 夜の観測

## シナリオの書き方

`index.html` 内の `PROLOGUE` に原稿をそのまま書く。`fromScript()` が Aube と同じ order 形式に変換する。

| 書き方 | 意味 |
|---|---|
| `名前：本文` | セリフ（Talk） |
| `：` のない行 | 地の文（Descriptive） |
| `表示名＝話者：本文` | 名前を伏せたセリフ |
| `＞ラベル` | 選択肢（連続行で複数） |
| `（暗転）` | 暗転。その他の（　）はメモとして無視 |
| `{player}` | 主人公の名前 |

演出行（`@`）：

| 行 | 内容 |
|---|---|
| `@bg 背景` | 背景変更（lab / observatory / church） |
| `@in 名前 位置 秒` | 登場（Left / Center / Right） |
| `@out 名前 秒` / `@clear 秒` | 退場 / 全員退場 |
| `@fadein 秒` / `@fadeout 秒` | フェード |
| `@meteor 秒` / `@flash 秒` / `@shake` | 演出 |
| `@wait 秒` | 待機 |
| `@phase 大\|小` | 左上の章表示 |
| `@head 場面\|題\|説明` | 次の選択肢の見出し |

行頭に `+` を付けると直前の行と同時に実行（Join）。

## 構成

ADV 部は Aube のコマンドパターンを踏襲。

- order：`order_id / order_type / sequence / speaker_id / dialog_text / override_display_name / file_path / position / facial_expression / override_text_speed / duration`
- `OrderHandler(type, fn)` で種類ごとにハンドラを登録
- `StoryPlayer`：Append で群を区切り、Join は同時実行
