#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?Exporta AWS_REGION antes de publicar}"
: "${AWS_ACCOUNT_ID:?Exporta AWS_ACCOUNT_ID antes de publicar}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
push_target="${1:-all}"
revision="$(git -C "$repo_root" rev-parse HEAD)"
expected_tag="demo-$(git -C "$repo_root" rev-parse --short=8 HEAD)"
image_tag="${IMAGE_TAG:-$expected_tag}"
registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
repositories=()

case "$push_target" in
  integration-service) repositories+=("${INTEGRATION_ECR_REPOSITORY:-aws-community-day-resilient-integration}") ;;
  external-api) repositories+=("${EXTERNAL_ECR_REPOSITORY:-aws-community-day-external-api}") ;;
  all) repositories+=("${INTEGRATION_ECR_REPOSITORY:-aws-community-day-resilient-integration}" "${EXTERNAL_ECR_REPOSITORY:-aws-community-day-external-api}") ;;
  *) printf 'Uso: %s [integration-service|external-api|all]\n' "$0" >&2; exit 1 ;;
esac
if [[ -n "$(git -C "$repo_root" status --porcelain)" || "$image_tag" != "$expected_tag" ]]; then
  printf 'Publica desde un checkout limpio con el tag %s.\n' "$expected_tag" >&2
  exit 1
fi
for repository in "${repositories[@]}"; do
  image="${repository}:${image_tag}"
  metadata="$(docker image inspect --format '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}} {{index .Config.Labels "demo.source-clean"}}' "$image")"
  if [[ "$metadata" != "arm64 ${revision} true" ]]; then
    printf 'Reconstruye %s desde este commit limpio en ARM64.\n' "$image" >&2
    exit 1
  fi
done
if [[ "$(aws sts get-caller-identity --query Account --output text)" != "$AWS_ACCOUNT_ID" ]]; then
  printf 'AWS_ACCOUNT_ID no coincide con la identidad activa.\n' >&2
  exit 1
fi
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$registry"
for repository in "${repositories[@]}"; do
  image="${repository}:${image_tag}"
  docker tag "$image" "${registry}/${image}"
  docker push "${registry}/${image}"
  printf 'Imagen publicada: %s/%s\n' "$registry" "$image"
done
