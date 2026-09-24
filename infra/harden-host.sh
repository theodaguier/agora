#!/usr/bin/env bash
# Baseline hardening of the Agora server (Debian / Ubuntu). Run as root:
#
#   sudo ./harden-host.sh                  firewall, fail2ban, automatic security updates
#   sudo ./harden-host.sh --ssh-keys-only  + SSH by key only (no passwords, root by key only)
#
# Idempotent: can be run again at any time. Nothing locks you out without the
# flag: password SSH logins are only disabled with --ssh-keys-only, and only if
# the account running sudo already has an authorized key.
#
# Caveat: Docker publishes its ports (80/443 of the web container) through its
# own iptables rules, which ufw doesn't see. Only Caddy publishes ports in
# docker-compose.yml: keep it that way (see DEPLOY.md, Security).
set -euo pipefail

KEYS_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --ssh-keys-only) KEYS_ONLY=true ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo $0)." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Debian/Ubuntu only (apt-get not found)." >&2; exit 1; }

say() { printf '\n==> %s\n' "$*"; }

say "Packages: ufw, fail2ban, unattended-upgrades"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades >/dev/null

# The SSH port actually in use (not always 22): allowed before the firewall goes up.
SSH_PORT="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }')"
SSH_PORT="${SSH_PORT:-22}"

say "Firewall (ufw): SSH ($SSH_PORT/tcp), HTTP, HTTPS, HTTP/3; everything else refused"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT/tcp" comment "SSH" >/dev/null
ufw allow 80/tcp comment "HTTP (Caddy, certificates)" >/dev/null
ufw allow 443/tcp comment "HTTPS" >/dev/null
ufw allow 443/udp comment "HTTP/3" >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed -n '1,20p'

say "fail2ban: SSH brute-force protection"
cat > /etc/fail2ban/jail.d/agora.local <<EOF
# Written by infra/harden-host.sh
[sshd]
enabled = true
port = $SSH_PORT
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban

say "Automatic security updates (unattended-upgrades)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
// Written by infra/harden-host.sh
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

SSHD_DROPIN=/etc/ssh/sshd_config.d/10-agora-hardening.conf
if $KEYS_ONLY; then
  say "SSH: key-only logins"
  ADMIN="${SUDO_USER:-root}"
  ADMIN_HOME="$(getent passwd "$ADMIN" | cut -d: -f6)"
  if ! grep -qsE '^(ssh-|ecdsa-|sk-)' "$ADMIN_HOME/.ssh/authorized_keys"; then
    echo "No SSH key in $ADMIN_HOME/.ssh/authorized_keys: password logins kept, to avoid locking you out." >&2
    echo "Add your key first (ssh-copy-id $ADMIN@<server> from your machine), then run again." >&2
    exit 1
  fi
  grep -qs '^Include /etc/ssh/sshd_config.d/' /etc/ssh/sshd_config \
    || { echo "sshd_config doesn't include sshd_config.d/: settings not applied." >&2; exit 1; }
  cat > "$SSHD_DROPIN" <<'EOF'
# Written by infra/harden-host.sh --ssh-keys-only
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
PermitEmptyPasswords no
MaxAuthTries 4
X11Forwarding no
EOF
  if ! sshd -t; then
    rm -f "$SSHD_DROPIN"
    echo "Invalid SSH configuration: change reverted." >&2
    exit 1
  fi
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "Done. Keep this session open and check a new connection works: ssh $ADMIN@<server>"
else
  say "SSH unchanged (add --ssh-keys-only to refuse passwords)"
fi

say "Done"
echo "Reminder: Docker bypasses ufw for published ports; only the web container (80/443) publishes any."
