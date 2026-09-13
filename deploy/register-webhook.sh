#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
echo 'Use a short-lived fine-grained GitHub token for fearnot221/dns-manager: Webhooks read/write.'
echo 'The token is used once, is not saved, and can be revoked immediately afterward.'
IFS= read -r -s -p 'GitHub token: ' registration_token </dev/tty
echo
[[ -n "$registration_token" ]] || exit 1
printf '%s' "$registration_token" | /opt/dns-manager-node/bin/node /opt/dns-manager-deploy/register-webhook.mjs
unset registration_token
