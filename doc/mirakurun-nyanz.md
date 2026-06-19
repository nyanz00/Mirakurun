# Windows native fork notes

この文書は、`nyanz00/win32` ブランチで追加した Windows ネイティブ運用向けの変更点をまとめたものです。

このフォークは Mirakurun 4.0.0 系を Windows 上で動かすための移植・調整版です。

通常の Linux / Docker 環境で使う場合は、本家 Mirakurun を使ってください。

## 主な変更点

- Windows サービス登録用の `service:install.win32` / `service:uninstall.win32` を追加
- 設定・DB・ログをディレクトリ直下の `data\` に保存する方式に変更
- Windows のパス区切りによる API 404 を避けるため、URL 内のバックスラッシュを補正
- remote Mirakurun で取得した EPG を events に流すように変更（EPGStation で remote Mirakurun の局の EPG が更新されない問題を解決）
- remote Mirakurun で取得した番組・サービスを親 Mirakurun 側でも扱いやすいように調整
- remote Mirakurun の局ロゴを親 Mirakurun 側で取得・キャッシュできるように調整
- 物理チャンネルが同じ局を別のチューナーで扱いたい時のため、`GR-ALT1` から `GR-ALT20` までのチャンネルタイプを追加
- Windows 環境向けにデフォルトの地上波チャンネルスキャン範囲を `0` から `52` に変更
- Web UI の channel scan では、存在するチューナータイプだけを選択肢に表示
- Web UI の tuner status に表示される dropped pkts を TS continuity counter ベースで数えるように調整
- BS/CS の局ロゴ取得で DSM-CC の重複ブロックを二重カウントしないように調整
- 随時本家版の変更に追従

## インストール

Node.js 18 / 20 / 22 のいずれかを入れた Windows 環境で実行してください。

```powershell
git clone -b win32 https://github.com/nyanz00/Mirakurun.git
cd Mirakurun
npm install
npm run build
```

## 設定ファイル

初期設定は `data\config\` に配置します。

- `data\config\server.yml`
- `data\config\tuners.yml`
- `data\config\channels.yml`

tuners.yml、channels.ymlの一例

```yaml
- name: PT3-T0
  types:
    - GR
  command: C:\nyanzTV\BonRecTest.exe --space <space> --driver C:\nyanzTV\BonDriver_PT3-T0.dll --output - --channel <channel>
  decoder: C:\nyanzTV\arib-b25-stream-test.exe
  isDisabled: false
```

```yaml
- name: ＮＨＫ総合１・大阪
  type: GR
  space: 0
  channel: '11'
```

Windows 環境では物理チャンネルが Linux 環境から -13 された 0 から始まるので、アンテナメーカーのサイトに書いてある物理チャンネル番号から -13 した数字を記載してください。例えば、24 と記載されていた場合は 11 です。
チャンネルタイプの `GR-ALT*` はチューナーコマンドへ渡す時は `GR` として扱われ、Mirakurun 内部のチューナー割り当てでは別タイプとして扱われます。

## コマンドライン起動

テストや手動起動では次を使います。

```powershell
npm start
```

互換用に `npm run start.win32` でも起動できます。

標準出力・標準エラーはコンソールにも出ますが、同時に以下へ保存されます。

- `data\log\stdout.log`
- `data\log\stderr.log`

サービス・番組データ・局ロゴは以下へ保存されます。

- `data\db\services.json`
- `data\db\programs.json`
- `data\db\logo-data\`

## Windows サービス

管理者権限の PowerShell で実行してください。

```powershell
npm run service:install.win32
```

登録されるサービス名は `mirakurun-nyanz` です。本家 Mirakurun のサービス名とは別名になっているため、テストの際に本家をアンインストールする必要はありません。

アンインストールは次のコマンドで行ってください。

```powershell
npm run service:uninstall.win32
```

## Web UI

起動後、通常の Mirakurun と同じく以下へアクセスします。

```text
http://localhost:40772/
http://<server-ip>:40772/
```

## 注意点・あとがき

- Linux / Docker での動作は確認していないため、その環境での動作は保証していません。
- フォーク作成者本人は特にプログラミングの知識は無く、Codex を使用して移植しているため、有識者から見たらおかしいコード、非効率的な部分がある可能性があります。その場合は指摘していただけるとありがたいです。
- `GR-ALT*` 対応版の EPGStation は近日中に公開予定です。
- 4.1.2 への対応も近日中に行う予定です。これを作成し始めたら本家がアップデートされたので現状は 4.0.0-beta18 ベースです...
