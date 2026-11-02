# Scanner Simulator

立体物をスキャナーで読み込み3Dデータを作成するツールの練習を行うためのスマホ向けWebアプリである．スマホ画面に3DモデルをAR表示し，アプリから指示された方向にスマホを向けてスキャンを行うことでクリアできる．
詳しい狙いは `CLAUDE.md` を参照。

## ファイル構成

- `index.html` / `css/style.css` / `js/*.js`: 実装（サーバー不要）
- `CLAUDE.md`: Claude Code向けの開発方針・完成条件

## 動かし方

ビルド不要の静的サイトなので、このフォルダを任意の静的サーバーで配信するだけで動く。

```bash
cd self-pause-spec
python -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

`file://`で直接`index.html`を開いてもES Modulesが動くブラウザなら概ね動作するが、
ローカルサーバー経由での確認を推奨する。