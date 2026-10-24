FROM alpine:3.20
RUN apk add --no-cache openssl
COPY infra/init-certs.sh /usr/local/bin/init-certs.sh
RUN chmod +x /usr/local/bin/init-certs.sh
ENTRYPOINT ["/usr/local/bin/init-certs.sh"]
