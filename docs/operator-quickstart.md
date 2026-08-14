# operator quickstart — keiei

この手順は 2026-08-14 に**実際に踏んで**書いた。踏めなかったものは
「踏めない」と書いてある（§4）。

対象は `kotoba/`（TypeScript 実装）。`lg/` は現状この repo だけでは
build できないので、この quickstart には含めない —— 理由は §4。

## 0. 前提 —— npm のバージョンを先に見る

**npm 11.16.0 ではこの repo の `npm install` は完了しない。** 先に確認する:

```bash
node -v && npm -v
```

| 実測した組み合わせ | `npm install` |
|---|---|
| node v22.22.3 / **npm 10.9.8** | ✅ 通る（135 packages / 約 1 分） |
| node v26.3.0 / **npm 11.16.0** | ❌ `EALLOWSCRIPTS` で落ちる |

理由は §5。**これは repo の欠陥ではなく npm 側の挙動**なので、
`package.json` や `.npmrc` をいじっても直らない（両方試して直らないことを確認した）。
npm 11.16 系しか無い環境では、10.9.x を用意するか、それが入っているマシンで回す。

## 1. 取得

```bash
git clone https://github.com/cloud-itonami/keiei.git
cd keiei/kotoba
```

## 2. 依存の取得

```bash
npm install
```

期待する終わり方:

```
added 135 packages, and audited 136 packages in 1m
found 0 vulnerabilities
```

`@etzhayyim/sdk` と `@etzhayyim/sdk-mock` は git 依存で、`prepare: tsc` で
ビルドされてから入る。したがって**ここはネットワークと git を使う**（npm registry
だけでは足りない）。

## 3. テストと型検査

```bash
npm test
```

```
 ✓ test/keiei.test.ts (5 tests) 4ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

```bash
npm run typecheck        # tsc --noEmit
```

出力なし・終了コード 0 なら通っている。

**この 2 つが緑になったら、環境は正しい。** 5 テストが何を固定しているかは
[`../README.md`](../README.md) の「検証済みの状態」を参照。

個々のテスト名まで見たいとき:

```bash
npx vitest run --reporter=verbose
```

## 4. この repo からは踏めないこと

- **`lg/` のコンテナ build。** `lg/README.md` に載っている
  `docker buildx build … --build-context py=../../../40-engine/kotoba/crates/kotoba-kotodama/py`
  は、抽出前の monorepo のパスを指している。**その Python source（`kotodama`）は
  この repo に無い**（`git ls-files | grep '\.py$'` が 0 件）。したがって
  `lg/Dockerfile` の `COPY --from=py . /opt/kotodama` は解決できない。
  build するには `kotodama` のツリーを別途用意して build-context に渡す必要がある。
- **実 AT Protocol への書き込み。** テストは `@etzhayyim/sdk-mock` の
  `MockEtzhayyim` に対して回っており、実 PDS も実鍵も要らない。逆に言えば、
  この quickstart は**実基盤に対する動作確認をしていない**。

## 5. 落ちたときの読み方

### `npm error code EALLOWSCRIPTS`

```
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
npm error npm error Add the entries to the "allowScripts" field in package.json, or to .npmrc, instead.
```

npm が git 依存を用意するために自分で起こす子プロセスが `--allow-scripts` を
付けており、npm 11.16.0 の検査がそれを拒否する。エラー文は package.json か
.npmrc に書けと言うが、**その助言は効かない** —— 拒否されているのは子プロセスの
引数であって、こちらのプロジェクト設定ではない。実測で確認した:

- `.npmrc` に `allow-scripts=true` → 同じエラー
- `package.json` に `"allowScripts": {"@etzhayyim/sdk": true, …}` → 同じエラー

**対処は npm 10.9.x で回すこと。**

### `Could not resolve "@etzhayyim/sdk"`

`npm install` が §2 の終わり方をしていない。`node_modules/@etzhayyim/sdk/dist/`
が在るか見る —— 無ければ `prepare` が走っていないので、上の EALLOWSCRIPTS を疑う。
