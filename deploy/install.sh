#!/bin/sh
# Installs Spanrail with Docker Compose from the published images.
#   curl -fsSL https://raw.githubusercontent.com/Veeky-kumar/SpanRail/main/deploy/install.sh | sh
# It creates ./spanrail, writes a .env with freshly generated secrets (never overwriting an existing
# one), and starts the stack. Read it first if you like: it is short, and it only touches ./spanrail.
set -eu

REF="${SPANRAIL_REF:-main}"
BASE="https://raw.githubusercontent.com/Veeky-kumar/SpanRail/$REF/deploy"
DIR="${SPANRAIL_DIR:-spanrail}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Spanrail needs $1, which was not found." >&2; exit 1; }; }
need docker
docker compose version >/dev/null 2>&1 || { echo "Spanrail needs Docker Compose v2 ('docker compose')." >&2; exit 1; }

secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

mkdir -p "$DIR"
cd "$DIR"

if [ ! -f docker-compose.yml ]; then
  need curl
  curl -fsSL "$BASE/docker-compose.yml" -o docker-compose.yml
fi

if [ -f .env ]; then
  echo "Keeping the existing .env."
else
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(secret)"
    echo "API_KEY_SALT=$(secret)"
    echo "AUTH_SECRET=$(secret)"
  } > .env
  echo "Wrote .env with new secrets. Keep it: losing API_KEY_SALT invalidates every API key."
fi

docker compose pull || echo "Could not pull images; using any already on this machine."
docker compose up -d

PORT="${WEB_PORT:-$(sed -n 's/^WEB_PORT=//p' .env | head -1)}"
URL="http://localhost:${PORT:-3000}"
printf "Waiting for Spanrail"
i=0
until curl -fs -o /dev/null "$URL/login" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && { echo; echo "Not up after 3 minutes. See: docker compose logs" >&2; exit 1; }
  printf "."; sleep 2
done
echo
echo "Spanrail is running at $URL"
echo "Create an account there, then a project and an API key, and send your first trace."
