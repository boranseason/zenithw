# ZenithW

> 利用許可のあるメディアをダウンロード、変換、リマックスするための、広告のないシンプルなワークスペースです。

[Web アプリ](https://zenithw.space) · [稼働状況](https://zenithw.space/status) · [更新履歴](https://zenithw.space/updates) · [English](README.md) · [Türkçe](README.tr.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

現在のバージョン: **v14.2**

## 主な機能

- YouTube、TikTok、Instagram、X、Reddit など、yt-dlp 対応ソースの解析。
- 動画、音声、無音動画、プレイリスト、少数のリンク一括処理。
- FFmpeg による変換と、互換ストリームの不要な再エンコードを避けたリマックス。
- 字幕、メタデータ、サムネイル、SponsorBlock、キャンセル、リアルタイム進捗。
- サーバー側アカウントではなく、ブラウザー内に保存される履歴。

## 構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Cloudflare Pages 上の HTML、CSS、JavaScript |
| バックエンド | AWS EC2 上の Flask、Gunicorn、gevent、Socket.IO |
| メディア処理 | yt-dlp、FFmpeg、Deno/EJS |
| ネットワーク | Cloudflare、Nginx、厳格な TLS、オリジン検証 |

バックエンドは意図的に **1 worker** で動作します。worker を増やす前に、共有状態、Socket.IO ルーティング、共有ストレージが必要です。

## ローカル開発

```bash
git clone https://github.com/boranseason/zenithw.git
cd zenithw/backend
python -m venv .venv
pip install --require-hashes -r requirements.lock
python app.py
```

Python 3.10+ と FFmpeg が必要です。秘密情報を Git に追加せず、CORS の緩和はローカル開発だけで使用してください。

## 安全性と利用条件

ZenithW はプライベートネットワーク宛ての接続を拒否し、同時処理数と一時保存量を制限し、短時間だけ有効なトークンでファイルを配信します。所有権またはダウンロード許可のあるコンテンツにのみ使用してください。ZenithW は対応プラットフォームと提携していません。

再現可能な不具合は、個人情報や秘密情報を含めずに [GitHub Issues](https://github.com/boranseason/zenithw/issues) へ報告してください。ライセンス: [LICENSE](LICENSE)。
