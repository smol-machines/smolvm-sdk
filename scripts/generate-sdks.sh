#!/usr/bin/env bash
#
# Regenerate the Python and Node SDK model layers from the OpenAPI spec.
#
# The generated code (smolvm-python/smolvm/generated, smolvm-node/src/generated)
# is a build artifact: it is .gitignored and re-exported by the hand-written SDK
# purely for OpenAPI-compatibility validation — it is not used at runtime. Run
# this after the spec changes; the SDK works without it (see types.py's guarded
# import), but the drift check needs it.
#
# The single source of truth is openapi.json at the repo root. Refresh it from a
# running server first when the API changes, e.g.:
#     curl -s http://127.0.0.1:8080/api-docs/openapi.json > openapi.json
#
# Prerequisites (installed on demand, skipped with a warning if absent):
#     Python: pip install "datamodel-code-generator>=0.25"
#     Node:   (cd smolvm-node && npm install)   # openapi-typescript
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="$ROOT/openapi.json"
[ -f "$SPEC" ] || { echo "error: OpenAPI spec not found: $SPEC" >&2; exit 1; }

# ---- Python: OpenAPI -> dataclasses (smolvm/generated/__init__.py) -----------
if python3 -c "import datamodel_code_generator" 2>/dev/null; then
    echo "==> Python: generating smolvm-python/smolvm/generated"
    mkdir -p "$ROOT/smolvm-python/smolvm/generated"
    python3 -m datamodel_code_generator \
        --input "$SPEC" --input-file-type openapi \
        --output "$ROOT/smolvm-python/smolvm/generated/__init__.py" \
        --output-model-type dataclasses.dataclass \
        --use-standard-collections --target-python-version 3.10 \
        --disable-timestamp
else
    echo "!! skipping Python: datamodel-code-generator not installed" >&2
    echo "   pip install 'datamodel-code-generator>=0.25'" >&2
fi

# ---- Node: OpenAPI -> openapi-typescript (src/generated) --------------------
if command -v npm >/dev/null 2>&1; then
    echo "==> Node: generating smolvm-node/src/generated"
    # package.json's `generate` reads the root openapi.json directly.
    if ! ( cd "$ROOT/smolvm-node" && npm run generate ); then
        echo "!! Node generation failed — install the toolchain first:" >&2
        echo "   (cd smolvm-node && npm install)   # openapi-typescript" >&2
    fi
else
    echo "!! skipping Node: npm not found" >&2
fi

echo "done."
