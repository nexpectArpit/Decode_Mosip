# Physical Inji Mobile test — 20–24 October 2026

## Latest result — 24 October 2026

The latest persisted transaction is `19e1e15f-2bd4-444c-8f71-afbf6141ad4c` (09:05:51 UTC). Inji Verify returned `vpResultStatus: SUCCESS`, one VC `verificationStatus: SUCCESS`, and `valid: true`. The independent playground proof check returned `PASS`. The user confirmed the Inji Mobile share completed. The wallet app identity remains user-reported, not cryptographically attested by the protocol.

The immediately preceding run `58d685bc-1552-4ac7-ba0f-0da844f4d11d` also received official Verify `SUCCESS`, but the independent checker returned `FAIL`. The earlier first official PASS `6eac97b6-7d68-4ac1-8580-eac2d7c81e00` also had an independent-check mismatch. These records remain in history to preserve the difference between official verifier acceptance and the diagnostic implementation.

### Earlier first official acceptance

After patching Certify 0.14.0 to put the base `did:jwk` in the signed credential subject, the user downloaded a **new** Farmer card with **+ → Scan & Download**. The restricted HTTPS edge recorded successful offer retrieval, token exchange, and credential issuance (HTTP 200). The user then used **Share → Scan** and selected the new card. The edge recorded a signed VP request fetch and `direct_post` (HTTP 200).

Transaction `6eac97b6-7d68-4ac1-8580-eac2d7c81e00` is persisted with official Inji Verify `vpResultStatus: SUCCESS`, one VC result with `verificationStatus: SUCCESS`, and `valid: true`. The user reported “Phone shared; web PASS,” and the playground displayed **CREDENTIAL VERIFIED**. This is the first recorded physical end-to-end PASS. The wallet brand remains user-reported rather than cryptographically attested by the protocol.

The separate playground proof checker reported `VP_PROOF_INVALID` for this first accepted VP. That disagreement did not change the official Verify result. A later pinned-context resolver fix produced the latest transaction above with independent `PASS`. The preceding failure analysis below describes earlier cards and runs and is superseded by these results for the current issuer build.

## Earlier investigation (20–22 October)

The following sections describe the failed cards and verifier profiles before the 24 October issuer fix. Their statements about an open acceptance gate apply to those earlier attempts. The existing Inji Mobile app was tested through a temporary public HTTPS tunnel; its app identity is user-reported because OpenID4VP does not independently attest the app brand.

## Issuance

The user scanned the Inji Certify pre-authorized offer with the app's **+ → Scan & Download** flow, accepted the issuer trust prompt, and reported **“Your card is downloaded successfully.”** This is user-observed wallet receipt. The playground's issuer gateway also exercised the live offer, token, and credential endpoints, but this note does not claim a cryptographic link between a particular phone-held card and a later VP solely from those gateway traces.

## Presentation

The first verifier QR was rejected by the wallet as **“Invalid request link.”** The signed request's `presentation_definition` had `filter: {"type":"array"}` without `pattern`: Inji Verify 0.17.0 had discarded the frontend's unsupported `contains` condition. The exact Inji OpenID4VP Kotlin library version used by the wallet (`v0.7.0`) requires `filter.type` and `filter.pattern`. The playground now sends `path: ["$.type[1]"]` with `filter: {"type":"string","pattern":"^FarmerCredential$"}`. The resulting signed request was fetched and decoded through the public HTTPS origin; both fields survived.

With that correction, the user used the bottom-bar **Share → Scan** option, trusted the verifier, selected the previously downloaded card, consented, completed the app's selfie step, and saw **“Shared successfully.”** The gateway recorded the phone fetching the signed request and posting a VP by `direct_post`. It passed the gateway's request nonce check and reached Inji Verify.

| Verify image | Request ID | Transaction ID | Phone | Inji Verify result |
|---|---|---|---|---|
| 0.17.0 | `req_db3c534b-4ecf-44ce-b7d8-503736ac08ae` | `c56d22f4-8741-4f68-80fc-f4dc75af5d04` | Shared successfully | `FAILED`, 0 VC results |
| 0.18.2 | `req_d19129a7-7a14-4102-b2bb-56147683b0ea` | `4514a5b4-e060-4181-b2aa-4ed7fee07062` | Shared successfully | `FAILED`, 0 VC results |
| 0.17.0 | latest phone QR | `86f27272-2fbb-4f35-8ae9-be370432a2f7` | User replied “pass”; wallet message/result distinction unclear | `FAILED`, 0 VC results |
| 0.17.0 | fresh phone QR, 22 Oct | `edf2c3dc-af7a-4687-9a68-59734a4458a2` | Phone shared; user reported web PASS | `FAILED`, 0 VC results |
| 0.17.0 | fresh phone QR, 22 Oct | `1aef8665-b323-44bb-8b02-6feb94a0d487` | Screenshot shows “ID shared successfully!” | `FAILED`, 0 VC results |
| 1.0.0-alpha.1 | DCQL QR, fresh phone scan, 22 Oct | `2c2752f7-4cf9-4adc-9e6e-3c01043edd97` | Phone reached card consent and submitted; user reported web PASS | `FAILED`, 0 VC results |

Both failed results are persisted in `/api/verifier/vp-history` with `selectedWallet: INJI_MOBILE`, `walletIdentityVerified: false`, and `valid: false`. The inspector showed the request, signed-request retrieval, `direct_post`, and final result under each transaction. **A phone “Shared successfully” screen proves handoff, not verifier acceptance.**

## Failure evidence and boundary

The 0.17.0 and 0.18.2 Verify logs both failed during VP proof verification with `Illegal character in fragment … did:jwk:…#0#0`. A metadata-only query of the submitted VP found proof type `JsonWebSignature2020`, JWS algorithm `ES256`, method `did:jwk`, and **two `#` characters** in its verification method. No credential claims or private key material were needed for this diagnosis. Inspection of the running 0.17.0 image found `BOOT-INF/lib/vcverifier-jar-1.7.0.jar` inside `/home/inji/verify-service.jar`. Its matching [v1.7.0 source](https://github.com/mosip/vc-verifier/blob/v1.7.0/vc-verifier/kotlin/vcverifier/src/main/java/io/mosip/vercred/vcverifier/PresentationVerifier.kt) resolves the proof method first and then permits only EdDSA for `JsonWebSignature2020`; therefore the submitted ES256 proof also cannot pass that packaged library after the malformed URI is addressed. Inspection of the locally cached 0.18.2 image found `vcverifier-jar-1.8.1.jar`; its [matching source](https://github.com/mosip/vc-verifier/blob/v1.8.1/vc-verifier/kotlin/vcverifier/src/main/java/io/mosip/vercred/vcverifier/PresentationVerifier.kt) supports ES256 but still resolves the malformed proof method first. This is an interoperability defect in the actual mobile VP → Inji Verify path, not a playground PASS. We have not changed the signed VP, bypassed proof validation, or relabeled the result.

At public source HEAD `144c82dd7d1783cb99382749dea6d8f647a9c8bc`, Inji Mobile's [`sendVP` implementation](https://github.com/inji/inji-wallet/blob/master/machines/openID4VP/openID4VPServices.ts) constructs a holder `did:jwk:…#0`, and the [OpenID4VP library builder](https://github.com/inji/inji-openid4vp/blob/master/kotlin/openID4VP/src/commonMain/kotlin/io/mosip/openID4VP/authorizationResponse/unsignedVPToken/types/ldp/UnsignedLdpVPTokenBuilder.kt) assigns that holder string to `proof.verificationMethod`. That current source path does not itself show a second `#0`. The user reports installing Inji Mobile **1.0.0-alpha.1** (described as “v30”); the APK build metadata and bundled library versions have not been independently inspected, so source observations do not prove where the duplicate fragment was introduced. A fresh sanitized capture at gateway ingress, before forwarding, and inspection of the exact APK build are needed to assign that defect to a specific component.

### Wallet/verifier release compatibility

The reported Mobile 1.0.0-alpha.1 wallet uses OpenID4VP 1.0 and DCQL. The playground now pairs it with Verify 1.0.0-alpha.1 and a DCQL request. A fresh physical scan reached card consent and submitted a VP, confirming the prior profile mismatch is resolved. Verify then rejected the submitted proof because its `did:jwk` method contains two fragments (`#0#0`).

The playground now records only the submitted VP proof type, JWS algorithm, method scheme, and URI fragment count in a diagnostic trace. A synthetic malformed VP with the same two-fragment shape reached the local gateway and returned `FAILED`; the API supplied `interopDiagnostic: "Submitted VP proof method contains 2 URI fragment delimiters (#); Inji Verify returned FAILED."` This checks the diagnostic path, not the physical wallet's credential or signature. The synthetic probe was removed from persistent VP history afterward.

On 22 October, a new phone presentation reached the gateway through the temporary public origin. The request nonce guard passed, and the ingress metadata showed one `ldp_vc` credential, `JsonWebSignature2020`, `ES256`, and `proofMethodMatchesHolder: true`. Both the holder and `proof.verificationMethod` contained two `#` delimiters (`#0#0`). The transaction was persisted as `vpResultStatus: FAILED`, `valid: false`, with zero verified VC results. The frontend displayed **CREDENTIAL REJECTED**. The user's reply “pass” conflicts with that saved server result; the exact screen to which “pass” referred is unclear. This physical attempt therefore does **not** count as a verifier PASS.

A second fresh request was generated and scanned on 22 October. The user reported “Phone shared; web PASS,” but the new transaction's live API response and the webpage both showed `vpResultStatus: FAILED`, zero VC results, and the diagnostic that the submitted proof method contains two URI fragment delimiters. The visible webpage displayed **REJECTED (FAILED)**. Treat the transaction and UI status as the verifier result; the user-reported PASS does not match the observable page state.

A third fresh request was scanned on 22 October. The user supplied a phone screenshot displaying “ID shared successfully!” for the correct verifier DID. The corresponding webpage and live API again showed **REJECTED (FAILED)**, zero verified VC results, and the same two-fragment proof-method diagnostic. This confirms successful submission from the phone while preserving the verifier failure.

The next fresh request used the compatibility-matched alpha/DCQL profile and the updated unfiltered `ldp_vc` query. The user confirmed the phone reached card selection/consent and later reported “Phone shared; web PASS.” Transaction `2c2752f7-4cf9-4adc-9e6e-3c01043edd97` (request `req_236f14de-4ddb-4b95-8c40-1f110110765f`) returned `vpResultStatus: FAILED` with zero VC results. The page displayed **VERIFICATION COULD NOT COMPLETE**. The direct-post ingress returned HTTP 200, but Verify logged `Illegal character in fragment` for `did:jwk:…#0#0`. This confirms the DCQL change fixed card matching; the remaining failure is proof parsing. The reported web PASS does not match the live result.

This is historical compatibility testing from 20–22 October. At that point, Verify 0.18.2 rejected the same mobile proof and the 0.17.0 profile failed on `#0#0`. The current mobile acceptance gate was closed on 24 October by the fresh-card run at the top of this report. The separate raw-upstream nonce control remains a security finding; the playground gateway rejects it.

The temporary tunnel hostname used for the earlier tests expired on 21 October 2026. For the 22 October attempt, a new temporary Cloudflare tunnel was configured to reach only `mobile-edge`, and the issuer/verifier public DID documents and metadata were checked before scanning. That tunnel was running at the time the latest result was captured; its URL is temporary and will change if restarted.

On 21 October a loopback-only optional `mobile-edge` service was added. Local HTTP checks confirmed that its issuer/verifier DID and metadata routes return 200, that an invalid VP `direct_post` reaches the nonce guard and returns 400, and that the frontend, `/api`, VP history, exports, and issuer offer-creation path return 404. The browser SDK creates requests through its local `/v1/verify` proxy while the configured public origin supplies the phone-facing request and response URIs. The user explicitly authorized the temporary Cloudflare tunnel for this real phone test. The tunnel terminates at the restricted edge and does not expose the UI, API, or audit history.
