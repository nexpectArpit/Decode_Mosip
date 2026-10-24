# Inji Interop Lab for Verifiable Credentials
### MOSIP Decode 2026 — Problem Statement #2 (Complexity Level: High)

[![Standards: OpenID4VCI](https://img.shields.io/badge/OpenID4VCI-Draft_13-0ea5e9.svg)](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
[![Standards: OpenID4VP](https://img.shields.io/badge/OpenID4VP-Draft_21--23-6366f1.svg)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
[![Formats: W3C VC & SD-JWT](https://img.shields.io/badge/Formats-W3C_VC_|_SD--JWT_|_mDoc-10b981.svg)](https://www.w3.org/TR/vc-data-model/)

> A visual test lab for tracing credential issuance, wallet presentation, and verification across MOSIP Inji components and reference implementations.

The primary route uses Inji Certify, an existing Inji wallet, and Inji Verify. A second end-to-end format path uses the local mock OID4VCI issuer, reference wallet, and mock OID4VP verifier for SD-JWT. The ISO mDoc option demonstrates local reference cryptography. The lab also includes a live protocol inspector, sequence diagram, audit matrix, and report export.

Start the lab locally with Docker Compose; no public deployment is needed. See [Quickstart](#quickstart-guide), [the interoperability report](docs/INTEROP_TEST_RESULTS.md), [selector support and test boundaries](docs/SELECTOR_COMBINATION_AUDIT.md), and [upstream interoperability findings](docs/upstream-issue-drafts.md).

The sequence diagram follows recorded protocol events. Local cryptographic operations are labeled separately from network traffic. The verifier SDK uses a local browser proxy while phone-facing request and response URLs use the configured public HTTPS origin.

For a physical Inji Mobile check, use a phone-reachable HTTPS origin for **protocol traffic only** and configure Compose with its hostname. Start the optional allowlisted edge with `docker compose --profile phone up -d mobile-edge`; it listens only on `127.0.0.1:18765`. Its configuration in `infra/mobile-edge.conf` permits the DID, issuer metadata, offer/token/credential, signed VP request, and VP `direct_post` routes. It returns 404 for the frontend, `/api`, history, exports, and issuer offer creation. The local browser stays at `http://localhost:5173`. Route the chosen HTTPS origin to this edge only after choosing a transport appropriate for the credential data being tested. For example, when that origin is `https://playground.example.com`, set these values in an ignored `.env` file next to `docker-compose.yml`:

```dotenv
CERTIFY_PUBLIC_DID=did:web:playground.example.com
CERTIFY_PUBLIC_ORIGIN=https://playground.example.com
VERIFY_PUBLIC_ORIGIN=https://playground.example.com
VERIFY_PUBLIC_URL=https://playground.example.com/v1/verify
VERIFY_PUBLIC_DID=did:web:playground.example.com:v1:verify
```

Then run `docker compose up -d --build` and `docker compose --profile phone up -d mobile-edge`, keeping the browser at `http://localhost:5173`. The issuer DID resolves through the edge's `/.well-known/did.json`; the verifier DID resolves through `/v1/verify/did.json`. The Certify offer, issuer metadata, signed verifier request, and wallet response use the same public origin. Click **Create Inji Mobile offer QR** and scan it in the existing app using **+ → Scan & Download**; the offer expires after 10 minutes. For verification, use the **bottom-bar Share → Scan** scanner on the official Verify SDK QR, select the downloaded card, and consent. The app shows a phone configuration warning until the public URLs and DIDs are set. A QR display or the phone's “Shared successfully” message does not mean Inji Verify accepted the VP; check the actual web result and run history.

The source-only Certify image build is in [`infra/certify-holder-did/Dockerfile`](infra/certify-holder-did/Dockerfile). Run `npm run test:mobile-proof-issuance` from `backend/` to exercise mobile-style proof issuance and valid/tampered credential checks without a phone.

The local Certify profile advertises its OAuth server for the pre-authorized FarmerCredential offer. The playground checks the advertised authorization server, token endpoint, credential issuer, and DID before creating a mobile QR.

The Certify gateway captures sanitized offer, token, and credential request/response steps by flow ID for the inspector and sequence view. Physical mobile test evidence is in [`docs/PHYSICAL_MOBILE_TEST_RESULTS.md`](docs/PHYSICAL_MOBILE_TEST_RESULTS.md).

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
9. [Interoperability findings](#interoperability-findings)

---

## Current Project Architecture

```text
                                INJI INTEROPERABILITY PLAYGROUND
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │                                Visual Web Client (:5173)                                │
    │                           React 18 + TypeScript + Tailwind v4                           │
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
    │                    TypeScript • Express • Node 20 Native Fetch                          │
    │                                                                                         │
    │  ┌──────────────────────────┐ ┌──────────────────────────┐ ┌─────────────────────────┐  │
    │  │   Protocol Interceptor   │ │   Tamper Mutator Engine  │ │  Matrix Testing Engine  │  │
    │  │  Logs, Timings, Packets  │ │ Signatures, Dates, Salts │ │ 11 Matrix Scenarios     │  │
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
   - **Framework**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion.
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
- **Issuer Column**: Toggle between **Inji Certify** (`:8090`) and the playground's **Local Mock OID4VCI Issuer**.
- **Wallet Column**: Toggle between **Inji Web (Mimoto)**, **Local Reference Wallet** (signed OpenID4VP over `direct_post`), **Playground Browser Vault** (direct VC check), and the existing **Inji Mobile** app (cross-device QR path). The Inji Web option reads held-credential metadata from Mimoto, opens a signed Verify request in the packaged wallet, and polls the resulting Verify transaction.
- **Verifier Column**: Toggle between **Inji Verify** (`:8095`) and **External Mock OpenID4VP Verifier**.

### 2. Multi-Format Credential Support
- **W3C VC JSON-LD**: Live Certify credentials use `Ed25519Signature2020` and are verified by Inji Verify. The separate local reference proof uses RFC 8785 JCS and Ed25519; it is not the JSON-LD signature suite.
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
- **Node.js 20+** & **npm** only for local development outside Docker

### Starting the Playground

1. **Start the complete local stack** from `playground/`:
   ```bash
   docker compose up -d --build
   ```
   This starts Postgres (`:5433`), Certify (`:8090`), its Nginx DID endpoint (`:8091`), Mimoto (`:8099`), DataShare (`:8097`), SeaweedFS S3 object storage (`:9000`), Inji Web (`:3004`), Verify (`:8095`), the playground API (`:4000`), and UI (`:5173`). Java services can take about a minute to become ready. Check `http://localhost:4000/api/health` before issuing. SeaweedFS replaces an old MinIO image whose bundled binary crashes under ARM emulation; its S3 endpoint is configured for DataShare but a full DataShare upload has not yet been verified.

2. **Open the playground** at `http://localhost:5173`.

The packaged Inji Web is at `http://localhost:3004`. Use `localhost` for both apps (`http://localhost:5173` for the Playground) so the browser shares the Mimoto session cookie with the wallet-status proxy. Sign in to Inji Web and finish wallet setup. For OTP login, first reload the [MOSIP Collab public OTP mailbox](https://smtp.collab.mosip.net/), then click **Get OTP** (or **Resend OTP**) in eSignet and check the mailbox again. Enter the newly generated code on eSignet; reloading the mailbox alone does not generate an OTP. The old static `111111` code is retired for these identities. If eSignet presents a biometric-only step or no OTP option, the mailbox will remain empty for that transaction.

In the Playground choose **Inji Web Wallet (Mimoto)** and click **Refresh Mimoto Vault** to inspect a session if one exists. The UI can open its Agriculture credential screen and a signed Verify request, but the bundled Certify profile currently validates its own pre-authorized tokens, while Mimoto's optional interactive issuer configuration points to eSignet. No complete Inji Web credential download or presentation has been accepted in this profile, so this route must not be counted as a passing wallet flow.

For source development outside Docker, start the upstream stack with `./setup-inji-stack.sh`, then run these in separate terminals:
   ```bash
   (cd backend && npm ci && npm run build && npm start)
   (cd frontend && npm ci && npm run dev)
   ```

---

## Manual Testing Guide

### A. Visual UI Testing Walkthrough

1. **Open the Web Sandbox**:
   Navigate to `http://localhost:5173` in your web browser.

2. **Select Implementation Stack**:
   - **Issuer**: Select `Inji Certify` or `External Mock (OpenID4VCI)`.
   - **Wallet**: Select `Inji Mobile (existing app)` to see the cross-device instructions. For issuance, use **Create Inji Mobile offer QR** in the Issuer column, then scan with the app's **+ → Scan & Download** flow. For presentation, open the Official Inji Verify SDK in the Verifier column and use the app's **bottom-bar Share → Scan** flow. `Local Reference Wallet (OpenID4VP)` remains the locally testable signed presentation path.
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
   - A dynamic result banner will appear indicating **PASS** or **FAIL** with the actual direct VC or signed VP mode.
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

#### 4. Issue and verify with the local mock pair

The explicit mock pair works without MOSIP containers. This exercises local credential signing and verification; it does not exercise OpenID4VCI token exchange or OpenID4VP wallet presentation.

```bash
curl -sS http://localhost:4000/api/issuer/issue \
  -H 'Content-Type: application/json' \
  -d '{"implementation":"MOCK_EXTERNAL_OID4VCI","format":"ldp_vc","subjectData":{"fullName":"Jane Doe"},"uin":"9876543210"}' \
  > /tmp/inji-issued.json

python3 - <<'PYCODE'
import json
with open('/tmp/inji-issued.json') as stream:
    issued = json.load(stream)
with open('/tmp/inji-verify-request.json', 'w') as stream:
    json.dump({'vc': issued['credential'], 'verifierImplementation': 'MOCK_EXTERNAL_OID4VP', 'tamperScenario': 'NONE'}, stream)
PYCODE

curl -sS http://localhost:4000/api/verifier/verify-vc \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/inji-verify-request.json
```

For an upstream check, set `implementation` to `INJI_CERTIFY` with `format: ldp_vc` and submit the resulting credential to `INJI_VERIFY`. The API returns an error if the upstream service is unavailable or the format is not wired.

#### 5. Run the API matrix and export its history

```bash
curl -sS -X POST http://localhost:4000/api/interop/matrix/run
curl -sS http://localhost:4000/api/interop/matrix/history
curl -sS -o inji-matrix-history.md 'http://localhost:4000/api/interop/matrix/export?format=md'
```

History is saved in `backend/data/matrix-runs.json`. Set `MATRIX_HISTORY_PATH` to choose another location. The matrix distinguishes direct API checks from paths that exercise the local reference wallet's OpenID4VCI/OpenID4VP transport. It does not establish Inji Web or physical mobile compatibility; those have separate reports.

The 20 executable standards checks run at `GET /api/interop/report`. Each invocation is persisted at `backend/data/audit-runs.json` (or `AUDIT_HISTORY_PATH`). Query recent scores with `GET /api/interop/report/history?limit=10&after=YYYY-MM-DD` and download JSON or Markdown from `/api/interop/report/export?format=json` or `?format=md`. The audit separates live upstream API assertions, local reference cryptography, and wallet presentation; its score is not a formal standards certification.

## Automated API Matrix Runner

With the Compose stack running, `cd backend && npm run test:matrix` runs the 11-scenario matrix and writes an updated report to `../docs/INTEROP_TEST_RESULTS.md`. The report identifies direct API checks separately from the local reference-wallet OpenID4VCI/OpenID4VP path. Results depend on the live upstream services. A failed issuance or unavailable verifier is recorded as `ERROR`, never as a passing negative test.

---

## API Reference Endpoint Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Upstream service probe; database status is unknown unless measured. |
| `GET` | `/api/issuer/well-known` | OpenID4VCI discovery document from Certify or Mock. |
| `GET` | `/api/issuer/did` | Returns W3C DID document (`did:web:certify-nginx` or Mock). |
| `POST` | `/api/issuer/issue` | Issues `ldp_vc` via live Certify or three formats via the explicit local mock. |
| `GET` | `/api/wallet/issuers` | Configured issuer list from Mimoto. |
| `POST` | `/api/wallet/present-vp` | Local reference wallet signs and submits a W3C VP to Inji Verify using `direct_post`; accepts `attack: MISMATCHED_NONCE` for a negative probe. |
| `POST` | `/api/verifier/verify-vc` | Submits a VC for direct verification with an optional supported mutation; this is not a VP flow. |
| `POST` | `/api/verifier/vp-request` | Proxies a VP authorization request to Inji Verify. |
| `GET` | `/api/inspector/logs` | Fetches real-time protocol traces with filter support. |
| `DELETE` | `/api/inspector/logs` | Clears inspector in-memory log buffer. |
| `GET` | `/api/interop/report` | Executes 20 scoped assertions and saves the audit snapshot. |
| `GET` | `/api/interop/report/history` | Returns past audit scores, optionally filtered by `after`, `before`, and `limit`. |
| `GET` | `/api/interop/report/export?format=md` | Downloads the audit history as Markdown or JSON. |
| `POST` | `/api/interop/matrix/run` | Executes 11 live API and local reference-wallet scenarios and persists results with execution mode. |
| `GET` | `/api/interop/matrix/history` | Returns saved scenario results. |
| `GET` | `/api/interop/matrix/export?format=md` | Downloads history as Markdown or JSON. |

---

## Interoperability findings

The report of observed upstream behavior, reproducible evidence, and suggested fixes is in [`docs/upstream-issue-drafts.md`](docs/upstream-issue-drafts.md). Test coverage and supported selector paths are in the linked audit reports above.

---
*Created for MOSIP Decode 2026 — Problem Statement #2.*
