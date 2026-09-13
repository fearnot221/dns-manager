#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${DEPLOY_DIR:?Set absolute checkout path}"
: "${DEPLOY_ENV_FILE:?Set absolute production env file path}"
: "${DEPLOY_BRANCH:?Set branch}"
: "${DEPLOY_REPOSITORY:?Set owner/repo}"
: "${DEPLOY_STATE_DIR:?Set absolute state directory}"
[[ "$DEPLOY_DIR" = /* && "$DEPLOY_DIR" != / && "$DEPLOY_DIR" != "$HOME" ]] || exit 1
[[ "$DEPLOY_ENV_FILE" = /* && "$DEPLOY_STATE_DIR" = /* ]] || exit 1
[[ "$DEPLOY_BRANCH" =~ ^[a-zA-Z0-9_/-]+$ && "$DEPLOY_BRANCH" != -* ]] || exit 1
[[ "$DEPLOY_REPOSITORY" =~ ^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$ ]] || exit 1
mkdir -p "$DEPLOY_STATE_DIR"
# Also serializes a manual deployment with webhook-triggered work (Linux util-linux).
exec 9>"$DEPLOY_STATE_DIR/deploy.lock"
flock -w 1800 9
cd "$DEPLOY_DIR"
[[ "$(git remote get-url origin)" == "https://github.com/$DEPLOY_REPOSITORY.git" || "$(git remote get-url origin)" == "git@github.com:$DEPLOY_REPOSITORY.git" ]] || { echo 'Unexpected Git origin'; exit 1; }
[[ "$(git branch --show-current)" == "$DEPLOY_BRANCH" ]] || { echo 'Unexpected checked-out branch'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Checkout is dirty; refusing to overwrite changes'; exit 1; }
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes'
git fetch --no-tags origin "$DEPLOY_BRANCH"
git merge --ff-only FETCH_HEAD
export DEPLOY_TAG
DEPLOY_TAG="$(git rev-parse HEAD)"
compose=(docker compose --project-name dns-manager --env-file "$DEPLOY_ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml")
"${compose[@]}" config --quiet
# Build before downtime. Never stop the current release if lint/test/build fails.
"${compose[@]}" build --pull web migrate
# Intentionally restart the whole application stack as requested. Preserve named volumes.
# The separate ingress container and host webhook service remain available.
"${compose[@]}" down --timeout 30
if ! "${compose[@]}" up -d --wait --wait-timeout 180; then
  echo 'New web container did not become healthy. Database migrations are NOT automatically reversed.'
  echo 'Inspect docker compose logs, then redeploy a compatible commit. No data volume has been removed.'
  exit 1
fi
printf '%s\n' "$DEPLOY_TAG" > "$DEPLOY_STATE_DIR/last-successful-commit"
echo "Healthy deployment: $DEPLOY_TAG"
