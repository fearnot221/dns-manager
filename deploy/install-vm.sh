#!/usr/bin/env bash
# Dedicated Ubuntu 22.04/24.04 VM bootstrap. Download/review before running sudo bash.
set -Eeuo pipefail
umask 077
if [[ ${1:-} == --help ]]; then
  echo 'sudo bash install-vm.sh (Ubuntu 22.04/24.04 LTS, amd64/arm64, installed VM)'
  echo 'Prompts for VM and separate Caddy private IPv4 addresses. Optional env: VM_IP CADDY_IP.'
  echo 'Installs Docker/Compose, Node 22, application, private ingress, signed webhook service.'
  echo 'Preserves application secrets/data on rerun; does not configure the external Caddy or DNS.'
  exit 0
fi
ubuntu_suite() {
  case "$1:$2" in
    ubuntu:22.04) echo jammy ;;
    ubuntu:24.04) echo noble ;;
    *) return 1 ;;
  esac
}
[[ $# -eq 0 && $EUID -eq 0 ]] || { echo 'Run: sudo bash install-vm.sh'; exit 1; }
# runuser inherits cwd. A caller's private home may be unreadable to dnsdeploy.
cd /
[[ -d /run/systemd/system ]] || { echo 'Requires a booted Linux VM with systemd, not a container.'; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
ubuntu_codename=$(ubuntu_suite "$ID" "$VERSION_ID") || { echo 'This installer supports Ubuntu Server 22.04 and 24.04 LTS.'; exit 1; }
root_filesystem=$(findmnt --noheadings --output FSTYPE /)
case "$root_filesystem" in
  overlay|squashfs) echo 'Install Ubuntu onto the VM disk and reboot out of the Live ISO before deploying.'; exit 1 ;;
esac
case "$(dpkg --print-architecture)" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *) echo 'Requires amd64 or arm64.'; exit 1 ;;
esac

private_ipv4() {
  local a b c d octet
  [[ $1 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || return 1
  IFS=. read -r a b c d <<< "$1"
  for octet in "$a" "$b" "$c" "$d"; do
    [[ $octet == 0 || $octet != 0* ]] || return 1
    (( 10#$octet <= 255 )) || return 1
  done
  (( a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) ))
}
[[ -n ${VM_IP:-} ]] || read -r -p 'VM private IPv4 address: ' VM_IP </dev/tty
[[ -n ${CADDY_IP:-} ]] || read -r -p 'Caddy proxy private IPv4 source address: ' CADDY_IP </dev/tty
private_ipv4 "$VM_IP" && private_ipv4 "$CADDY_IP" && [[ $VM_IP != "$CADDY_IP" ]] || { echo 'Use distinct RFC1918 private IPv4 addresses, without CIDR/ports.'; exit 1; }
ip -4 -o addr show | awk '{split($4,a,"/"); print a[1]}' | grep -Fxq "$VM_IP" || { echo 'VM_IP is not assigned to this VM.'; exit 1; }
# Legacy installations must be migrated offline, never silently attach an empty database.
for legacy_path in /etc/dns-manager /opt/dns-manager /opt/dns-manager-deploy /opt/dns-manager-node /var/lib/dns-manager-webhook; do
  [[ ! -e $legacy_path && ! -L $legacy_path ]] || { echo "Legacy installation at $legacy_path; follow deploy/MIGRATION-HOME.md before installing."; exit 1; }
done
if [[ -e /home/snmg || -L /home/snmg ]]; then
  [[ -d /home/snmg && ! -L /home/snmg && $(stat -c %u /home/snmg) == 0 ]] || { echo '/home/snmg must be a real root-owned project directory, not a user home or symlink.'; exit 1; }
  (( (8#$(stat -c %a /home/snmg) & 8#022) == 0 )) || { echo '/home/snmg must not be group/world writable.'; exit 1; }
else
  install -d -m 0755 -o root -g root /home/snmg
fi
if [[ ! -f /home/snmg/config/managed-install ]]; then
  for install_target in /home/snmg/config /home/snmg/dns-manager /home/snmg/deploy /home/snmg/node /home/snmg/state /home/snmg/data /home/snmg/service-home; do
    [[ ! -e $install_target && ! -L $install_target ]] || { echo "Existing $install_target: refusing to overwrite a manual installation."; exit 1; }
  done
  ! getent passwd dnsdeploy >/dev/null || { echo 'Existing dnsdeploy account: review manual installation first.'; exit 1; }
fi
echo 'Installing into /home/snmg/dns-manager; HTTPS domain: dnsmgr.ce.ncu.edu.tw.'
echo 'No firewall/SSH changes. Allow only the Caddy source IP to VM TCP 8080 in your network firewall.'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl xz-utils util-linux
getent group dnsdeploy >/dev/null || groupadd --system dnsdeploy
id dnsdeploy >/dev/null 2>&1 || useradd --system --gid dnsdeploy --create-home --home-dir /home/snmg/service-home --shell /usr/sbin/nologin dnsdeploy
install -d -m 0755 -o root -g root /home/snmg/state /home/snmg/data
if [[ ! -d /home/snmg/data/postgres ]]; then
  install -d -m 0700 -o root -g root /home/snmg/data/postgres
fi
install -d -m 0700 -o dnsdeploy -g dnsdeploy /home/snmg/state/tmp
install -d -m 0750 -o root -g dnsdeploy /home/snmg/config
touch /home/snmg/config/managed-install
install -d -m 0700 -o dnsdeploy -g dnsdeploy /home/snmg/state/webhook
# Serialize reruns against webhook deployments before touching the checkout or host scripts.
touch /home/snmg/state/webhook/deploy.lock
chown dnsdeploy:dnsdeploy /home/snmg/state/webhook/deploy.lock
chmod 0600 /home/snmg/state/webhook/deploy.lock
exec 9>/home/snmg/state/webhook/deploy.lock
flock -w 1800 9

# Do not replace another Docker installation or silently uninstall conflicting packages.
if ! command -v docker >/dev/null; then
  for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Conflicting package $package; resolve it manually, then rerun."; exit 1
    fi
  done
  install -d -m 0755 /etc/apt/keyrings
  curl --proto '=https' --tlsv1.2 -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/dns-manager-docker.asc
  chmod 0644 /etc/apt/keyrings/dns-manager-docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/dns-manager-docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$ubuntu_codename" > /etc/apt/sources.list.d/dns-manager-docker.list
  chmod 0644 /etc/apt/sources.list.d/dns-manager-docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || { echo 'Install Docker Compose v2.24+ before continuing.'; exit 1; }
compose_version=$(docker compose version --short)
if [[ $compose_version =~ ^v?([0-9]+)\.([0-9]+)\. ]]; then
  (( BASH_REMATCH[1] > 2 || (BASH_REMATCH[1] == 2 && BASH_REMATCH[2] >= 24) )) || { echo 'Upgrade Docker Compose to v2.24+.'; exit 1; }
else
  echo 'Could not verify Docker Compose version.'; exit 1
fi
docker buildx version >/dev/null || { echo 'Install Docker Buildx before continuing.'; exit 1; }
systemctl enable --now docker
usermod -aG docker dnsdeploy

# Official Node distribution, checked against its HTTPS SHA256 manifest; no curl | bash.
if [[ ! -x /home/snmg/node/bin/node ]]; then
  installer_tmp=$(mktemp -d /home/snmg/state/tmp/dns-manager-install.XXXXXXXX)
  trap '[[ ${installer_tmp:-} == /home/snmg/state/tmp/dns-manager-install.* ]] && rm -r -- "$installer_tmp"' EXIT
  curl --proto '=https' --tlsv1.2 -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$installer_tmp/SHASUMS256.txt"
  node_archive=$(awk -v arch="$node_arch" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2}' "$installer_tmp/SHASUMS256.txt")
  [[ $node_archive =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo 'Unexpected Node release manifest.'; exit 1; }
  curl --proto '=https' --tlsv1.2 -fsSL "https://nodejs.org/dist/latest-v22.x/$node_archive" -o "$installer_tmp/$node_archive"
  awk -v archive="$node_archive" '$2 == archive' "$installer_tmp/SHASUMS256.txt" > "$installer_tmp/selected.sha256"
  (cd "$installer_tmp" && sha256sum --check selected.sha256)
  install -d -m 0755 /home/snmg/node
  tar -xJf "$installer_tmp/$node_archive" -C /home/snmg/node --strip-components=1 --no-same-owner --same-permissions
fi
node_bin=/home/snmg/node/bin/node
runuser -u dnsdeploy -- "$node_bin" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)'

if [[ ! -d /home/snmg/dns-manager/.git ]]; then
  install -d -m 0755 -o dnsdeploy -g dnsdeploy /home/snmg/dns-manager
  runuser -u dnsdeploy -- git clone --branch main --single-branch https://github.com/fearnot221/dns-manager.git /home/snmg/dns-manager
else
  [[ $(runuser -u dnsdeploy -- git -C /home/snmg/dns-manager remote get-url origin) == https://github.com/fearnot221/dns-manager.git ]] || { echo 'Unexpected repository.'; exit 1; }
  [[ $(runuser -u dnsdeploy -- git -C /home/snmg/dns-manager branch --show-current) == main ]] || { echo 'Expected main branch.'; exit 1; }
  [[ -z $(runuser -u dnsdeploy -- git -C /home/snmg/dns-manager status --porcelain) ]] || { echo 'Dirty checkout: preserve changes before rerun.'; exit 1; }
  runuser -u dnsdeploy -- git -C /home/snmg/dns-manager pull --ff-only origin main
fi
# Compose schema loading inspects cwd even when -f and --env-file are absolute.
cd /home/snmg/dns-manager

if [[ ! -f /home/snmg/config/app.env ]]; then
  owner_password=$(openssl rand -hex 24)
  printf '%s\n' "$owner_password" > /home/snmg/config/initial-owner-password
  while IFS= read -r line; do
    case "$line" in
      POSTGRES_PASSWORD=*) printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" ;;
      AUTH_SECRET=*) printf 'AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" ;;
      SETTINGS_ENCRYPTION_KEY=*) printf 'SETTINGS_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" ;;
      AUTH_URL=*) echo 'AUTH_URL=https://dnsmgr.ce.ncu.edu.tw' ;;
      OWNER_INITIAL_PASSWORD=*) printf 'OWNER_INITIAL_PASSWORD=%s\n' "$owner_password" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < /home/snmg/dns-manager/deploy/app.env.example > /home/snmg/config/app.env.new
  chown root:dnsdeploy /home/snmg/config/app.env.new
  chmod 0640 /home/snmg/config/app.env.new
  mv /home/snmg/config/app.env.new /home/snmg/config/app.env
  unset owner_password
fi
if [[ ! -f /home/snmg/config/webhook.env ]]; then
  while IFS= read -r line; do
    case "$line" in
      WEBHOOK_SECRET=*) printf 'WEBHOOK_SECRET=%s\n' "$(openssl rand -hex 32)" ;;
      DEPLOY_REPOSITORY=*) echo 'DEPLOY_REPOSITORY=fearnot221/dns-manager' ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < /home/snmg/dns-manager/deploy/webhook.env.example > /home/snmg/config/webhook.env.new
  chown root:dnsdeploy /home/snmg/config/webhook.env.new
  chmod 0640 /home/snmg/config/webhook.env.new
  mv /home/snmg/config/webhook.env.new /home/snmg/config/webhook.env
fi

install -d -m 0700 -o dnsdeploy -g dnsdeploy /home/snmg/state/webhook
install -d -m 0755 /home/snmg/deploy
for deploy_file in deploy.sh webhook.mjs register-webhook.sh register-webhook.mjs update-now.sh; do
  install -m 0755 -o root -g root "/home/snmg/dns-manager/deploy/$deploy_file" "/home/snmg/deploy/$deploy_file"
done
install -m 0644 /home/snmg/dns-manager/deploy/dns-manager-webhook.service /home/snmg/deploy/dns-manager-webhook.service
# Only the systemd registration link is outside the project directory.
if [[ -e /etc/systemd/system/dns-manager-webhook.service || -L /etc/systemd/system/dns-manager-webhook.service ]]; then
  [[ $(readlink /etc/systemd/system/dns-manager-webhook.service) == /home/snmg/deploy/dns-manager-webhook.service ]] || { echo 'Existing webhook service must be migrated first.'; exit 1; }
fi
systemctl link /home/snmg/deploy/dns-manager-webhook.service

compose=(runuser -u dnsdeploy -- docker compose --project-name dns-manager --env-file /home/snmg/config/app.env -f /home/snmg/dns-manager/docker-compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build --pull web migrate
"${compose[@]}" up -d --wait --wait-timeout 180
owner_exists=$("${compose[@]}" exec -T postgres psql -U aegis -d aegis_dns -tAc "SELECT count(*) FROM \"User\" WHERE \"globalRole\"='SUPER_ADMIN'")
if [[ $owner_exists == 0 ]]; then
  "${compose[@]}" --profile maintenance run --rm --no-deps seed
elif [[ $owner_exists != 1 ]]; then
  echo 'Could not verify protected owner account; stopping.'; exit 1
fi
# Keep the initial password only in the root-readable handoff file, not subsequent container envs.
"$node_bin" --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const file = '/home/snmg/config/app.env';
writeFileSync(file, readFileSync(file, 'utf8').replace(/^OWNER_INITIAL_PASSWORD=.*$/m, 'OWNER_INITIAL_PASSWORD='));
NODE
curl -fsS http://127.0.0.1:3000/healthz >/dev/null

sed -e "s/VM_PRIVATE_IP/$VM_IP/g" -e "s/CADDY_PRIVATE_IP/$CADDY_IP/g" /home/snmg/dns-manager/deploy/ingress.Caddyfile.template > /home/snmg/config/ingress.Caddyfile
chmod 0644 /home/snmg/config/ingress.Caddyfile
install -m 0644 /home/snmg/dns-manager/deploy/ingress-compose.yml /home/snmg/config/ingress-compose.yml
sed "s/VM_PRIVATE_IP/$VM_IP/g" /home/snmg/dns-manager/deploy/Caddyfile.example > /home/snmg/config/Caddyfile.external
gateway=(docker compose --project-name dns-manager-ingress -f /home/snmg/config/ingress-compose.yml)
"${gateway[@]}" pull
"${gateway[@]}" run --rm --no-deps ingress caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${gateway[@]}" up -d --force-recreate
systemctl daemon-reload
systemctl enable dns-manager-webhook
systemctl restart dns-manager-webhook
sleep 2
systemctl is-active --quiet dns-manager-webhook

echo
echo 'VM installation complete. External proxy / Portal / GitHub registration still require setup:'
echo '1. Merge /home/snmg/config/Caddyfile.external into your EXISTING external Caddy config; validate/reload there.'
echo "   Permit Caddy $CADDY_IP -> VM $VM_IP TCP 8080; the gateway rejects other source IPs."
echo '2. Once https://dnsmgr.ce.ncu.edu.tw/login works, run:'
echo '   sudo /home/snmg/deploy/register-webhook.sh'
echo '3. Owner: verified NCU identity details.identifier=115502532, independent of stored role; Portal users sign up automatically as USER. Assign admins manually.'
echo '   Password login is temporarily enabled; set AUTH_PASSWORD_LOGIN_ENABLED=false after testing.'
echo '4. Set Portal/PowerDNS credentials in /home/snmg/config/app.env; then run:'
echo '   sudo /home/snmg/deploy/update-now.sh'
echo 'Portal callback: https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/logto'
echo 'Deployment log: sudo tail -f /home/snmg/state/webhook/service.log'
echo 'A main push triggers fetch/build -> compose down (no -v) -> compose up -> healthcheck.'
