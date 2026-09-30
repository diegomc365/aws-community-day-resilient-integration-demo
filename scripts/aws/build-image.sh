#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
build_target="${1:-all}"
revision="$(git -C "$repo_root" rev-parse HEAD)"
short_sha="$(git -C "$repo_root" rev-parse --short=8 HEAD)"
image_tag="${IMAGE_TAG:-demo-${short_sha}}"
source_clean=true
if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then source_clean=false; fi

build_image() {
  local service="$1" repository="$2"
  docker build --platform linux/arm64 \
    --file "${repo_root}/apps/${service}/Dockerfile" \
    --label "org.opencontainers.image.revision=${revision}" \
    --label "demo.source-clean=${source_clean}" \
    --tag "${repository}:${image_tag}" "$repo_root"
  printf 'Imagen local: %s:%s (ARM64, checkout limpio=%s)\n' "$repository" "$image_tag" "$source_clean"
}

case "$build_target" in
  integration-service|external-api|all) ;;
  *) printf 'Uso: %s [integration-service|external-api|all]\n' "$0" >&2; exit 1 ;;
esac
if [[ "$build_target" != external-api ]]; then
  build_image integration-service "${INTEGRATION_ECR_REPOSITORY:-aws-community-day-resilient-integration}"
fi
if [[ "$build_target" != integration-service ]]; then
  build_image external-api "${EXTERNAL_ECR_REPOSITORY:-aws-community-day-external-api}"
fi
