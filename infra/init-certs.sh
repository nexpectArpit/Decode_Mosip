#!/bin/sh
set -eu

mkdir -p /certificates
if [ ! -s /certificates/certify-nginx.crt ] || [ ! -s /certificates/certify-nginx.key ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /certificates/certify-nginx.key \
    -out /certificates/certify-nginx.crt \
    -subj '/CN=certify-nginx' \
    -addext 'subjectAltName=DNS:certify-nginx,DNS:localhost' >/dev/null 2>&1
fi

# Test-only certificate-backed SD-JWT issuer key for exercising Inji Verify's x5c path.
if [ ! -s /certificates/mock-issuer.crt ] || [ ! -s /certificates/mock-issuer.key ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /certificates/mock-issuer.key \
    -out /certificates/mock-issuer.crt \
    -subj '/CN=playground-mock-issuer' \
    -addext 'basicConstraints=critical,CA:TRUE' >/dev/null 2>&1
fi

if [ ! -s /certificates/oidckeystore.p12 ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /certificates/oidc.key \
    -out /certificates/oidc.crt \
    -subj '/CN=mimoto-service' >/dev/null 2>&1
  openssl pkcs12 -export -name oidc \
    -inkey /certificates/oidc.key -in /certificates/oidc.crt \
    -out /certificates/oidckeystore.p12 \
    -passout "pass:${OIDC_P12_PASSWORD}" >/dev/null 2>&1
  rm /certificates/oidc.key /certificates/oidc.crt
fi

chmod 600 /certificates/certify-nginx.key /certificates/mock-issuer.key /certificates/oidckeystore.p12
