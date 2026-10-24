# Inji Certify v0.14.0 copies a proof JWT's did:jwk key reference (#0)
# into credentialSubject.id. Inji Mobile 1.0.0-alpha.1 appends #0 when it
# presents that credential, producing an invalid #0#0 verification method.
# Replace only Certify's DIDjwkProofManager class. The proof JWT is still
# checked against its original key reference; the signed VC gets the base DID.
FROM injistack/inji-certify-with-plugins:0.14.0 AS upstream

FROM eclipse-temurin:21-jdk AS patch-builder
WORKDIR /work
COPY --from=upstream /home/inji/certify-service.jar /work/base.jar
COPY infra/certify-holder-did/DIDjwkProofManager.java /work/DIDjwkProofManager.java
RUN mkdir unpack && cd unpack && jar xf /work/base.jar
RUN javac -cp 'unpack/BOOT-INF/classes:unpack/BOOT-INF/lib/*' \
    -d unpack/BOOT-INF/classes /work/DIDjwkProofManager.java
# Repackage the Spring Boot archive without the optional shell launcher.
# Its nested JARs must remain STORED for Boot's nested-archive loader.
RUN cd unpack && jar c0Mf /work/certify-service.jar .

FROM upstream
COPY --from=patch-builder /work/certify-service.jar /home/inji/certify-service.jar
