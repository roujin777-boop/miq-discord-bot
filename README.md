# MIQ Discord Bot

Discord の `/miq user text type` コマンドで、指定ユーザーのアバターと任意テキストから Make it a Quote 風画像を返す Bot です。

## セットアップ

1. `npm install`
2. `.env.example` を `.env` にコピーして値を設定
3. `npm run deploy`
4. `npm start`

## 必要な Privileged Intent

この Bot は `Guilds` のみで動作します。Message Content Intent は不要です。

## Railway などへ置く場合

- Start Command: `npm start`
- Deploy 前に一度ローカルで `npm run deploy` するか、環境変数を入れた状態で同コマンドを実行
- `PORT` は Railway が自動注入する場合があります

## コマンド

`/miq user:@ユーザー text:本文 type:reverseColor`

### type の候補
- normal
- color
- reverse
- reverseColor
- white
- reverseWhite
