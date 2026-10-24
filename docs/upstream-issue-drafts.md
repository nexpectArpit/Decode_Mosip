# Upstream issue drafts (not filed)

These are drafts for maintainers. The nonce behavior below was reproduced against local Compose on 20 and 24 October 2026. For Inji Verify, source inspection is against the official `v0.17.0` tag at commit `3b6f90fd535f9dbeeea7817e02ecf13a8a373e4d`; confirm whether the packaged image was built from this exact revision before assigning a release milestone.

**Draft status (24 October 2026):** The direct-upstream nonce issue remains reproducible and the project gateway mitigation remains required. The physical `#0#0` report below is historical and superseded as a current acceptance failure: a later physical Mobile transaction (`19e1e15f-2bd4-444c-8f71-afbf6141ad4c`) returned official Verify `SUCCESS` and independent proof `PASS`. Keep the old trace as regression history; re-test the exact older profile before filing it as a currently reproducible issue.

## Draft for `mosip/inji-verify`

**Title:** Inji Verify 0.17.0 accepts a signed VP with a proof challenge different from the VP request nonce

**Environment:** `injistack/inji-verify-service:0.17.0`, local Docker Compose, `POST /v1/verify/vp-request`, `GET /v1/verify/vp-request/{requestId}`, `POST /v1/verify/vp-submission/direct-post`, `GET /v1/verify/vp-result/{transactionId}`.

**Steps to reproduce**

1. Create a VP request with `acceptVPWithoutHolderProof: false`, a client ID, and a W3C `ldp_vc` input descriptor. Fetch its signed request JWT and record the `nonce`, `client_id`, `response_uri`, and `state`.
2. Use an otherwise valid Certify FarmerCredential. Sign a W3C VP with an `Ed25519Signature2020` holder proof. Set `proof.domain` to the request client ID and `proof.challenge` to the literal `intentionally-wrong-nonce` instead of the request nonce.
3. Submit that VP by `direct_post` with `vp_token`, `presentation_submission`, and `state`; fetch the transaction result.

**Observed:** On the local 0.17.0 image, the request nonce and submitted challenge `intentionally-wrong-nonce` differed. A direct submission to Verify returned a successful VP result and a successful VC result (transaction `txn_889bccc5-b90f-4ae1-bcde-5fdb72867840`, reproduced again on 24 October). The valid-signature/wrong-nonce presentation was accepted. A separate negative test changes a byte of the holder proof and is rejected, so this is specifically a nonce-binding gap.

A separate negative test changes a byte of the VP holder proof and is rejected, so the observed gap is specific to nonce binding rather than blanket acceptance of every holder proof.

**Expected:** Reject the VP submission with `NONCE_VALIDATION_FAILED` or return a failed VP result. A valid holder signature should not override a nonce mismatch.

**Source evidence (`mosip/inji-verify` v0.17.0, commit `3b6f90fd535f9dbeeea7817e02ecf13a8a373e4d`):** In `verify-service/src/main/java/io/inji/verify/services/impl/VerifiablePresentationSubmissionServiceImpl.java`, `processSubmission` (lines 77–96) loads the authorization request and calls `verifyAndGetCredentialStatus(...)` without comparing the request nonce to the holder proof challenge. The V2 path (lines 148–171) likewise has no comparison. `isAcceptVPWithoutHolderProof` (around lines 242–244) controls missing proof acceptance, while `isVerifiablePresentationSigned` (around lines 272–275) checks only for a `proof` property. This matches the observed acceptance and explains why setting `acceptVPWithoutHolderProof: false` does not enforce nonce equality.

**Evidence boundary and mitigation:** Direct submissions to the upstream Verify service are accepted in the reproduced nonce-mismatch case. The playground's request gateway binds `state` to the nonce from the signed request and rejects a mismatched holder challenge with HTTP 400 before forwarding. The live project-path probe passes; its evidence also retains the direct-upstream control result showing acceptance. This is a deployment mitigation, not a repair to Inji Verify. The generated 20/20 standards result is scoped to the protected project path and must not be described as upstream-only conformance.

**Reproducer:** Run the playground stack and call `GET /api/interop/report`. Its `OID4VP-RESP-04` evidence runs a valid presentation and tampered-signature test through the project gateway, verifies the gateway rejects a mismatched nonce, and separately records the direct-upstream control. Evidence stores only result statuses and rejection booleans, not credential bodies or nonce values.

## Draft for `mosip/inji-verify` and Inji Mobile maintainers

**Status:** Historical failed profile; latest physical acceptance passed. Do not file this draft as a current blocker without reproducing it against the current issuer and verifier profile. See [`PHYSICAL_MOBILE_TEST_RESULTS.md`](PHYSICAL_MOBILE_TEST_RESULTS.md) for the timeline and latest transaction.

**Title:** A physical Inji Mobile W3C presentation is rejected: `did:jwk` proof method has `#0#0` and Inji Verify throws during proof verification

**Environment:** User reports Inji Mobile 1.0.0-alpha.1 (“v30”) on a physical Android device; the playground's public HTTPS verifier DID/request/response endpoints; official `injistack/inji-verify-service` images 0.17.0, 0.18.2, and 1.0.0-alpha.1. The exact APK build metadata has not been independently inspected.

**Steps to reproduce**

1. Download the local Inji Certify FarmerCredential in Inji Mobile with **+ → Scan & Download**. The app reports the card downloaded successfully.
2. Create an official Verify SDK OpenID4VP 1.0 QR with a DCQL `ldp_vc` query, `require_cryptographic_holder_binding: true`, and no type filter. The user’s Farmer card reaches card selection/consent.
3. In the app use bottom-bar **Share → Scan**, select the card, trust the verifier, consent, and complete the selfie step. The app reports “Shared successfully.”
4. Fetch the VP result for the transaction and inspect Verify's proof-verification log. The public request and response URI use the same HTTPS origin and the gateway recorded the `direct_post` with a matching nonce.

**Observed:** The earlier physical attempts reached Inji Verify 0.17.0 and 0.18.2 and returned `vpResultStatus: FAILED`, with no VC results. A fresh attempt against the compatibility-matched 1.0.0-alpha.1/DCQL service (transaction `2c2752f7-4cf9-4adc-9e6e-3c01043edd97`, request `req_236f14de-4ddb-4b95-8c40-1f110110765f`) also returned `FAILED`, with no VC results. The direct-post returned HTTP 200; the alpha Verify log then reported `Illegal character in fragment … did:jwk:…#0#0` while verifying the VP proof. A metadata-only inspection found proof type `JsonWebSignature2020`, JWS `alg: ES256`, a `did:jwk` verification method, and two `#` characters in that method; credential claims and public key material were not needed. The app's “Shared successfully” screen indicates submission, not verifier acceptance.

The running 0.17.0 image packages `BOOT-INF/lib/vcverifier-jar-1.7.0.jar` in `/home/inji/verify-service.jar`. Its [matching source](https://github.com/mosip/vc-verifier/blob/v1.7.0/vc-verifier/kotlin/vcverifier/src/main/java/io/mosip/vercred/vcverifier/PresentationVerifier.kt) supports only EdDSA for `JsonWebSignature2020`, so the observed ES256 proof cannot pass that image even after the malformed URL is fixed. The locally cached 0.18.2 image packages `vcverifier-jar-1.8.1.jar`; its [matching source](https://github.com/mosip/vc-verifier/blob/v1.8.1/vc-verifier/kotlin/vcverifier/src/main/java/io/mosip/vercred/vcverifier/PresentationVerifier.kt) supports ES256 but resolves the malformed method before signature verification. Public Inji Mobile source HEAD `144c82dd7d1783cb99382749dea6d8f647a9c8bc` constructs a holder `did:jwk:…#0` in `machines/openID4VP/openID4VPServices.ts`; the OpenID4VP Kotlin builder passes the holder string to `proof.verificationMethod` without appending another fragment. The physical app version is unknown, so the available source does not yet locate the extra `#0` in the installed build.

**Expected:** The submitted proof should use a valid single-fragment verification method URI whose key can be resolved and verified. Inji Verify should return a specific invalid-proof result for malformed references instead of an opaque failed transaction. Confirm where the second `#0` is appended before assigning that fix to one repository; separately, a verifier release that advertises ES256 VP proofs needs to verify the signature with the correct algorithm. Any compatibility resolution must preserve the original signed proof and still verify it cryptographically.

**Evidence boundary:** This draft does not claim that the credential was valid or that Verify should accept a VP with a malformed proof. We did not alter the signed VP or bypass signature checking. The public tunnel hostname was temporary, and the app version was not recorded. Sanitized transaction details and the test sequence are in `docs/PHYSICAL_MOBILE_TEST_RESULTS.md`.

## Draft for `mosip/inji-certify`

**Title:** FarmerCredential seed binds issuer DID to an ephemeral ngrok hostname

**Environment:** Inji Certify 0.14.0 Compose seed, `docker-compose/docker-compose-injistack/db_scripts/certify/certify_init.sql`.

**Steps to reproduce**

1. Initialize the published Certify database seed for FarmerCredential without replacing its issuer DID URL.
2. Issue a FarmerCredential and resolve the DID referenced by its issuer or proof verification method from an independent verifier.

**Observed in the supplied seed:** The FarmerCredential configuration contains `did:web:8398-2401-4900-1c39-2d14-386d-1bf9-9c17-109d.ngrok-free.app`. That transient host is unrelated to the local issuer service; DID resolution can fail after the tunnel expires. The playground's local seed repair changes the DID to `did:web:certify-nginx`, and live issue plus Verify succeeds.

**Expected:** Example Compose deployment should publish an issuer DID at a stable, configurable hostname, or make the seed explicitly require an environment-specific DID value before issuance.

**Suggested fix:** Move the DID host into deployment configuration and seed it at initialization; update the linked `verificationMethod` and ensure its DID document is served over HTTPS in a publicly deployed profile. A regression test should issue a FarmerCredential from the stock Compose profile and resolve/verify its DID without a transient third-party tunnel.

**Evidence boundary:** This draft describes a reproducible configuration defect in the supplied seed, not a claim that every Certify deployment uses that host. The local fix and test are documented in `infra/repair-certify-claims.sql` and the playground audit.

## Additional draft for `mosip/inji-certify`

**Title:** Generated DID document does not authorize its credential signing key for `assertionMethod`

**Environment:** `injistack/inji-certify-with-plugins:0.14.0`, FarmerCredential DID document at `/.well-known/did.json` through the local Nginx proxy.

**Observed:** The DID document has a `verificationMethod[0].id` such as `did:web:certify-nginx#4YMpkUJ-wQ2Il7WEMn-_IUBV87PITBRg4mwMRRg3-6c`, while `assertionMethod` contains only `did:web:certify-nginx`. A live Certify credential refers to the key ID in its proof. Independent `jsonld-signatures` verification with `Ed25519Signature2020` and `AssertionProofPurpose` fails: `Verification method ... not authorized by controller for proof purpose "assertionMethod".` The local source checkout's `DIDDocumentUtil.java` line 63 calls `didDocument.put("assertionMethod", Collections.singletonList(didUrl))`, matching the observed document. Inji Verify's direct VC endpoint still reported success, so this difference affects strict cross-implementation verification.

**Expected:** `assertionMethod` should contain the exact verification method ID (or an embedded method) used to sign the VC. A regression test should resolve the DID document and verify a live credential with an independent JSON-LD proof verifier that checks proof-purpose authorization.

**Suggested fix:** Replace the root DID entry with `issuerPublicKeyURI` in the generated assertion relationship, and include a strict proof-purpose verification test. Confirm compatibility with existing DIDs and any other signing key types before release.

**Playground workaround:** The local Compose resolver now adapts this exact observed shape by replacing the bare root DID with the IDs of verification methods controlled by that DID. It returns an error if the document no longer matches the known defect. Strict independent W3C verification passes through the adapter; the upstream issue remains applicable to raw Certify deployments and is not claimed fixed upstream.

## Reliability observation for `mosip/inji-certify`

In a repeat matrix run, three FarmerCredential issuance requests returned HTTP 400 `ERROR_SIGNING_QR_DATA` / `Error occurred during canonicalization`. The Certify log identified `JsonLDException: There was a problem encountered loading a remote context [https://www.w3.org/2018/credentials/v1]`. A later issuance succeeded without configuration change. The playground now retries that specific transient error up to twice, logging each retry; it never substitutes a local credential. A stronger upstream fix would bundle or cache the standard JSON-LD context and test issuance during a network outage. This is one observed intermittent incident, not a measured failure rate.
