# Selector combination audit

## Scope and method

The UI exposes two issuers, four wallet targets, two verifiers, and three credential formats: **48 selector combinations**. I selected every combination in the running frontend and inspected its displayed route, disabled actions, and warnings. I also inspected the route handlers and ran the live 11-scenario interoperability matrix against the running Compose stack. That matrix completed 11/11, with Certify, Mimoto, Verify, and the database reported UP.

This is an exhaustive **selector behavior** audit. It is not a claim that 48 end-to-end transactions were executed. A selector product includes invalid or semantically unrelated paths (for example, Inji Certify cannot issue the selected SD-JWT profile, and the Mimoto wallet has a separate issuance route). The tables below account for all 48 combinations and state the evidence boundary for each.

## P2 mandatory-task checklist

| Official task | Status | Evidence |
|---|---|---|
| Core Inji stack connected end-to-end: Certify, Mimoto + Inji Wallet or Inji Web, Verify | **PASS via Inji Mobile** | Live Inji Certify → Inji Mobile → Inji Verify transaction; official Verify VP and VC statuses were `SUCCESS`. The statement says Wallet **or** Web, so Mobile satisfies the wallet choice. |
| Three-column issuer → wallet → verifier selector | **PASS** | Running UI has all three role columns and implementation controls; the 48-selector product was inspected. |
| Live Certify issuance over OpenID4VCI to a selected supported wallet | **PASS via Inji Mobile** | Physical issuer offer QR was downloaded by Inji Mobile and issued credential passed the subsequent official verification. |
| Wallet presentation over OpenID4VP to Inji Verify | **PASS via Inji Mobile and reference wallet** | Phone transaction passed official Verify; live matrix also passed the signed reference-wallet VP path. |
| Raw protocol inspector | **PASS** | Inspector contains request/response trace entries and payload bodies for the live issue and presentation runs. |
| At least two credential formats end-to-end | **PASS** | W3C VC through Inji Certify/Mobile/Verify; SD-JWT VC through mock OID4VCI/reference wallet/mock OID4VP. SD-JWT is an explicit mock interoperability path, not an Inji Certify format. |
| Per-run pass/fail interop report | **PASS** | Matrix records issuer, wallet, verifier, format, proof type, expected/actual result, latency, and error detail. Latest live matrix: 11/11 expected outcomes. |

This closes the P2 **mandatory** task list based on its documented alternatives and the tested flows. It does not make every combination in the selector matrix interoperable; unsupported and mismatched combinations are expected audit findings and are identified below. Optional items such as same-device OpenID4VP and live mDoc device-response presentation are separate scope.

Legend:

- **E2E PASS** — a wallet presentation reached the selected verifier and its result was checked.
- **DIRECT PASS / REJECT** — the credential was sent directly to verification; no wallet presentation occurred.
- **SUPPORTED, NOT RUN** — the route is available in code/UI but this audit did not make a new transaction for this exact combination.
- **BLOCKED** — the UI prevents the operation or the selected issuer/wallet/format does not provide it.
- **SEPARATE MIMOTO ROUTE** — Inji Web issuance uses its own Mimoto issuer page; the Issuer selector is not the route used.

## All 48 combinations

### Inji Certify × W3C VC

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SUPPORTED, NOT RUN** — native Inji Web presentation polls official Verify; requires authenticated Mimoto vault. | **BLOCKED** — Web presentation route submits to Inji Verify only. UI now disables it for this selection. |
| Playground Browser Vault | **SUPPORTED, NOT RUN** — direct VC verification, not OpenID4VP. | **DIRECT PASS** — local mock verifier cross-check is in the live audit record. |
| Inji Mobile | **E2E PASS** — physical Inji Mobile issue/share and official Verify `SUCCESS` recorded in the audit report. | **BLOCKED** — phone QR is an Inji Verify request. |
| Local Reference Wallet (OpenID4VP) | **E2E PASS** — signed nonce-bound W3C VP in live matrix; the UI-to-Verify path is also in the audit record. | **BLOCKED** — reference wallet's OpenID4VP implementation has no W3C request path for the local mock verifier. |

### Inji Certify × SD-JWT VC

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SEPARATE MIMOTO ROUTE** — selected Certify/SD-JWT values do not issue to Mimoto; credential format depends on the separate Inji Web issuer. | **BLOCKED** — native Web presentation uses Inji Verify only. |
| Playground Browser Vault | **BLOCKED** — current Inji Certify profile issues W3C `ldp_vc` only. | **BLOCKED** — same issuance constraint. |
| Inji Mobile | **BLOCKED** — mobile offer is limited to Inji Certify W3C VC. | **BLOCKED** — mobile QR requires Inji Verify and W3C VC. |
| Local Reference Wallet (OpenID4VP) | **BLOCKED** — no SD-JWT credential can be issued by this selected Certify profile. | **BLOCKED** — same issuance constraint. |

### Inji Certify × ISO mDoc

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SEPARATE MIMOTO ROUTE** — selected Certify/mDoc values do not issue to Mimoto. | **BLOCKED** — native Web presentation uses Inji Verify only. |
| Playground Browser Vault | **BLOCKED** — current Inji Certify profile issues W3C `ldp_vc` only. | **BLOCKED** — same issuance constraint. |
| Inji Mobile | **BLOCKED** — mobile offer supports W3C VC only. | **BLOCKED** — mobile QR requires Inji Verify and W3C VC. |
| Local Reference Wallet (OpenID4VP) | **BLOCKED** — no mDoc credential can be issued by this selected Certify profile. | **BLOCKED** — same issuance constraint. |

### Local Mock OID4VCI × W3C VC

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SEPARATE MIMOTO ROUTE** — selected mock issuer does not issue into Mimoto. | **BLOCKED** — native Web presentation uses Inji Verify only. |
| Playground Browser Vault | **DIRECT REJECT** — live audit observed Inji Verify reject this mock issuer's `did:key`; the local mock verifier accepts it. | **DIRECT PASS** — direct local verification; not a wallet VP. |
| Inji Mobile | **BLOCKED** — mock issuer has no phone offer integration. | **BLOCKED** — no phone offer integration. |
| Local Reference Wallet (OpenID4VP) | **SUPPORTED, NOT RUN** — W3C VP transport is available, but the live upstream issuer-DID rejection still applies to the VC check. | **BLOCKED** — local mock verifier's OpenID4VP reference flow currently supports SD-JWT only. |

### Local Mock OID4VCI × SD-JWT VC

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SEPARATE MIMOTO ROUTE** — selected mock issuer does not issue into Mimoto. | **BLOCKED** — native Web presentation uses Inji Verify only. |
| Playground Browser Vault | **DIRECT PASS** — upstream SD-JWT VC endpoint passed in the live audit; direct check, not OpenID4VP. | **SUPPORTED, NOT RUN** — local verifier supports the format; direct verification can be run after selecting the stored credential. |
| Inji Mobile | **BLOCKED** — mock issuer has no phone offer integration. | **BLOCKED** — no phone offer integration. |
| Local Reference Wallet (OpenID4VP) | **BLOCKED** — this reference VP wallet does not expose SD-JWT to Inji Verify in the current flow. | **E2E PASS** — live matrix exercised OpenID4VCI issuance, SD-JWT disclosure/key binding, nonce, and `direct_post`; corrupted disclosure was rejected. |

### Local Mock OID4VCI × ISO mDoc

| Wallet | Inji Verify | Local Mock Crypto Verifier |
|---|---|---|
| Inji Web Wallet (Mimoto) | **SEPARATE MIMOTO ROUTE** — selected mock issuer does not issue into Mimoto. | **BLOCKED** — native Web presentation uses Inji Verify only. |
| Playground Browser Vault | **BLOCKED** — Inji Verify route does not support this mDoc payload. | **DIRECT PASS** — local CBOR/MSO/COSE checks passed; not an OpenID4VP device response. |
| Inji Mobile | **BLOCKED** — mock issuer has no phone offer integration. | **BLOCKED** — no phone offer integration. |
| Local Reference Wallet (OpenID4VP) | **BLOCKED** — mDoc DeviceResponse/OpenID4VP transport is not implemented. | **BLOCKED** — local mock OpenID4VP request flow currently supports SD-JWT only. |

## Fixes made from this audit

- Inji Web's present button now runs only when Inji Verify is selected. Before this fix it always called Inji Verify but could be labeled as the local mock verifier.
- The Issuer column no longer offers the playground-vault issue action when Inji Web is selected; it explains that Inji Web issuance is through Mimoto's own issuer screen.
- Inji Certify SD-JWT and mDoc selections no longer offer an action that is known to fail. The UI explains the configured Certify profile supports W3C `ldp_vc` only.
- Inji Mobile with the local mock verifier now explains that the phone's QR path targets Inji Verify.

## Verification run

- Browser UI: reselected all **16/16** issuer × wallet × verifier combinations in the running app. The visible state matched the support table: Inji Web shows its separate Mimoto route, Inji Mobile exposes its Certify offer action only, and unsupported Local Mock pairings show guidance without an issue action. No issuance, presentation, or credential deletion was triggered during this selector-only pass.
- Browser UI format controls: inspected the format choices for all eight issuer × wallet pairs. Inji Certify exposes W3C VC; Local Mock exposes W3C VC, SD-JWT, and mDoc for the browser vault, SD-JWT only for the Local Reference Wallet, and displays W3C VC for Mobile without enabling Local Mock phone issuance. Inji Web uses its Mimoto issuance flow and has no playground format selector.
- Browser UI dropdown controls: issuer, wallet, verifier, and security-scenario menus opened and selections worked. Switching from a nonce attack to Inji Mobile reset the hidden attack choice to Normal Verification.
- Live matrix: **11/11 PASS**, including 5/5 expected negative security outcomes; runtime reported Certify, Mimoto, Verify, and database UP.
- Frontend: `npm run build` and `npm run lint` passed.
- Backend: `npm run build` passed.
- Mobile proof issuance check: signed credential returned `SUCCESS`; tampered credential returned `INVALID`.
- Physical Inji Mobile evidence and the latest official Verify result are recorded in [PHYSICAL_MOBILE_TEST_RESULTS.md](PHYSICAL_MOBILE_TEST_RESULTS.md); upstream compatibility findings are in [upstream-issue-drafts.md](upstream-issue-drafts.md).

## Remaining P2 boundary

The matrix and physical Inji Mobile route establish the primary P2 issuance/presentation/verification workflow. Inji Web requires a signed-in Mimoto wallet session for an end-to-end run. mDoc's current evidence is local reference cryptography, not a mobile device-response presentation. Those paths must not be described as verified end-to-end.
