#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${INJI_CERTIFY_DIR:-$HOME/mosip-repos/inji-certify}"

echo "[*] Target Directory: $TARGET_DIR"

command -v git >/dev/null 2>&1 || { echo "[-] git is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[-] docker is required but not installed."; exit 1; }

if [ ! -d "$TARGET_DIR" ]; then
    echo "[*] Cloning upstream mosip/inji-certify..."
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone --branch v0.14.0 https://github.com/mosip/inji-certify.git "$TARGET_DIR"
else
    echo "[+] Found upstream inji-certify repository at $TARGET_DIR"
fi

COMPOSE_DIR="$TARGET_DIR/docker-compose/docker-compose-injistack"
if [ ! -d "$COMPOSE_DIR" ]; then
    echo "[-] Directory $COMPOSE_DIR not found."
    exit 1
fi

cd "$COMPOSE_DIR"

if [ ! -f "certify-nginx.crt" ] || [ ! -f "certify-nginx.key" ]; then
    echo "[*] Generating TLS certificate with SAN for certify-nginx..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout certify-nginx.key \
      -out certify-nginx.crt \
      -subj "/CN=certify-nginx" \
      -addext "subjectAltName=DNS:certify-nginx,DNS:localhost"
fi

python3 -c "
path = 'config/certify-default.properties'
with open(path, 'r') as f:
    c = f.read()

if 'credentialOfferCache' not in c:
    c = c.replace(
        'mosip.certify.cache.names=userinfo,vcissuance,certificatedatacache,credentialConfig,renderTemplate,jwks,preAuthCodeCache,asMetadataCache',
        'mosip.certify.cache.names=userinfo,vcissuance,certificatedatacache,credentialConfig,renderTemplate,jwks,preAuthCodeCache,asMetadataCache,credentialOfferCache'
    )
    c = c.replace(
        \"'jwks': \${mosip.certify.jwks-cache-expire-seconds}}\",
        \"'jwks': \${mosip.certify.jwks-cache-expire-seconds}, 'credentialOfferCache': \${mosip.certify.common.cache-expire-seconds}}\"
    )

c = c.replace(
    'mosip.certify.authn.jwk-set-uri=https://esignet-mock.collab.mosip.net/v1/esignet/oauth/.well-known/jwks.json',
    'mosip.certify.authn.jwk-set-uri=http://certify:8090/v1/certify/.well-known/jwks.json'
)

with open(path, 'w') as f:
    f.write(c)
"

python3 -c "
path = 'config/certify-csvdp-farmer.properties'
with open(path, 'r') as f:
    c = f.read()

c = c.replace(
    'mosip.certify.integration.data-provider-plugin=MockCSVDataProviderPlugin',
    'mosip.certify.integration.data-provider-plugin=PreAuthDataProviderPlugin'
)
c = c.replace(
    'mosip.certify.data-provider-plugin.did-url=did:web:8398-2405-201-1029-3025-e142-9ad3-e1f2-f543.ngrok-free.app',
    'mosip.certify.data-provider-plugin.did-url=did:web:certify-nginx'
)

with open(path, 'w') as f:
    f.write(c)
"

echo "[*] Starting Inji Stack via Docker Compose..."
docker compose up -d

echo "[*] Waiting for Inji services to become healthy..."
MAX_RETRIES=30
RETRY=0
until curl -s http://localhost:8090/v1/certify/.well-known/openid-credential-issuer >/dev/null || [ $RETRY -eq $MAX_RETRIES ]; do
    sleep 2
    RETRY=$((RETRY + 1))
done

if [ $RETRY -eq $MAX_RETRIES ]; then
    echo "[-] Inji Certify failed to initialize in time."
    exit 1
fi

echo "[+] Inji Stack is healthy and active."
