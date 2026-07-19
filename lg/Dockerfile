# keiei-lsp Dockerfile (Phase 4 of ADR-2605101200).
#
# Multi-replica k8s deploy of the C-suite role LSP. Same KeieiServer
# dispatcher as the local stdio / Unix-socket transport, fronted by a
# FastAPI HTTP transport (kotodama.keiei.http_server:app) served by
# granian per ADR-2605080600.
#
# Build (remote BuildKit, linux/amd64):
#   cd 60-apps/etzhayyim-project-keiei/lg
#   docker buildx build \
#     --builder etzhayyim-vke \
#     --platform linux/amd64 \
#     --build-context py=../../../40-engine/kotoba/crates/kotoba-kotodama/py \
#     --cache-from type=registry,ref=ghcr.io/etzhayyim/build-cache:keiei-lsp \
#     --cache-to   type=registry,ref=ghcr.io/etzhayyim/build-cache:keiei-lsp,mode=max \
#     -t ghcr.io/etzhayyim/keiei-lsp:0.2.0-amd64 \
#     --push .

FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir 'uv>=0.4'

WORKDIR /app

# kotodama (mounted via --build-context py=../../../40-engine/kotoba/crates/kotoba-kotodama/py)
COPY --from=py . /opt/kotodama
RUN uv pip install --system --no-cache -e /opt/kotodama

# keiei HTTP transport runtime deps. Kept narrow on purpose — the
# JSON-RPC dispatcher itself has zero external deps; only the FastAPI
# wrapper + granian ASGI server need pulling in.
RUN uv pip install --system --no-cache \
        'fastapi>=0.115' \
        'granian[reload]>=1.7' \
        'uvloop>=0.19'

RUN uv pip uninstall --system uv 2>/dev/null || true

# State dir matches the PVC mount path (see 50-infra/k8s/keiei).
RUN mkdir -p /data/keiei
ENV KEIEI_LEDGER_PATH=/data/keiei/CXO-LEDGER.md \
    KEIEI_MAILER_STATE_PATH=/data/keiei/CXO-MAILER-STATE.json

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["granian", \
     "--interface", "asgi", \
     "kotodama.keiei.http_server:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--loop", "uvloop"]
