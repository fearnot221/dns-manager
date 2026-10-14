# DNS Manager backup and recovery

`backup.mjs` creates a private daily bundle, verifies SHA-256 hashes, and restores
the PostgreSQL custom-format dump into a disposable PostgreSQL 17 container.
The drill has no host ports, host mounts or production network; its data volume
is deleted afterwards. It never restores into production.

## Coverage

Each successful bundle contains:

- A consistent `pg_dump -Fc` snapshot of the application database, including
  users, audit history, encrypted settings and durable DNS publication intents.
- Container environment settings (including secrets), release tags and image IDs.
- Read-only PowerDNS API exports for zones, metadata and DNSSEC cryptographic keys
  (individual [key detail requests](https://doc.powerdns.com/authoritative/http-api/cryptokey.html)
  include private material that the list endpoint omits).
- Checksums and the successful isolated restore report with restored row counts.
- Root installation additionally archives `/home/snmg/config` and
  `/home/snmg/deploy`, including webhook configuration and persistent keys.

Bundles contain credentials and private DNSSEC material. Directories are 0700,
files are 0600. Do not attach them to tickets, commits or chat. Local retention
is 14 days, limited to this tool's complete verified bundles; existing backup
directories are not pruned.

The PowerDNS API export is a recovery aid, **not a complete PowerDNS backend or
VM backup**. Database and PowerDNS snapshots are not an atomic cross-system
snapshot. A full disaster recovery plan also needs the authoritative server's
backend/configuration backup, VM/platform backup, off-host copies and a safe copy
of the encryption/backup keys. These require the corresponding operator's
destination and access; this installer cannot infer them.

## Install

From the reviewed checkout, on the VM:

```bash
sudo bash /home/snmg/dns-manager/deploy/install-backup.sh
```

This creates a root-owned daily systemd timer at 02:15 Asia/Taipei (up to five
minutes jitter), immediately runs a backup and restore drill, then enables the
timer. Backups live in `/home/snmg/backups/dns-manager-v1`. The installer accepts
the existing Node runtime at `/home/snmg/node/bin/node`.

When administrator access is unavailable, `bash deploy/install-backup.sh --user`
provides interim daily coverage under the current Docker-enabled user. It saves
under `~/dns-manager-backups` and adds only a managed block to that user's crontab
(18:15 UTC / 02:15 Taipei on the current UTC VM). Protected host files are excluded
and `hostConfigurationIncluded` is false. After root coverage is verified,
remove only the `BEGIN DNS MANAGER BACKUP` through `END DNS MANAGER BACKUP` block
using `crontab -e`; keep other jobs and keep prior bundles until their retention
requirements are satisfied.

Optional encrypted off-host upload uses an **already initialized** restic
repository configured in root-only `/home/snmg/config/backup.env` with
`RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE` and any provider-specific credentials.
Keep the repository password in a separate safe location. The tool will not
initialize or prune a remote repository. A missing destination leaves
`offsiteUploaded: false`; a failed configured upload does not advance the success
checkpoint. Off-host backup must be tested before declaring disaster recovery ready.

## Verify and operate

Check `last-successful.json` daily: its timestamp must be under 26 hours old,
`restoreVerified` must be true, and host/offsite coverage must match expectations.
The script advances this checkpoint only after the dump, exports, hashes,
isolated restore and any configured upload succeed. Monitor failures and stale
checkpoints through your existing monitoring system. Local cron/systemd status
alone does not establish off-host monitoring.

```bash
sudo systemctl status dns-manager-backup.timer dns-manager-backup.service
sudo journalctl -u dns-manager-backup.service --since yesterday
sudo cat /home/snmg/backups/dns-manager-v1/last-successful.json
sudo /home/snmg/node/bin/node /home/snmg/deploy/backup.mjs --verify /home/snmg/backups/dns-manager-v1/REPLACE_WITH_BUNDLE_NAME
```

The `--verify` command checks integrity before restoring into its isolated
container and reports restored row counts. Re-run after copying a bundle off-host.

## Production recovery runbook

1. Pause DNS Manager writes, deployments and outside PowerDNS changes. Choose
   compatible application/PowerDNS snapshots and verify their timestamps, release
   tags and checksums. Preserve the failed system and any newer data.
2. Run `--verify` first. For a real incident, restore the dump into a **new**
   PostgreSQL database/volume using `pg_restore --no-owner --no-privileges
   --exit-on-error`. Compare users, requests, settings, audit history and outstanding
   publication intents. Re-provision the least-privilege runtime role with the
   existing deployment procedure; keep the migration role separate.
3. Restore protected configuration and keys to a separate staging location, check
   ownership/modes, and select an application release compatible with the restored
   schema. Do not overwrite live configuration or change persistent keys blindly.
4. Have the PowerDNS operator restore its backend/configuration/DNSSEC keys.
   Compare live RRsets with pending publication intents before enabling writes.
   API snapshots may assist controlled reconstruction; never bulk replay them
   automatically against a live server.
5. Validate login, permissions, DNS reads, application state and mail queue in the
   restored environment. Agree on cutover/data reconciliation before changing the
   production database, DNS server or proxy target. Resume traffic only after
   the operator accepts those results.

Production restoration overwrites authoritative data and needs explicit target
and cutover authorization. These scripts perform backup and isolated drills only.
