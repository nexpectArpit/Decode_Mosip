#!/usr/bin/env bash
set -e

# ==============================================================================
# MOSIP Decode 2026 — Problem Statement #2: Inji Stack Automated Setup Script
# Reproducible upstream setup for clean evaluator machines.
# Clones (if needed), patches configuration gaps, generates TLS certs with SAN,
# and starts the full Inji Stack (Certify, Mimoto, Web, Verify, Postgres, Nginx).
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${INJI_CERTIFY_DIR:-$HOME/mosip-repos/inji-certify}"

echo "================================================================="
echo "  Inji Stack Automated Reproducible Setup"
echo "  Target Directory: $TARGET_DIR"
echo "================================================================="

# 1. Ensure git & docker exist
command -v git >/dev/null 2>&1 || { echo "[-] git is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[-] docker is required but not installed."; exit 1; }

# 2. Clone upstream Inji Certify if not present
if [ ! -d "$TARGET_DIR" ]; then
    echo "[*] Cloning official upstream mosip/inji-certify repository..."
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone --branch v0.14.0 https://github.com/mosip/inji-certify.git "$TARGET_DIR"
else
    echo "[+] Found upstream inji-certify repository at $TARGET_DIR"
fi

COMPOSE_DIR="$TARGET_DIR/docker-compose/docker-compose-injistack"
if [ ! -d "$COMPOSE_DIR" ]; then
    echo "[-] Directory $COMPOSE_DIR not found. Please verify the repository structure."
    exit 1
fi

cd "$COMPOSE_DIR"

# 3. Generate TLS certificate for certify-nginx with Subject Alternative Names (SAN)
# W3C did:web specification requires HTTPS on port 443 with verified hostnames.
if [ ! -f "certify-nginx.crt" ] || [ ! -f "certify-nginx.key" ]; then
    echo "[*] Generating TLS certificate with SAN for certify-nginx..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout certify-nginx.key \
      -out certify-nginx.crt \
      -subj "/CN=certify-nginx" \
      -addext "subjectAltName=DNS:certify-nginx,DNS:localhost"
    echo "[+] Generated certify-nginx.crt and certify-nginx.key"
fi

# 4. Patch certify-default.properties:
# - Add credentialOfferCache to spring.cache.cache-names (fixes missing cache error in OID4VCI)
# - Set internal JWKS endpoint for authentic pre-authorized token validation
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
echo "[+] Applied certify-default.properties patches (Spring Cache + JWKS URI)"

# 5. Patch certify-csvdp-farmer.properties:
# - Use PreAuthDataProviderPlugin for standalone end-to-end credential issuance
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
echo "[+] Applied certify-csvdp-farmer.properties patches (PreAuthDataProviderPlugin + did:web:certify-nginx)"

# 6. Start full Docker Compose stack
echo "[*] Starting Inji Stack via Docker Compose..."
docker compose up -d

echo "[*] Waiting for Inji services to become healthy..."
MAX_RETRIES=30
RETRY=0
until curl -s http://localhost:8090/v1/certify/.well-known/openid-credential-issuer >/dev/null || [ $RETRY -eq $MAX_RETRIES ]; do
    echo -n "."
    sleep 2
    RETRY=$((RETRY + 1))
done

echo ""
if [ $RETRY -eq $MAX_RETRIES ]; then
    echo "[-] Inji Certify failed to initialize in time. Inspect logs: docker compose logs certify"
    exit 1
fi

echo "[+] Inji Stack is healthy and active:"
echo "    • Inji Certify (OpenID4VCI): http://localhost:8090/v1/certify"
echo "    • Certify Nginx (DID Web):    http://localhost:8091 / https://localhost:8443"
echo "    • Inji Verify (OpenID4VP):   http://localhost:8095/v1/verify"
echo "    • Mimoto BFF:                http://localhost:8099/v1/mimoto"
echo "    • Inji Web:                  http://localhost:3004"
echo "================================================================="
