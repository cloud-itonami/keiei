# keiei

**`keiei`（経営）は、C-suite の役職台帳と意思決定台帳を AT Protocol 上に置く
ライブラリである。** 名前は日本語の「経営」で、機能を英語で名乗っていないので
ここで名乗る —— これは *management daemon の記録面* であって、経営判断を下す
LLM でも、決定を実行する仕組みでもない。

台帳は 2 面に割れており、その割り方がこの repo の主題である:

| 面 | 中身 | 保存 |
|---|---|---|
| **公開（平文）** | CXO 役職レジストリ —— 役職 id・人間が席に居るか・AI mode（shadow / primary）・自律実行できる決定クラス・エスカレーション先 | 平文の AT record（`com.etzhayyim.apps.keiei.cxoRole`） |
| **機密（E2E）** | CXO 意思決定台帳の本文 —— subject・rationale・principal | `sdk.encryptedWrite` で封（inner type `com.etzhayyim.apps.keiei.cxoDecision`）。read-cap は owner DID + 明示した recipient のみ |

**基盤は決定本文を平文で見ない。** 役職表は元々 `/cxo/listRoles` として
無認証で配っていた組織図メタデータなので平文のまま、意思決定の本文（M&A・
人員削減・支出ドラフト・情報開示）は CUI なので封じる、という非対称が設計の核心。

## この repo が持たないもの（境界）

**規制対象の「行為」はここに来ない。記録だけが来る。** 次の 3 つは etzhayyim 側に
留まり、consent-capability 経由で消費する:

- 金銭的アクションの**実行**（カード決済・送金・給与支払い）
- 外部メール**送信**の実行
- LLM 審議の**推論**そのもの

つまり `recordDecision` は「決定が下されたことの封じられた記録」を作るのであって、
決定を実行しない。

## 中身

```
kotoba/          TypeScript 実装。これが本体で、テスト済み（下記）
  src/types.ts     record 形状・NSID・バリデータ（AT-Lexicon に float を出さない）
  src/registry.ts  7 つの API 関数
  src/index.ts     barrel
  test/            5 テスト
lg/              Python 製 LSP を包む k8s コンテナのレシピ。⚠ 下記のとおり
                 この repo だけでは build できない
```

### API（`kotoba/src/index.ts`）

| 関数 | 面 | 備考 |
|---|---|---|
| `registerRole` / `getRole` / `listRoles` | 平文 | 同じ roleId の再登録は `alreadyExists` で拒否。`listRoles` は aiMode で絞れる |
| `recordDecision` | E2E | **FK 検査つき** —— 未登録の roleId は `unknownRole` で拒否。urgency は整数 0–100 |
| `listDecisions` / `getDecision` | E2E | 最大 10,000 件を走査して絞る。**cursor は返さない**（`ListDecisionsOutput.cursor` は現状未使用） |
| `coverage` | 両方 | 役職を aiMode 別、決定をクラス別に数える。上限に当たったら `truncated: true` |

すべて例外を投げず `{status: "rejected", error: ...}` / `{error: ...}` を返す。

## 検証済みの状態（2026-08-14 実測）

`kotoba/` は**緑**である。node v22.22.3 / npm 10.9.8 で実測:

```
Test Files  1 passed (1)
     Tests  5 passed (5)
tsc --noEmit → クリーン
```

5 テストが固定している不変条件:

1. 役職の登録・重複拒否・不正な aiMode / authorityClass の拒否・取得・絞り込み
2. 決定が `encryptedWrite` で封じられ `encryptedRead` で往復し、FK と各フィールドが検査される
3. **recipient でない DID は復号できない**（`listDecisions` が 0 件、`getDecision` が `notFound`）
4. 明示した recipient（CEO 自動開示）には read-cap が渡る
5. coverage が aiMode 別・決定クラス別に正しく数える

手順は [`docs/operator-quickstart.md`](docs/operator-quickstart.md)。

## 既知のギャップ（直っていない。読む人が踏まないために書く）

- **`lg/` はこの repo だけでは build できない。** `lg/Dockerfile` は
  `COPY --from=py . /opt/kotodama` で Python の `kotodama` ツリーを
  `--build-context py=../../../40-engine/kotoba/crates/kotoba-kotodama/py`
  から受け取る前提だが、**その Python source は抽出時に持って来ていない**
  （この repo に `.py` は 1 本も無い）。`lg/README.md` の build 手順は
  現状そのままでは通らない。
- **`lg/README.md` のリンクは全部切れている。** `../../../90-docs/adr/…` は
  抽出前の monorepo のパスで、repo の外を指す。
- **`README.edn` が古い。** `:repository "etzhayyim/com-etzhayyim-app-keiei"` と
  書いてあるが、実際の所在は `cloud-itonami/keiei`。
- **npm の git 依存が redirect 頼み。** `package.json` は
  `github.com/etzhayyim/com-etzhayyim-sdk` / `-sdk-mock` を指すが、実体は
  `kotoba-lang/sdk` / `kotoba-lang/sdk-mock` に移っており、GitHub の
  redirect でだけ解決している。
- **`MIGRATION-TODO.md` のチェックリストは未消化。** ただし同ファイル末尾が
  記録しているとおり、自動スキャンは禁止依存（Stripe / RisingWave / Kysely /
  GA4 等）を 1 件も検出していない。TRANSFORM 分類はドメインパターンによるもので、
  検出された違反によるものではない。

## ライセンス

Apache-2.0 + etzhayyim Charter Compliance Rider v3.1（`NOTICE` 参照）。
