# Remote Mirakurun の接続管理

Home の一番下の **Remote** で、親機・子機の通信状態と配信状態を確認できます。接続管理は既定で OFF です。利用する親機と子機の両方を、この機能に対応する版へ更新してください。

## 接続先の登録

Home → Remote →「接続先・通知設定」で接続管理を有効にし、相手を登録します。設定は `server.yml`（Windows の通常配置は `data/config/server.yml`）に保存します。変更後は、そのマシンの Mirakurun を再起動してください。

親機側の例（IP は例示用です。実際の相手の IP に置き換えてください）:

```yaml
remoteManagementEnabled: true
remoteMirakuruns:
  - id: tuner-pc
    name: チューナーPC
    role: child
    host: 100.100.100.2
    port: 40772
```

子機側にも、親機を登録します。`role` は **接続相手の役割** です。

```yaml
remoteManagementEnabled: true
remoteMirakuruns:
  - id: recorder-pc
    name: 録画PC
    role: parent
    host: 100.100.100.1
    port: 40772
remoteAutoRestart: false
```

両側の通常の API 接続許可に、相手の IP を含めてください。Tailscale の起動待ちには、別途 Network Config の `waitForTailscale` を使用します。

Remote の設定変更・手動確認・再起動回数の解除は、Web 更新と同じ管理用 IP 許可設定に従います。初期状態では localhost から操作できます。

## チューナーから参照する

チューナー設定の「接続先マシン」で子機を選択します。`tuners.yml` では `remoteMirakurunId` に登録済みの ID を指定します。

```yaml
- name: Remote-T0
  types:
    - GR-ALT2
  remoteMirakurunId: tuner-pc
  remoteMirakurunDecoder: false
  isDisabled: false
```

ローカルでデコードする場合は、これまでの `decoder` 設定も残してください。子機でのデコードには `remoteMirakurunDecoder: true` を使用します。

既存の `remoteMirakurunHost` / `remoteMirakurunPort` による直接指定も使用できます。同じチューナーで ID 指定と直接指定は併用しません。ID の参照は接続管理を OFF にしても有効です。remote チューナーでは `command` は使いません。

地デジの Remote 配信では、接続先の `/api/status` から OS を確認し、Windows と Linux の間でチャンネル番号を自動補正します。対象は `GR` と `GR-ALT1`〜`GR-ALT20` です。Linux → Windows は −13、Windows → Linux は ＋13、同じ OS 同士は補正しません。Windows は BonDriver の 0 始まりの番号、Linux は物理チャンネル番号を使用する前提です。設定ファイルやローカルチューナーの番号は書き換えません。`GR-ALT*` の接続先へのタイプ指定は、従来どおり `GR` になります。

BS・CS・SKY の番号は補正しません。この処理は接続管理を OFF にしても有効です。OS の確認は配信接続時に行い、取得に失敗しても Web UI の起動は妨げません。配信は失敗状態として表示・記録し、再試行します。

## 確認間隔と配信

- 通常の確認はチューナーを起動しない API 通信です。親→子、子→親の最終成功・受信時刻を表示します。
- 起動時・異常時は 30 秒、正常時は 5 分間隔。API の応答期限は 5 秒です。
- 同じ接続先を使うチューナーは確認処理を共有します。手動確認や大量の配信要求があっても、接続先ごとの確認は最短 30 秒間隔です。
- API の連続失敗が 3 回に達すると ping も確認します。ping 成功だけで再起動は行いません。
- 実際の配信では、HTTP 応答と最初の映像データをそれぞれ最大 20 秒待ちます。失敗した接続を破棄してから再試行します。受信開始済みの配信に、この開始期限は適用しません。
- 親機で指定した視聴・録画の優先度を子機へ渡します。同じ配信を共有する利用者の追加・終了による優先度変更も、配信を切らずに伝えます。

## 子機の自動再起動

子機の設定で `remoteAutoRestart: true` を選ぶと、その子機の **Windows サービスとして起動した Mirakurun** の自動再起動を許可します。OS は再起動しません。

実際の配信開始失敗が 2 分以内に 3 回記録され、親機と子機の記録が一致し、親機の API 稼働も確認できた場合に再起動を試します。失敗は最短 30 秒間隔で数え、短時間の要求連打、認証・設定・チューナー不足などの既知のエラーは再起動の根拠にしません。他の録画・視聴にデータが流れている場合も保留します。

- 起動後 2 分間は再起動しません。
- 再起動間隔は 10 分以上、同一障害は最大 2 回、直近 1 時間で最大 2 回です。
- 履歴を `data/remote/recovery.json` に保存するため、サービスが再起動しても制限を維持します。
- 失敗していた親機・チャンネルへの配信が 1 分続くと、同一障害の回数を解除します。手動での解除も可能ですが、1 時間の上限と再起動間隔は維持します。
- API 自体が応答しない場合は自動再起動できません。通信断として通知・表示し、手動で確認します。

## Discord 通知

親機側の Remote 設定に Discord Webhook を登録すると、子機の API 通信断、通信の回復、子機の自動再起動の上限到達・停止を通知します。状態が変わったときに通知し、同じ状態が続く間は繰り返しません。通知が失敗した場合は Home に表示します。

Webhook は `server.yml` の `remoteDiscordWebhook` に保存されます。設定取得 API とログには URL を出しません。登録後に入力欄を空欄で保存すると現在の URL を維持し、「登録済みWebhookを削除する」で削除できます。
