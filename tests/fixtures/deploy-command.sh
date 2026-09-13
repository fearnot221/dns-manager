#!/usr/bin/env bash
set -eu
case "${0##*/}" in
  flock) exit 0 ;;
  git)
    case "$*" in
      'remote get-url origin') echo 'https://github.com/fearnot221/dns-manager.git' ;;
      'branch --show-current') echo main ;;
      'status --porcelain') if [[ ${TEST_DIRTY:-0} == 1 ]]; then echo ' M local-file'; fi ;;
      'rev-parse HEAD') echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
    esac
    ;;
  docker)
    printf '%s\n' "$*" >> "$DEPLOY_TEST_LOG"
    if [[ "$*" == *' build '* && ${TEST_FAIL_BUILD:-0} == 1 ]]; then exit 42; fi
    if [[ "$*" == *' up '* && ${TEST_FAIL_UP:-0} == 1 ]]; then exit 43; fi
    ;;
esac
