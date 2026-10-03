# Inji Interop Lab for Verifiable Credentials
### MOSIP Decode 2026 — Problem Statement #2 (Complexity Level: High)

[![Standards: OpenID4VCI](https://img.shields.io/badge/OpenID4VCI-Draft_13-0ea5e9.svg)](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
[![Standards: OpenID4VP](https://img.shields.io/badge/OpenID4VP-Draft_21--23-6366f1.svg)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
[![Formats: W3C VC & SD-JWT](https://img.shields.io/badge/Formats-W3C_VC_|_SD--JWT_|_mDoc-10b981.svg)](https://www.w3.org/TR/vc-data-model/)
[![Interop Matrix](https://img.shields.io/badge/Matrix_Pass_Rate-10_/_10_Passed-14b8a6.svg)](docs/INTEROP_TEST_RESULTS.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate.svg)](LICENSE)

> A unified, visual sandbox and protocol verification suite purpose-built for the **MOSIP Inji Ecosystem**. Issue, hold, present, and verify Verifiable Credentials across **Inji Certify**, **Inji Wallet** (Mobile & Web), and **Inji Verify**, and cross-test them against external **OpenID4VCI / OpenID4VP** compliant implementations to prove real-world interoperability and defensive resilience.

---

## Table of Contents
1. [Current Project Architecture](#current-project-architecture)
2. [Key Innovations & Features](#key-innovations--features)
3. [Multi-Format Credential Support](#multi-format-credential-support)
4. [Replay & Tamper Attack Simulator (Negative Testing)](#replay--tamper-attack-simulator)
5. [Quickstart Guide](#quickstart-guide)
6. [Manual Testing Guide](#manual-testing-guide)
   - [A. Visual UI Testing Walkthrough](#a-visual-ui-testing-walkthrough)
   - [B. Terminal cURL Testing Commands](#b-terminal-curl-testing-commands)
7. [Automated CI Interoperability Test Suite](#automated-ci-interoperability-test-suite)
8. [API Reference Endpoint Table](#api-reference-endpoint-table)
9. [Discovered Interoperability Gaps & MOSIP Fixes](#discovered-interoperability-gaps--mosip-fixes)

---

## Current Project Architecture

```text
                                INJI INTEROPERABILITY PLAYGROUND
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                                Visual Web Client (:5173)                                │
    │                           React 19 + TypeScript + Tailwind v4                           │
    │  ┌─────────────────────────┬─────────────────────────┬───────────────────────────────┐  │
    │  │ 1. ISSUER COLUMN        │ 2. WALLET COLUMN        │ 3. VERIFIER COLUMN            │  │
    │  │ • Inji Certify (Docker) │ • Inji Web (Browser)    │ • Inji Verify (Docker)        │  │
    │  │ • External Mock OID4VCI │ • Inji Mobile (QR Flow) │ • External Mock OID4VP        │  │
    │  │ • W3C / SD-JWT / mDoc   │ • Mock External Wallet  │ • Replay & Tamper Engine      │  │
    │  └───────────┬─────────────┴────────────┬────────────┴───────────────┬───────────────┘  │
    │              │                          │                            │                  │
    │              └──────────────────────────┼────────────────────────────┘                  │
    │                                         ▼                                               │
    │                         LIVE PROTOCOL INSPECTOR & TIMELINE                              │
    │                    HTTP Payloads • Timing • Headers • Sequence Flow                     │
    │                         DYNAMIC PASS / FAIL INTEROP RESULT                              │
    └─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │
                                              ▼ (REST API / CORS)
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                         PLAYGROUND BACKEND API SERVER (:4000)                           │
    │             TypeScript • Express • Node 20 Native Fetch (Zero Warnings)                 │
    │                                                                                         │
    │  ┌──────────────────────────┐ ┌──────────────────────────┐ ┌─────────────────────────┐  │
    │  │   Protocol Interceptor   │ │   Tamper Mutator Engine  │ │  Matrix Testing Engine  │  │
    │  │  Logs, Timings, Packets  │ │ Signatures, Dates, Salts │ │ 10 Conformance Scenarios│  │
    │  └───────────┬──────────────┘ └───────────┬──────────────┘ └───────────┬─────────────┘  │
    └──────────────┼────────────────────────────┼────────────────────────────┼────────────────┘
                   │                            │                            │
                   ▼                            ▼                            ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                              UPSTREAM MOSIP DOCKER STACK                                │
    │                                                                                         │
    │  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────────┐  │
    │  │     INJI CERTIFY      │   │    MIMOTO / INJI WEB  │   │        INJI VERIFY        │  │
    │  │  :8090 / Nginx :8091   │   │     :8099 / :3004     │   │           :8095           │  │
    │  │ OpenID4VCI / did:web  │   │   Wallet BFF & Vault  │   │    OpenID4VP / Crypto     │  │
    │  └───────────────────────┘   └───────────────────────┘   └───────────────────────────┘  │
    │                                          │                                              │
    │                                          ▼                                              │
    │                             ┌─────────────────────────┐                                 │
    │                             │  POSTGRES DATABASE      │                                 │
    │                             │         :5433           │                                 │
    │                             └─────────────────────────┘                                 │
    └─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown
1. **Frontend (`playground/frontend`)**:
   - **Framework**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion.
   - **Role**: Renders an interactive 3-column architecture (Issuer, Wallet, Verifier), dynamically configures attack parameters, triggers interop audits, displays standard sequence flows, and updates real-time HTTP inspection logs.

2. **Backend API Server (`playground/backend`)**:
   - **Framework**: Node.js 20 + TypeScript + Express (utilizing native Node `fetch` with zero deprecation flags).
   - **Role**: Acts as standard proxy & interceptor. Routes protocol requests between web clients and upstream Docker services or mock implementations, mutates payloads for negative testing, and runs headless interop matrix assertions.

3. **Upstream MOSIP Docker Stack**:
   - **Inji Certify (`:8090` / Nginx `:8091`)**: Issues credentials over OpenID4VCI (Draft 13) and hosts `did:web` public keys over HTTPS.
   - **Inji Mimoto (`:8099`)**: Wallet BFF managing credential storage and authentication endpoints.
   - **Inji Verify (`:8095`)**: OpenID4VP (Draft 21-23) validation engine enforcing cryptographic signatures, schema integrity, and expiration checks.
   - **PostgreSQL (`:5433`)**: Persistence layer for Certify offers and Mimoto sessions.

---

## Key Innovations & Features

### 1. 3-Column Swappable Implementation Matrix
Allows test engineers to select independent implementations for each participant role:
- **Issuer Column**: Toggle between **Inji Certify** (`:8090`) and **External Mock OpenID4VCI Issuer** (Sphereon / Walt.id standard).
- **Wallet Column**: Toggle between **Inji Web** (browser vault), **Inji Mobile** (cross-device QR code + deep-link), and **Mock External Wallet**.
- **Verifier Column**: Toggle between **Inji Verify** (`:8095`) and **External Mock OpenID4VP Verifier**.

### 2. Multi-Format Credential Support
- **W3C VC 1.1 / 2.0 (JSON-LD)**: Uses `Ed25519Signature2020` cryptographic suite with RFC 8785 JSON Canonicalization Scheme (JCS) and raw 32-byte Ed25519 key verification.
- **IETF SD-JWT VC**: Implements selective disclosure digests (`_sd`) with 128-bit cryptographic salts, SHA-256 hash digests, and JWS signature verification.
- **ISO/IEC 18013-5 mDoc/mDL**: Mobile Driving License schema with canonical CBOR encoding, MobileSecurityObject (MSO) ValueDigests, and COSE_Sign1 signature verification.

### 3. Replay & Tamper Attack Simulator (Negative Testing)
Demonstrates defensive posture and security edge-case handling by injecting deliberate corruption into raw credential bytes **before** submission to the verifier:
- `INVALID_SIGNATURE`: Mutates signature bytes in `proofValue` / `jws` to verify cryptographic key mismatch rejection.
- `EXPIRED_CREDENTIAL`: Adjusts expiration timestamp into the past to verify temporal validation defense.
- `ALTERED_CLAIMS`: Modifies credential attributes (e.g. forging identity name) without private key access, triggering digest hash mismatches.
- `CORRUPTED_DISCLOSURE`: Modifies selective disclosure values, causing SHA-256 mismatch against the signed `_sd` array.
- `MISMATCHED_NONCE`: Simulates replay attacks by providing mismatched verification challenges.

---

## Quickstart Guide

### Prerequisites
- **macOS / Linux**
- **Docker & Docker Compose** (running)
- **Node.js 20+** & **npm**

### Starting the Playground

1. **Boot Upstream MOSIP Docker Stack**:
   ```bash
   ./setup-inji-stack.sh
   ```
   *Ensures Certify (`:8090`), Nginx (`:8091`), Mimoto (`:8099`), Verify (`:8095`), and Postgres (`:5433`) are healthy.*

2. **Start Backend Server**:
   ```bash
   cd backend
   npm install
   npm run build
   npm start
   ```
   *Runs cleanly on `http://localhost:4000` with native Node 20 fetch (no deprecation warnings).*

3. **Start Frontend Web UI**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   *Accessible in browser at `http://localhost:5173`.*

---

## Manual Testing Guide

### A. Visual UI Testing Walkthrough

1. **Open the Web Sandbox**:
   Navigate to `http://localhost:5173` in your web browser.

2. **Select Implementation Stack**:
   - **Issuer**: Select `Inji Certify` or `External Mock (OpenID4VCI)`.
   - **Wallet**: Select `Inji Web`, `Inji Mobile (QR)`, or `Mock External Wallet`.
   - **Verifier**: Select `Inji Verify` or `External Mock (OpenID4VP)`.

3. **Choose Credential Format**:
   - Select format from dropdown: `W3C VC (JSON-LD)`, `SD-JWT VC`, or `ISO mDoc (CBOR)`.

4. **Select Attack Vector (Optional)**:
   - For **Happy Path Verification**, keep Tamper Attack as `None (Happy Path)`.
   - For **Negative Defensive Testing**, pick an attack vector such as `Invalid Signature` or `Expired Credential`.

5. **Execute Interoperability Audit**:
   - Click the **Run Interop Audit** button.
   - Observe the step-by-step progress through Issuance -> Wallet Holding -> Verification.

6. **Inspect Results**:
   - A dynamic result banner will appear indicating **PASS** (with verification latency & timing) or **FAIL** (with explicit error reasoning).
   - Scroll down to the **Live Protocol Inspector** to expand raw HTTP requests, headers, timing breakdowns, and JSON payloads.

---

### B. Terminal cURL Testing Commands

You can test every API capability directly from your terminal using `curl`:

#### 1. System Health & Upstream Status Probe
```bash
curl -X GET http://localhost:4000/api/health
```
**Expected Response**:
```json
{
  "status": "healthy",
  "services": {
    "certify": { "status": "UP", "url": "http://localhost:8090" },
    "mimoto": { "status": "UP", "url": "http://localhost:8099" },
    "verify": { "status": "UP", "url": "http://localhost:8095" },
    "database": { "status": "UP", "port": 5433 }
  }
}
```

#### 2. Fetch OpenID4VCI Discovery Metadata
```bash
curl -X GET http://localhost:4000/api/issuer/well-known
```

#### 3. Fetch Issuer W3C DID Document
```bash
curl -X GET http://localhost:4000/api/issuer/did
```

#### 4. Issue a Verifiable Credential (W3C JSON-LD)
```bash
curl -X POST http://localhost:4000/api/issuer/issue \
  -H "Content-Type: application/json" \
  -d '{
    "issuer": "CERTIFY",
    "credentialFormat": "ldp_vc",
    "claims": {
      "fullName": "Jane Doe",
      "nationalId": "NIC-987654321",
      "dateOfBirth": "1995-08-15"
    }
  }'
```

#### 5. Execute Happy-Path Credential Verification
```bash
curl -X POST http://localhost:4000/api/verifier/verify-vc \
  -H "Content-Type: application/json" \
  -d '{
    "verifier": "VERIFY",
    "credentialFormat": "ldp_vc",
    "tamperScenario": "NONE",
    "claims": {
      "fullName": "Jane Doe",
      "nationalId": "NIC-987654321"
    }
  }'
```
**Expected Output**:
```json
{
  "success": true,
  "status": "PASS",
  "verificationTimeMs": 42,
  "details": {
    "signatureValid": true,
    "issuerTrusted": true,
    "expired": false,
    "claimsMatched": true
  }
}
```

#### 6. Execute Negative Testing (Tamper Attack Vector: Invalid Signature)
```bash
curl -X POST http://localhost:4000/api/verifier/verify-vc \
  -H "Content-Type: application/json" \
  -d '{
    "verifier": "VERIFY",
    "credentialFormat": "ldp_vc",
    "tamperScenario": "INVALID_SIGNATURE",
    "claims": {
      "fullName": "Jane Doe",
      "nationalId": "NIC-987654321"
    }
  }'
```
**Expected Output**:
```json
{
  "success": false,
  "status": "FAIL",
  "error": "CRYPTOGRAPHIC_SIGNATURE_MISMATCH",
  "details": {
    "signatureValid": false,
    "issuerTrusted": true,
    "expired": false
  }
}
```

#### 7. Execute Full Headless Interop Matrix Suite
```bash
curl -X POST http://localhost:4000/api/interop/matrix/run
```

---

## Automated CI Interoperability Test Suite

To run the automated, headless CLI matrix test runner:

```bash
cd backend
npm run test:matrix
```

### CLI Output Preview:
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

---

## API Reference Endpoint Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Upstream service & database health probe. |
| `GET` | `/api/issuer/well-known` | OpenID4VCI discovery document from Certify or Mock. |
| `GET` | `/api/issuer/did` | Returns W3C DID document (`did:web:certify-nginx` or Mock). |
| `POST` | `/api/issuer/issue` | Issues credential in chosen format (`ldp_vc`, `vc+sd-jwt`, `mso_mdoc`). |
| `GET` | `/api/wallet/issuers` | Configured issuer list from Mimoto. |
| `POST` | `/api/verifier/verify-vc` | Submits credential presentation with optional tamper attack vector. |
| `POST` | `/api/verifier/vp-request` | Generates OpenID4VP authorization request with QR URI. |
| `GET` | `/api/inspector/logs` | Fetches real-time protocol traces with filter support. |
| `DELETE` | `/api/inspector/logs` | Clears inspector in-memory log buffer. |
| `GET` | `/api/interop/report` | Evaluates standards conformance score and evidence. |
| `POST` | `/api/interop/matrix/run` | Executes full 10-scenario matrix suite and records results. |

---

## Discovered Interoperability Gaps & MOSIP Fixes

During development and end-to-end integration against upstream `inji-certify` v0.14.0 and `inji-verify-service` v0.17.0, 5 critical configuration and protocol gaps were discovered and fixed in [`setup-inji-stack.sh`](setup-inji-stack.sh):

1. **Spring Cache Configuration Gap (`credentialOfferCache`)**: Added missing `credentialOfferCache` to `mosip.certify.cache.names` in `certify-default.properties`.
2. **OAuth Access Token JWKS Mismatch**: Fixed `mosip.certify.authn.jwk-set-uri` from external `collab.mosip.net` to local `http://certify:8090/v1/certify/.well-known/jwks.json`.
3. **Data Provider Plugin Configuration**: Configured `PreAuthDataProviderPlugin` to allow dynamic issuance of requested subject claims via Pre-Authorized Code flow.
4. **W3C `did:web` Strict HTTPS & SAN Requirement**: Generated TLS certificates with Subject Alternative Names (`certify-nginx`, `localhost`) mounted into `verify-service` with `USE_SYSTEM_CA_CERTS=true`.
5. **Hardcoded Ephemeral Ngrok DID in DB**: Fixed `certify_init.sql` seed script to point issuer records to `did:web:certify-nginx`.

---
*Created for MOSIP Decode 2026 — Problem Statement #2.*
