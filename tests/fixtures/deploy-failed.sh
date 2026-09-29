#!/bin/bash
# Isolated test fixture: record attempts, without Git/Docker or deployment.
set -eu
printf 'attempt\n' >> "$DEPLOY_STATE_DIR/test-attempts"
exit 1
