# Inji Interoperability Playground for Verifiable Credentials
### MOSIP Decode 2026 — Problem Statement #2 (Complexity Level: High)

[![Standards: OpenID4VCI](https://img.shields.io/badge/OpenID4VCI-Draft_13-0ea5e9.svg)](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
[![Standards: OpenID4VP](https://img.shields.io/badge/OpenID4VP-Draft_21--23-6366f1.svg)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
[![Formats: W3C VC & SD-JWT](https://img.shields.io/badge/Formats-W3C_VC_|_SD--JWT_|_mDoc-10b981.svg)](https://www.w3.org/TR/vc-data-model/)
[![Interop Matrix](https://img.shields.io/badge/Matrix_Pass_Rate-10_/_10_Passed-14b8a6.svg)](../docs/INTEROP_TEST_RESULTS.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate.svg)](LICENSE)

> A unified, visual sandbox and protocol verification suite purpose-built for the **MOSIP Inji Ecosystem**. Issue, hold, present, and verify Verifiable Credentials across **Inji Certify**, **Inji Wallet** (Mobile & Web), and **Inji Verify**, and cross-test them against external **OpenID4VCI / OpenID4VP** compliant implementations to prove real-world interoperability and defensive resilience.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Key Innovations & Features](#key-innovations--features)
3. [Multi-Format Credential Matrix](#multi-format-credential-matrix)
4. [Replay & Tamper Attack Simulator (Negative Testing)](#replay--tamper-attack-simulator)
5. [Live Protocol Inspector & Sequence Visualization](#live-protocol-inspector)
6. [Quickstart Guide](#quickstart-guide)
7. [Automated CI Interoperability Test Suite](#automated-ci-interoperability-test-suite)
8. [API Documentation](#api-documentation)
9. [Discovered Interoperability Gaps & MOSIP Bugs](#discovered-interoperability-gaps)
10. [Submission Deliverables Checklist](#submission-deliverables-checklist)

---

## Architecture Overview

```text
                                INJI INTEROPERABILITY PLAYGROUND
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                                  Vite + React 19 UI                                     │
    │  ┌─────────────────────────┬─────────────────────────┬───────────────────────────────┐  │
    │  │ 1. ISSUER MODULE        │ 2. WALLET / VAULT       │ 3. VERIFIER MODULE            │  │
    │  │ • Inji Certify (Docker) │ • Inji Web (Browser)    │ • Inji Verify (Docker)        │  │
    │  │ • External Mock OID4VCI │ • Inji Mobile (QR Flow) │ • External Mock OID4VP        │  │
    │  │ • W3C / SD-JWT / mDoc   │ • Mock External Wallet  │ • Replay & Tamper Engine      │  │
    │  └───────────┬─────────────┴────────────┬────────────┴───────────────┬───────────────┘  │
    │              │                          │                            │                  │
    │              └──────────────────────────┼────────────────────────────┘                  │
    │                                         ▼                                               │
    │                         LIVE PROTOCOL INSPECTOR & TIMELINE                              │
    │                    HTTP Payloads • Timing • Headers • Sequence Flow                     │
    └─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                              PLAYGROUND BACKEND (:4000)                                 │
    │     Orchestrator • Protocol Interceptor • Tamper Mutator • Matrix Conformance Engine    │
    └──────────────────┬──────────────────────┬──────────────────────┬────────────────────────┘
                       │                      │                      │
                       ▼                      ▼                      ▼
             ┌────────────────────┐ ┌───────────────────┐ ┌────────────────────┐
             │    INJI CERTIFY    │ │   MIMOTO / WEB    │ │    INJI VERIFY     │
             │ :8090 / Nginx :8091│ │   :8099 / :3004   │ │       :8095        │
             │ OpenID4VCI / DID   │ │  Wallet BFF Vault │ │ OpenID4VP / Crypto │
             └────────────────────┘ └───────────────────┘ └────────────────────┘
```

---

## Key Innovations & Features

### 1. 3-Column Swappable Implementation Matrix
Allows engineers and auditors to toggle implementations independently:
- **Issuer Role**: Switch between real **Inji Certify** (`:8090`) and an **External Mock OpenID4VCI Issuer** (Sphereon/Walt.id standard).
- **Wallet Role**: Switch between **Inji Web** (browser vault), **Inji Mobile** (cross-device QR code + deep-link), and a **Mock External Wallet**.
- **Verifier Role**: Switch between real **Inji Verify** (`:8095`) and an **External Mock OpenID4VP Verifier**.

### 2. Multi-Format Credential Support
- **W3C VC 1.1 / 2.0 (JSON-LD)**: Uses `Ed25519Signature2020` cryptographic suite with RFC 8785 JSON Canonicalization Scheme (JCS) and raw 32-byte Ed25519 key verification.
- **IETF SD-JWT VC**: Implements authentic selective disclosure digests (`_sd`) with 128-bit cryptographic salts, SHA-256 hash digests, and JWS signature verification.
- **ISO/IEC 18013-5 mDoc/mDL**: Mobile Driving License schema with canonical CBOR encoding, MobileSecurityObject (MSO) ValueDigests, and COSE_Sign1 signature verification.

### 3. Replay & Tamper Attack Simulator (Negative Testing)
Demonstrates defensive posture and security edge-case handling by injecting deliberate corruption into raw credential bytes **before** submission to the verifier (verifiers evaluate presentations blindly without simulated flags):
- `INVALID_SIGNATURE`: Mutates signature bytes in `proofValue` / `jws` to verify cryptographic key mismatch rejection.
- `EXPIRED_CREDENTIAL`: Adjusts expiration timestamp into the past to verify temporal validation defense.
- `ALTERED_CLAIMS`: Modifies credential attributes (e.g. forging land area or identity name) without private key access, triggering digest hash mismatches.
- `CORRUPTED_DISCLOSURE`: Modifies selective disclosure values, causing SHA-256 mismatch against the signed `_sd` array.
- `MISMATCHED_NONCE`: Simulates replay attacks by providing mismatched verification challenges.

### 4. Live Protocol Inspector & Animated Sequence Flow
- Captures real-time HTTP requests and responses across all hops.
- Displays HTTP method, status codes, microsecond timing, and headers.
- Visualizes interactive OpenID4VCI & OpenID4VP protocol sequences.

---

## Quickstart Guide

### Prerequisites
- **macOS / Linux**
- **Docker & Docker Compose** (running)
- **Node.js 18+** & **npm**

### Option A: Clean Machine Automated Launch (Recommended)
Run the automated setup script from the `playground/` directory. It will clone the upstream `inji-certify` repository (tag `v0.14.0`), apply the required Spring Boot and TLS patches, generate SSL certificates with SAN, and boot the entire Docker Compose stack:
```bash
./setup-inji-stack.sh
```

Once the upstream containers are healthy, launch the playground:
```bash
./start.sh
```

### Option B: Manual Step-by-Step Launch

#### 1. Setup Upstream Inji Stack
If you have an existing clone of `inji-certify`:
```bash
# Target directory can be any path, e.g. ~/mosip-repos/inji-certify or ./inji-certify
./setup-inji-stack.sh --dir ./inji-certify
```
Verify all 6 upstream containers are running:
- `certify` (`:8090` / `v1/certify`) — OpenID4VCI draft 13 Issuer
- `certify-nginx` (`:8091` HTTP, `:8443` HTTPS) — Reverse proxy & `did:web` host
- `verify-service` (`:8095`) — Inji Verify VC Verification engine
- `mimoto-service` (`:8099`) — Inji Wallet BFF
- `inji-web` (`:3004`) — Inji Web Wallet frontend
- `database` (`:5433`) — Postgres DB for Certify & Mimoto

#### 2. Start Playground Backend
```bash
cd backend
npm install
npm run build
npm start
```
*Playground Backend runs on `http://localhost:4000`.*

#### 3. Start Playground UI
```bash
cd frontend
npm install
npm run dev -- --host --port 5173
```
*Playground UI is live at `http://localhost:5173`.*

---

## Automated CI Interoperability Test Suite

Run the headless command-line matrix test runner to execute all happy-path and tamper test combinations:
```bash
cd backend
npm run test:matrix
```

### Live CLI Output Sample:
```text
===============================================================
  MOSIP Decode 2026 — Interoperability Playground Test Runner   
  Problem Statement #2: Automated Matrix & Negative-Path Tests  
===============================================================

[*] Connecting to Playground Backend at http://localhost:4000...
[+] System Health: Certify [UP], Mimoto [UP], Verify [UP], DB [UP]

---------------------------------------------------------------------------------------------------------
| # | ISSUER        | WALLET          | VERIFIER        | FORMAT    | TAMPER SCENARIO    | EXPECT | RESULT |
---------------------------------------------------------------------------------------------------------
| 1 | CERTIFY       | WEB             | VERIFY          | ldp_vc    | NONE               | SUCCESS | PASS [OK] |
| 2 | CERTIFY       | MOBILE          | VERIFY          | ldp_vc    | NONE               | SUCCESS | PASS [OK] |
| 3 | EXT_OID4VCI   | WEB             | VERIFY          | vc+sd-jwt | NONE               | SUCCESS | PASS [OK] |
| 4 | EXT_OID4VCI   | EXT_WALLET      | EXT_OID4VP      | vc+sd-jwt | NONE               | SUCCESS | PASS [OK] |
| 5 | CERTIFY       | WEB             | EXT_OID4VP      | ldp_vc    | NONE               | SUCCESS | PASS [OK] |
| 6 | EXT_OID4VCI   | WEB             | VERIFY          | mso_mdoc  | NONE               | SUCCESS | PASS [OK] |
| 7 | CERTIFY       | WEB             | VERIFY          | ldp_vc    | INVALID_SIGNATURE  | REJECT | PASS [OK] |
| 8 | CERTIFY       | WEB             | VERIFY          | ldp_vc    | EXPIRED_CREDENTIAL | REJECT | PASS [OK] |
| 9 | EXT_OID4VCI   | WEB             | VERIFY          | vc+sd-jwt | ALTERED_CLAIMS     | REJECT | PASS [OK] |
| 10| CERTIFY       | MOBILE          | EXT_OID4VP      | ldp_vc    | MISMATCHED_NONCE   | REJECT | PASS [OK] |
---------------------------------------------------------------------------------------------------------

>> Total Scenarios Tested: 10
>> Passed: 10 / 10
>> Compliance Score: 100%
```
*Full test report is generated at [`docs/INTEROP_TEST_RESULTS.md`](docs/INTEROP_TEST_RESULTS.md).*

---

## API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Live health probe of Inji Certify, Mimoto, Verify, and Postgres. |
| `GET` | `/api/issuer/well-known` | Returns OpenID4VCI discovery document from Certify or Mock Issuer. |
| `GET` | `/api/issuer/did` | Returns W3C DID Document (`did:web:certify-nginx` or Mock). |
| `POST` | `/api/issuer/issue` | Issues credential in chosen format (`ldp_vc`, `vc+sd-jwt`, `mso_mdoc`). |
| `GET` | `/api/wallet/issuers` | Returns Mimoto configured issuer list. |
| `POST` | `/api/verifier/verify-vc` | Submits credential presentation with optional tamper attack parameter. |
| `POST` | `/api/verifier/vp-request` | Generates OpenID4VP authorization request with QR URI. |
| `GET` | `/api/inspector/logs` | Fetches real-time protocol traces with filter support. |
| `DELETE` | `/api/inspector/logs` | Clears inspector in-memory log buffer. |
| `GET` | `/api/interop/report` | Evaluates standards conformance score and evidence. |
| `POST` | `/api/interop/matrix/run` | Executes full 10-scenario matrix suite and records results. |

---

## Discovered Interoperability Gaps & Upstream Inji Bugs

During development and end-to-end integration against upstream `inji-certify` v0.14.0 and `inji-verify-service` v0.17.0, our team identified and resolved **5 critical bugs and configuration gaps** in the baseline upstream repositories (automated by `setup-inji-stack.sh`):

1. **Spring Cache Configuration Gap (`credentialOfferCache`)**:
   - *Bug*: In `certify-default.properties`, `mosip.certify.cache.names` omitted `credentialOfferCache`. Creating pre-authorized offers crashed with `Cannot find cache named 'credentialOfferCache' for Builder[...]`.
   - *Fix*: Added `credentialOfferCache` to `mosip.certify.cache.names`.
2. **OAuth Access Token JWKS Mismatch (Collab Cloud vs Local Docker)**:
   - *Bug*: In `certify-default.properties`, `mosip.certify.authn.jwk-set-uri` pointed to external `https://collab.mosip.net/.../jwks.json`. Issuing tokens locally succeeded, but `/issuance/credential` rejected them with HTTP 401 Unauthorized because the signature was verified against external cloud keys.
   - *Fix*: Configured `mosip.certify.authn.jwk-set-uri=http://certify:8090/v1/certify/.well-known/jwks.json` to resolve local keypairs.
3. **Data Provider Plugin Configuration (`PreAuthDataProviderPlugin`)**:
   - *Bug*: Default `certify-csvdp-farmer.properties` mapped to `MockCSVDataProviderPlugin`, requiring static CSV entries.
   - *Fix*: Enabled `mosip.certify.integration.data-provider-plugin=PreAuthDataProviderPlugin` to allow dynamic issuance of requested subject claims via Pre-Authorized Code flow.
4. **W3C `did:web` Inji Verify Strict HTTPS & SAN Requirement**:
   - *Bug*: Inji Verify's `DidWebPublicKeyResolver` strictly requires HTTPS on port 443 with Subject Alternative Names matching the hostname (`certify-nginx`). HTTP endpoints or non-SAN certificates are rejected with PKIX trust failures.
   - *Fix*: Generated TLS certificates with SAN (`DNS:certify-nginx,DNS:localhost`), configured Nginx on `:443`, and mounted the CA certificate into `verify-service` with `USE_SYSTEM_CA_CERTS=true`.
5. **Hardcoded Ephemeral Ngrok DID in DB**:
   - *Bug*: Base SQL seeded an ephemeral ngrok domain (`did:web:xxx.ngrok.app`).
   - *Fix*: Re-pointed issuer records in `certify_init.sql` to `did:web:certify-nginx`.

*Detailed bug analysis, root causes, and patch implementations are automated in [`setup-inji-stack.sh`](setup-inji-stack.sh) and documented in [`docs/interoperability-gaps-and-bugs.md`](docs/interoperability-gaps-and-bugs.md).*

---

## Submission Deliverables Checklist

- [x] **Working Web Application**: Live at `http://localhost:5173` with 3-column architecture, live inspector, and interop report.
- [x] **Source Code**: Fully commented TypeScript codebase in `playground/backend` and `playground/frontend`.
- [x] **Documentation**: Root `README.md`, `docs/architecture.md`, `docs/interoperability-gaps-and-bugs.md`.
- [x] **Automated Test Suite**: CLI matrix runner (`npm run test:matrix`) generating `docs/INTEROP_TEST_RESULTS.md`.
- [x] **Multi-Format Support**: W3C JSON-LD, SD-JWT VC, and ISO 18013-5 mDoc.
- [x] **Replay & Tamper Defense**: 4 distinct negative-path attack vectors tested and verified.
- [x] **One-Click Startup Script**: Root `start-playground.sh`.
