#!/bin/bash
# Isolated test fixture: record attempts, without Git/Docker or deployment.
set -eu
# Exercise completion beyond vi.waitFor's one-second default on busy build hosts.
sleep 1.2
printf 'attempt\n' >> "$DEPLOY_STATE_DIR/test-attempts"
exit 1
