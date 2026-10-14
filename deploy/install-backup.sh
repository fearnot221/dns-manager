#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_bin=$(command -v node || true)
if [[ -z "$node_bin" && -x /home/snmg/node/bin/node ]]; then node_bin=/home/snmg/node/bin/node; fi
[[ "$node_bin" = /* && "$node_bin" != *[[:space:]]* ]] || { echo 'An absolute Node.js path is required'; exit 1; }
command -v docker >/dev/null
command -v flock >/dev/null

if [[ ${1:-} == --user && $# == 1 && $EUID != 0 ]]; then
  # Interim coverage under the existing Docker-enabled account. Does not grant
  # sudo or read protected host config. Keep this limitation in the checkpoint.
  base="$HOME/.local/lib/dns-manager-backup"
  backup_dir="$HOME/dns-manager-backups"
  mkdir -p "$base" "$backup_dir"
  chmod 0700 "$base" "$backup_dir"
  install -m 0700 "$source_dir/backup.mjs" "$base/backup.mjs"
  DNS_BACKUP_DIR="$backup_dir" "$node_bin" "$base/backup.mjs"
  cron_file=$(mktemp)
  trap 'rm -f "$cron_file"' EXIT
  { crontab -l 2>/dev/null || true; } | sed '/^# BEGIN DNS MANAGER BACKUP$/,/^# END DNS MANAGER BACKUP$/d' > "$cron_file"
  {
    echo '# BEGIN DNS MANAGER BACKUP'
    # VM uses UTC: daily at 18:15 UTC / 02:15 Asia/Taipei.
    printf '15 18 * * * PATH=/usr/local/bin:/usr/bin:/bin DNS_BACKUP_DIR="%s" /usr/bin/flock -n "%s/backup.lock" "%s" "%s/backup.mjs" >> "%s/backup.log" 2>&1\n' "$backup_dir" "$backup_dir" "$node_bin" "$base" "$backup_dir"
    echo '# END DNS MANAGER BACKUP'
  } >> "$cron_file"
  crontab "$cron_file"
  echo 'User backup installed: daily DB, runtime config, PowerDNS API snapshot and isolated restore drill. Protected host config/offsite still need administrator setup.'
elif [[ $# == 0 && $EUID == 0 ]]; then
  install -d -m 0700 /home/snmg/backups/dns-manager-v1
  install -d -m 0755 /home/snmg/deploy
  install -m 0755 "$source_dir/backup.mjs" /home/snmg/deploy/backup.mjs
  cat > /etc/systemd/system/dns-manager-backup.service <<EOF
[Unit]
Description=DNS Manager backup and isolated restore verification
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
UMask=0077
EnvironmentFile=-/home/snmg/config/backup.env
ExecStart=/usr/bin/flock -n /home/snmg/backups/dns-manager-v1/backup.lock $node_bin /home/snmg/deploy/backup.mjs
TimeoutStartSec=30min
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/snmg/backups/dns-manager-v1
NoNewPrivileges=true
EOF
  cat > /etc/systemd/system/dns-manager-backup.timer <<'EOF'
[Unit]
Description=Daily DNS Manager backup

[Timer]
OnCalendar=*-*-* 02:15:00 Asia/Taipei
RandomizedDelaySec=5m
Persistent=true
Unit=dns-manager-backup.service

[Install]
WantedBy=timers.target
EOF
  chmod 0644 /etc/systemd/system/dns-manager-backup.{service,timer}
  systemctl daemon-reload
  systemctl start dns-manager-backup.service
  systemctl enable --now dns-manager-backup.timer
  echo 'Root backup installed; inspect last-successful.json and systemctl status dns-manager-backup.timer.'
  echo 'After verifying root coverage, remove only the managed DNS MANAGER BACKUP block from snmg crontab if user mode was installed earlier.'
else
  echo 'Usage: sudo bash deploy/install-backup.sh (full host config) OR bash deploy/install-backup.sh --user (interim coverage)'
  exit 1
fi
