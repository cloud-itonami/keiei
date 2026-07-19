# keiei-lsp container image

Multi-replica k8s deployment of the C-suite role LSP. Phase 4 of
[ADR-2605101200](../../../90-docs/adr/2605101200-ai-cxo-roles-lsp-resident.md).

Wraps the same `KeieiServer` dispatcher used by the local stdio /
Unix-socket transport (`python -m kotodama.keiei`) behind a thin
FastAPI HTTP transport (`kotodama.keiei.http_server:app`) served
by granian per [ADR-2605080600](../../../90-docs/adr/2605080600-langgraph-server-granian-l3-runtime.md).

## Endpoints

| Path | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | none | liveness + leader identity + lease status |
| `/ok` | GET | none | alias of `/health` for k8s probes |
| `/cxo/listRoles` | GET | none | cached role registry |
| `/leader` | GET | none | who currently holds the writer lease |
| `/jsonrpc` | POST | `KEIEI_HTTP_BEARER` (optional) | JSON-RPC envelope routed to dispatcher |

Followers respond to write-bound calls with HTTP 503 +
`X-Keiei-Leader: <identity>` + body `status="not-leader"` so smart
clients can retry against the lease holder.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `KEIEI_LEDGER_PATH` | `/data/keiei/CXO-LEDGER.md` | append-only audit ledger |
| `KEIEI_MAILER_STATE_PATH` | `/data/keiei/CXO-MAILER-STATE.json` | mailer seq watermark |
| `KEIEI_LEADER_ENABLED` | `0` | set `1` in cluster to enable k8s Lease |
| `KEIEI_LEADER_NAMESPACE` | `keiei` | namespace for the Lease |
| `KEIEI_LEADER_NAME` | `keiei-writer` | Lease name |
| `KEIEI_LEADER_IDENTITY` | `HOSTNAME` | unique per pod (k8s injects via downward API) |
| `KEIEI_LEADER_TTL_SEC` | `15` | lease duration |
| `KEIEI_LEADER_RENEW_SEC` | `5` | renew interval |
| `KEIEI_HTTP_BEARER` | `""` | when set, `/jsonrpc` requires this token |
| `etzhayyim_LLM_URL` | gemma-e2b.etzhayyim.com | LLM endpoint for deliberation |
| `etzhayyim_LLM_API_KEY` | `""` | LLM bearer (Keychain-injected) |

## Build

Remote BuildKit on `etzhayyim-vke` (linux/amd64). Mount the `kotodama`
source tree as a build context so we don't push it to a registry:

```
cd 60-apps/etzhayyim-project-keiei/lg
docker buildx build \
  --builder etzhayyim-vke --platform linux/amd64 \
  --build-context py=../../../40-engine/kotoba/crates/kotoba-kotodama/py \
  --cache-from type=registry,ref=ghcr.io/etzhayyim/build-cache:keiei-lsp \
  --cache-to   type=registry,ref=ghcr.io/etzhayyim/build-cache:keiei-lsp,mode=max \
  -t ghcr.io/etzhayyim/keiei-lsp:0.2.0-amd64 --push .
```

Deploy: see [`50-infra/k8s/keiei/RUNBOOK.md`](../../../50-infra/k8s/keiei/RUNBOOK.md).
