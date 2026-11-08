#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

ROOT=/opt/bookkeeper
release_id=${1:?Missing release ID}
[[ "$release_id" =~ ^[0-9]+-[0-9]+-[a-f0-9]{40}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
archive="$ROOT/incoming/$release_id.tar.gz"
release="$ROOT/releases/$release_id"
previous=$(readlink -f "$ROOT/current" || true)
switched=false

health_check() {
  local expected=$1
  for attempt in {1..15}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:3001/api/health |
      /opt/node24/bin/node -e '
        let text = "";
        process.stdin.on("data", data => text += data);
        process.stdin.on("end", () => {
          try { const result = JSON.parse(text); process.exit(result.ok && result.release === process.argv[1] ? 0 : 1); }
          catch { process.exit(1); }
        });' "$expected"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  local code=$?
  trap - ERR
  if $switched; then
    echo 'New release failed; rolling back application code.' >&2
    if [[ -n "$previous" && -d "$previous" && -f "$previous/RELEASE" ]]; then
      ln -sfn "$previous" "$ROOT/current.next"
      mv -Tf "$ROOT/current.next" "$ROOT/current"
      sudo -n /usr/bin/systemctl restart bookkeeper.service
      if health_check "$(cat "$previous/RELEASE")"; then
        echo 'Previous release restored.' >&2
      else
        echo 'Rollback health check failed. Inspect journalctl -u bookkeeper.' >&2
      fi
    else
      sudo -n /usr/bin/systemctl stop bookkeeper.service
      rm -f "$ROOT/current"
      echo 'First deployment failed; service stopped.' >&2
    fi
  fi
  exit "$code"
}
trap rollback ERR

[[ -f "$archive" && ! -e "$release" ]]
mkdir "$release"
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$release"
[[ "$(cat "$release/RELEASE")" == "$release_id" ]]
[[ -f "$release/frontend/dist/index.html" && -f "$release/backend/src/server.js" ]]
[[ -d "$release/node_modules/express" ]]

ln -sfn "$release" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"
switched=true
sudo -n /usr/bin/systemctl restart bookkeeper.service
health_check "$release_id"
# Confirm authentication is active before reporting a successful deployment.
for path in /api/auth/me /api/categories /api/exports/csv; do
  [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
    -H 'X-Forwarded-Proto: https' "http://127.0.0.1:3001$path")" == 401 ]]
done
echo "Deployed $release_id successfully."
trap - ERR

# Keep the latest three releases plus the active and previous releases. Never touch /var/lib/bookkeeper.
count=0
while IFS= read -r name; do
  [[ "$name" =~ ^[0-9]+-[0-9]+-[a-f0-9]{40}$ ]] || continue
  count=$((count + 1))
  candidate="$ROOT/releases/$name"
  if ((count > 3)) && [[ "$candidate" != "$release" && "$candidate" != "$previous" ]]; then
    rm -rf -- "$candidate"
  fi
done < <(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -Vr)
rm -f "$archive" "$ROOT/incoming/$release_id.sh"
