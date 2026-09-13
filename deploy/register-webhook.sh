#!/usr/bin/env bash
set +x
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
echo 'Use a short-lived fine-grained GitHub token for fearnot221/dns-manager: Webhooks read/write.'
echo 'The token is used once, is not saved, and can be revoked immediately afterward.'
IFS= read -r -s -p 'GitHub token: ' registration_token </dev/tty
echo
[[ -n "$registration_token" ]] || exit 1
if printf '%s' "$registration_token" | /opt/dns-manager-node/bin/node /opt/dns-manager-deploy/register-webhook.mjs; then
  unset registration_token
else
  registration_status=$?
  unset registration_token
  printf '[webhook] Node registration process exited with code %s; see diagnostics above.\n' "$registration_status" >&2
  exit "$registration_status"
fi
