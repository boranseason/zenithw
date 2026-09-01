<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.tr.md">Türkçe</a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.ja.md">日本語</a> •
  <a href="./README.de.md">Deutsch</a>
</p>

---

# ZenithW

**無料、広告なし、ウォーターマークなしのメディアダウンローダー。** YouTube、TikTok、Instagram、X/Twitter、Redditなどからワンクリックで動画や音声ファイルをダウンロードできます。

🔗 **ライブサイト:** [zenithw.space](https://zenithw.space)

🏷️ **現在のリリース:** `v14.0` — 専用ツールページ、レスポンシブな共通ナビゲーション、より洗練されたUI体験を提供します。

---

## 目次

- [特徴](#特徴)
- [使用技術](#使用技術)
- [プロジェクト構造](#プロジェクト構造)
- [セットアップ](#セットアップ)
- [環境変数](#環境変数)
- [APIリファレンス](#apiリファレンス)
- [セキュリティ](#セキュリティ)
- [ライセンス](#ライセンス)
- [お問い合わせ](#お問い合わせ)

---

## 特徴

- 🎬 **マルチプラットフォーム対応** — YouTube、TikTok、Instagram、X/Twitter、Redditなど多数対応 (yt-dlpを使用)
- 🎵 **動画および音声** — mp4/webm/mkvなどの動画フォーマット、mp3/flac/wav/ogg/opus/m4aなどの音声フォーマット
- 🔇 **ミュートモード** — 音声なしで動画のみをダウンロード
- 📃 **一括 / プレイリストダウンロード** — 最大10個のリンクを同時処理、または最大50項目のプレイリストを解析
- ⏭️ **SponsorBlock統合** — スポンサー枠、イントロ、アウトロなどを自動的にスキップまたは削除
- 🖼️ **サムネイルダウンロード** — カバー画像をメディアと一緒に、または単体でダウンロード
- 📝 **字幕およびメタデータ対応** — 利用可能な字幕のダウンロードおよび動画メタデータの埋め込み
- 🌍 **4言語対応** — トルコ語、英語、フランス語、ドイツ語
- 🎨 **カスタマイズ可能なUI** — ライト/ダークテーマ、スムーズなアニメーション
- 🔒 **サーバー側に履歴を残さない** — 履歴はデバイスローカル (localStorage) にのみ保存
- ⚡ **リアルタイム進行状況** — Socket.IOによるライブ進捗表示

---

## 使用技術

| レイヤー | 技術 |
|---|---|
| バックエンド | Python, Flask, Flask-SocketIO (gevent) |
| ダウンロードエンジン | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| メディア処理 | FFmpeg |
| フロントエンド | Vanilla HTML/CSS/JS (フレームワークなし) |
| フロントエンドホスティング | [Cloudflare Pages](https://pages.cloudflare.com) |
| バックエンドホスティング | [Amazon EC2](https://aws.amazon.com/ec2/) — Ubuntu、Nginx、systemd |
| エッジ、DNS、TLS | [Cloudflare](https://www.cloudflare.com/) |

---

## セットアップ

### 必須条件

- Python 3.10+
- FFmpegがインストールされ、`PATH`が通っていること

### インストール

```bash
git clone https://github.com/kakangeldi82-netizen/zenithw.git
cd zenithw/backend

python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### ローカルでの実行

```bash
python app.py
```

サーバーはデフォルトで `http://localhost:5000` で起動します。

---

## ライセンス

[MIT](./LICENSE)

---

## お問い合わせ

- 開発者: [@boranseason](https://www.instagram.com/boranseason)
- メール: [info@zenithw.space](mailto:info@zenithw.space)
