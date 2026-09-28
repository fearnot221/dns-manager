#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
# systemd parses EnvironmentFile without evaluating shell substitutions.
exec systemd-run --quiet --wait --pipe --collect --uid=dnsdeploy --gid=dnsdeploy \
  --property=SupplementaryGroups=docker \
  --property=WorkingDirectory=/home/snmg/dns-manager \
  --setenv=TMPDIR=/home/snmg/state/tmp \
  --property=EnvironmentFile=/home/snmg/config/webhook.env \
  /bin/bash /home/snmg/deploy/deploy.sh
