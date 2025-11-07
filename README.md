# ガチャポンサイト

三つのタブ：
- **ガチャポン**：回して動画を当てる。結果はそのまま再生＆コレクションに保存。
- **シリアル番号発行所**（管理者）：管理パスワードでログイン → シリアルを発行。
- **景品入荷**（管理者）：動画URL／タイトル／確率（％）をまとめて設定。

## 使い方（ローカル）
```bash
cd gachapon-site
cp .env.example .env     # ADMIN_PASSWORD を変更推奨
npm install
npm start
```
ブラウザで http://localhost:3000 を開く。

## Railway デプロイ
- 新規プロジェクト → このフォルダをアップロード。
- `ADMIN_PASSWORD` と `JWT_SECRET` を Variables に設定。
- Start Command は `npm start`。

> 注: 動画は **URL** 指定です（例：CDN / Cloud Storage）。ファイルアップロード機能は含めていません。

## データベース
- デフォルトは SQLite（`data.sqlite`）。
- リセットしたいときは `data.sqlite` を削除。

## デバイス判定
- ブラウザの `localStorage` に割り当てた `deviceId` を使用。
- シリアルを使うと、その端末の残り回数が増えます。

## 注意
- 確率（％）は合計100％である必要があります。UIで合計が100％になるようバリデーションしています。
