# Penrosanne 開発ガイド

## このプロジェクトについて

Penrosanne は、ベンローズタイルの非周期的な形状を盤面に用いる、ブラウザ向けタイル配置ゲームです。ゲームの基本ルールは `docs/rules.md`、設計方針は `docs/architecture.md` を正とします。

## 実装方針

- JavaScript は ES Modules（`import` / `export`）で統一する。
- `src/game/` は UI・通信・DOM API に依存させない。ゲーム状態を受け取り、結果を返す純粋なロジックを優先する。
- ルール判定は `src/game/Rules.js`、得点計算は `src/game/Scoring.js` に集約する。
- UI はゲーム状態を直接変更せず、`GameEngine` の公開操作を呼び出す。
- オンライン対戦ではホストを正しい状態の唯一の管理者（authoritative host）とし、クライアントから受け取る操作を必ず検証する。
- 新しいメッセージ種別は `src/network/Protocol.js` と `docs/network-protocol.md` を同時に更新する。

## 変更時の注意

- ルールや得点に影響する変更では、関連する `docs/*.md` も更新する。
- ベンローズタイルの辺・回転・接続の表現を変更する場合は、先に `docs/tile-system.md` を更新する。
- 外部依存は、標準 Web API で実現できない理由がある場合だけ追加する。
- 既存の未関連な変更は上書き・削除しない。

## 検証

- ゲームロジックには、UI を起動せず実行できる単体テストを追加する。
- 少なくとも、合法配置、回転、地形完成、コマの利用可否、得点、ゲーム終了を検証する。
