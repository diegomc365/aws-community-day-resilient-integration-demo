#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?Exporta AWS_REGION antes de publicar}"
: "${AWS_ACCOUNT_ID:?Exporta AWS_ACCOUNT_ID antes de publicar}"
: "${ECR_REPOSITORY:?Exporta ECR_REPOSITORY antes de publicar}"
: "${IMAGE_TAG:?Exporta IMAGE_TAG antes de publicar}"

local_image="${ECR_REPOSITORY}:${IMAGE_TAG}"
registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
remote_image="${registry}/${local_image}"

docker image inspect "${local_image}" >/dev/null
architecture="$(docker image inspect --format '{{.Architecture}}' "${local_image}")"
if [[ "${architecture}" != arm64 ]]; then
  printf 'La imagen %s es %s; ECS Fargate espera ARM64.\n' "${local_image}" "${architecture}" >&2
  exit 1
fi

aws ecr get-login-password --region "${AWS_REGION}" |
  docker login --username AWS --password-stdin "${registry}"
docker tag "${local_image}" "${remote_image}"
docker push "${remote_image}"

printf 'Imagen publicada: %s\n' "${remote_image}"
