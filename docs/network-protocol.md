# オンライン対戦プロトコル仕様（草案）

## 1. 基本方針

WebSocketでホストと各クライアントを接続する。ホストがゲーム状態の正しい管理者であり、クライアントは操作要求を送るだけとする。

初期実装では、同一LAN内でホストPCへ直接接続する方式を対象とする。インターネット越しの接続には、後にTLS・認証・NAT越えなどの追加設計が必要である。

## 2. 共通形式

すべてのメッセージはJSONとする。

```json
{
  "type": "MESSAGE_TYPE",
  "requestId": "client-generated-id",
  "payload": {}
}
```

`requestId` は、操作結果やエラーを対応付けるため、操作要求で必須とする。

## 3. クライアントからホストへのメッセージ

| type | payload | 説明 |
| --- | --- | --- |
| `JOIN_ROOM` | `roomId`, `playerName`, `password` | ルームへ参加する。合言葉が必要な場合は照合に使う。 |
| `READY` | `isReady` | 準備状態を変更する |
| `UPDATE_CONFIG` | `config` | ホストが開始前設定を更新する |
| `START_GAME` | なし | ホストがゲームを開始する |
| `PLACE_TILE` | `tileId`, `placement`, `rotation` | タイル配置を要求する |
| `PLACE_MEEPLE` | `featureId` または `null` | コマ配置、またはスキップを要求する |
| `LEAVE_ROOM` | なし | ルームから退出する |

`placement` の詳細なデータ形式は `docs/tile-system.md` で確定する。

## 4. ホストからクライアントへのメッセージ

| type | payload | 説明 |
| --- | --- | --- |
| `ROOM_STATE` | ルーム情報・参加者 | 待機室の状態 |
| `CONFIG_UPDATED` | 公開可能な `config` | ホストが更新した開始前設定 |
| `GAME_STATE` | 公開可能なゲーム状態 | 状態同期 |
| `ACTION_ACCEPTED` | `requestId` | 操作の受理通知 |
| `ACTION_REJECTED` | `requestId`, `code`, `message` | 不正・不可能な操作 |
| `GAME_EVENT` | `eventType`, `data` | 得点、退出などの演出用イベント |
| `GAME_OVER` | 結果・得点内訳 | 対局終了 |

## 5. 検証と切断

- ホストはプレイヤーID、手番、フェーズ、タイルID、配置、コマの利用可否を検証する。
- ホストは開始前にだけ `UPDATE_CONFIG` を受け付け、作成者以外からの変更を拒否する。
- 合言葉は照合だけに使用し、`ROOM_STATE`、`CONFIG_UPDATED`、ログへ含めない。
- 不正な操作は状態を変更せず `ACTION_REJECTED` を返す。
- 切断したプレイヤーの扱いは初期版では「対局中断」とする。AIへの交代や再接続は後続機能とする。
- クライアントは `GAME_STATE` を受け取ったら、ローカル表示をホストの状態に合わせる。
