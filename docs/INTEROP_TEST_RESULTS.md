# MOSIP Decode 2026: Verifiable Credentials Interoperability Matrix Report

**Execution Timestamp:** 2026-10-24T12:19:12.685Z
**Matrix Result:** **11 / 11 scenarios passed**
**Execution Latency:** 13564ms

---

**Coverage:** local reference-wallet OpenID4VP and mock SD-JWT OpenID4VCI/OpenID4VP paths; Inji Web/mobile transport is not exercised. An error before verification never counts as a passing rejection.

**Local DID resolver repair:** The playground serves a compatibility-normalized DID document for the local Certify host, replacing Certify's bare-DID assertionMethod entry with its controlled verification-method references. The raw upstream defect remains recorded in docs/upstream-issue-drafts.md.

## 1. Executable Standards Probes

**Result:** 20/20 passed. Scopes: 9 upstream API, 10 local reference, 1 passing wallet presentation. These probes are not formal standards certification.

| Specification | Version | Probe scopes | Requirements Verified | Pass Rate |
| :--- | :--- | :--- | :---: | :---: |
| **OpenID for Verifiable Credential Issuance** | Draft 13 | UPSTREAM_API | 4/4 | **100%** |
| **OpenID for Verifiable Presentations** | Draft 21-23 | UPSTREAM_API, WALLET_PRESENTATION | 4/4 | **100%** |
| **W3C Verifiable Credentials Data Model** | 1.1 / 2.0 | UPSTREAM_API, LOCAL_REFERENCE | 4/4 | **100%** |
| **IETF Selective Disclosure for JWTs** | RFC Draft | LOCAL_REFERENCE | 4/4 | **100%** |
| **ISO/IEC 18013-5 Mobile Driving License** | 2021 Edition | LOCAL_REFERENCE | 4/4 | **100%** |




---

## 2. Issuer and Verifier API Matrix Results

| # | Issuer | Wallet | Verifier | Format | Execution Mode | Tamper / Attack Vector | Expected | Actual | Outcome | Latency | Error Detail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `INJI_CERTIFY` | `MOCK_EXTERNAL_WALLET` | `INJI_VERIFY` | `ldp_vc` | `LOCAL_REFERENCE_WALLET_OID4VP` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 3008ms |  |
| 2 | `INJI_CERTIFY` | `NOT_EXERCISED` | `INJI_VERIFY` | `ldp_vc` | `DIRECT_API` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 2897ms |  |
| 3 | `MOCK_EXTERNAL_OID4VCI` | `NOT_EXERCISED` | `INJI_VERIFY` | `vc+sd-jwt` | `DIRECT_API` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 27ms |  |
| 4 | `MOCK_EXTERNAL_OID4VCI` | `MOCK_EXTERNAL_WALLET` | `MOCK_EXTERNAL_OID4VP` | `vc+sd-jwt` | `LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 12ms |  |
| 5 | `INJI_CERTIFY` | `NOT_EXERCISED` | `MOCK_EXTERNAL_OID4VP` | `ldp_vc` | `DIRECT_API` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 943ms |  |
| 6 | `MOCK_EXTERNAL_OID4VCI` | `NOT_EXERCISED` | `MOCK_EXTERNAL_OID4VP` | `mso_mdoc` | `LOCAL_REFERENCE_CRYPTO` | `NONE` | `SUCCESS` | **SUCCESS** | ✅ PASS | 14ms |  |
| 7 | `INJI_CERTIFY` | `NOT_EXERCISED` | `INJI_VERIFY` | `ldp_vc` | `DIRECT_API` | `INVALID_SIGNATURE` | `REJECT` | **REJECT** | ✅ PASS | 1450ms | Inji Verify returned INVALID; individual proof checks were not exposed by this response |
| 8 | `INJI_CERTIFY` | `NOT_EXERCISED` | `INJI_VERIFY` | `ldp_vc` | `DIRECT_API` | `EXPIRED_CREDENTIAL` | `REJECT` | **REJECT** | ✅ PASS | 2035ms | Inji Verify returned INVALID; individual proof checks were not exposed by this response |
| 9 | `MOCK_EXTERNAL_OID4VCI` | `MOCK_EXTERNAL_WALLET` | `MOCK_EXTERNAL_OID4VP` | `vc+sd-jwt` | `LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP` | `CORRUPTED_DISCLOSURE` | `REJECT` | **REJECT** | ✅ PASS | 16ms | Disclosure tamper detected: digest wDbipD6R92murZtKpupiofbeGe44wGurlarTAlcQqo4 is not in the signed _sd list. |
| 10 | `INJI_CERTIFY` | `NOT_EXERCISED` | `INJI_VERIFY` | `ldp_vc` | `DIRECT_API` | `ALTERED_CLAIMS` | `REJECT` | **REJECT** | ✅ PASS | 2075ms | Inji Verify returned INVALID; individual proof checks were not exposed by this response |
| 11 | `INJI_CERTIFY` | `MOCK_EXTERNAL_WALLET` | `INJI_VERIFY` | `ldp_vc` | `LOCAL_REFERENCE_WALLET_OID4VP` | `MISMATCHED_NONCE` | `REJECT` | **REJECT** | ✅ PASS | 1071ms | Gateway rejected holder proof challenge mismatch before upstream submission |


---

## 3. Interpretation

Only rows marked PASS met their expected outcome. ERROR means a service or flow failed before the expected verifier outcome could be observed. `DIRECT_API` rows do not exercise their wallet labels. `LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP` executes the browser-reference wallet protocol path; it does not establish Inji Web or mobile interoperability.
