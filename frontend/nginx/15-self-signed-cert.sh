#!/bin/sh
# Runs from /docker-entrypoint.d before nginx starts. Uses the certificate
# mounted at $TLS_CERT_DIR (fullchain.pem + privkey.pem) when present;
# otherwise generates a self-signed one for local use.
set -eu

dir="${TLS_CERT_DIR:-/etc/nginx/certs}"
cn="${TLS_SELF_SIGNED_CN:-localhost}"

if [ -s "$dir/fullchain.pem" ] && [ -s "$dir/privkey.pem" ]; then
    echo "$0: using certificate from $dir"
    exit 0
fi

san="DNS:localhost,IP:127.0.0.1"
[ "$cn" = "localhost" ] || san="DNS:$cn,$san"

echo "$0: WARNING no certificate in $dir, generating a self-signed one for $cn."
echo "$0: WARNING browsers will not trust it; mount a real certificate in production."
mkdir -p "$dir"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -subj "/CN=$cn" \
    -addext "subjectAltName=$san" \
    -keyout "$dir/privkey.pem" -out "$dir/fullchain.pem" 2>/dev/null
chmod 600 "$dir/privkey.pem"
