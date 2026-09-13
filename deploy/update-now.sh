#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
# systemd parses EnvironmentFile without evaluating shell substitutions.
exec systemd-run --quiet --wait --pipe --collect --uid=dnsdeploy --gid=dnsdeploy \
  --property=SupplementaryGroups=docker \
  --property=EnvironmentFile=/etc/dns-manager/webhook.env \
  /bin/bash /opt/dns-manager-deploy/deploy.sh
