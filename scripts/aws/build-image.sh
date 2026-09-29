#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ecr_repository="${ECR_REPOSITORY:-aws-community-day-resilient-integration}"
image_tag="${IMAGE_TAG:-v1}"
image="${ecr_repository}:${image_tag}"

docker build \
  --platform linux/arm64 \
  --file "${repo_root}/apps/integration-service/Dockerfile" \
  --tag "${image}" \
  "${repo_root}"

printf 'Imagen local lista: %s (linux/arm64)\n' "${image}"
