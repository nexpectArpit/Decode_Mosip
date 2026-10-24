export interface NormativeRequirement {
  id: string;
  specification: 'OpenID4VCI' | 'OpenID4VP' | 'W3C_VC' | 'SD_JWT' | 'ISO_18013_5';
  clause: string;
  title: string;
  description: string;
  tested: boolean;
  passed: boolean;
  evidence: any;
  failureReason?: string;
  scope?: 'UPSTREAM_API' | 'LOCAL_REFERENCE' | 'WALLET_PRESENTATION';
}

export interface StandardsAuditSummary {
  spec: 'OpenID4VCI' | 'OpenID4VP' | 'W3C_VC' | 'SD_JWT' | 'ISO_18013_5';
  specName: string;
  specVersion: string;
  totalRequirements: number;
  passedRequirements: number;
  passRatePercentage: number;
}

export class NormativeMatrixRegistry {
  public static getRequirements(): NormativeRequirement[] {
    return [
      // OpenID4VCI (draft 13)
      {
        id: 'OID4VCI-DISC-01',
        specification: 'OpenID4VCI',
        clause: 'Section 11.2.2',
        title: 'Issuer Metadata Discovery',
        description: 'Issuer MUST publish metadata at /.well-known/openid-credential-issuer.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VCI-CONF-02',
        specification: 'OpenID4VCI',
        clause: 'Section 11.2.3',
        title: 'Credential Configurations Supported',
        description: 'Metadata declares the credential configurations and formats actually supported by the issuer.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VCI-OFFER-03',
        specification: 'OpenID4VCI',
        clause: 'Section 4.1',
        title: 'Credential Offer URI Scheme',
        description: 'Issuer generates a credential offer carrying a pre-authorized code grant.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VCI-TOKEN-04',
        specification: 'OpenID4VCI',
        clause: 'Section 6.2',
        title: 'OAuth 2.0 Token Exchange',
        description: 'Wallet exchanges the pre-authorized code through the advertised authorization server and receives an issuance bearer token.',
        tested: false,
        passed: false,
        evidence: null
      },

      // OpenID4VP (draft 21-23)
      {
        id: 'OID4VP-REQ-01',
        specification: 'OpenID4VP',
        clause: 'Section 5.1',
        title: 'Authorization Request Generation',
        description: 'Verifier generates openid4vp:// authorization request with client_id and nonce.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VP-DEF-02',
        specification: 'OpenID4VP',
        clause: 'Section 5.2',
        title: 'DIF Presentation Exchange 2.0',
        description: 'Presentation definition defines input_descriptors and format constraints.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VP-DID-03',
        specification: 'OpenID4VP',
        clause: 'Section 8.1',
        title: 'Verifier DID Resolution',
        description: 'Verifier publishes resolvable DID Document declaring verificationMethod.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'OID4VP-RESP-04',
        specification: 'OpenID4VP',
        clause: 'Section 6.1',
        title: 'VP Token Cryptographic Verification',
        description: 'Verifier verifies cryptographic signature and replay nonce on received presentation.',
        tested: false,
        passed: false,
        evidence: null
      },

      // W3C VC 1.1 / 2.0
      {
        id: 'W3C-DATA-01',
        specification: 'W3C_VC',
        clause: 'Section 4',
        title: 'W3C VC Core Data Model',
        description: 'Payload contains @context, id, type, issuer, issuanceDate, and credentialSubject.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'W3C-JCS-02',
        specification: 'W3C_VC',
        clause: 'RFC 8785',
        title: 'Local RFC 8785 JSON Canonicalizer',
        description: 'Local JSON helper produces deterministic JCS output; JSON-LD Ed25519Signature2020 uses its own linked-data canonicalization.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'W3C-CRYPTO-03',
        specification: 'W3C_VC',
        clause: 'W3C Sec Suites',
        title: 'Ed25519Signature2020 Proof Suite',
        description: 'Live Certify Ed25519Signature2020 credential succeeds at Inji Verify and a modified proof fails.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'W3C-TEMPORAL-04',
        specification: 'W3C_VC',
        clause: 'Section 4.7',
        title: 'Temporal Validity Enforcement',
        description: 'Local reference verifier rejects a credential with expirationDate in the past.',
        tested: false,
        passed: false,
        evidence: null
      },

      // IETF SD-JWT VC
      {
        id: 'SDJWT-DISC-01',
        specification: 'SD_JWT',
        clause: 'Section 5.1',
        title: '128-bit Salt & Disclosure Formation',
        description: 'Disclosures are formed as base64url(JSON([salt, claim_name, claim_value])).',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'SDJWT-DIGEST-02',
        specification: 'SD_JWT',
        clause: 'Section 5.2',
        title: 'SHA-256 Disclosure Digest Array',
        description: 'Issuer calculates sha256(disclosure) and places digests in payload._sd.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'SDJWT-SIGN-03',
        specification: 'SD_JWT',
        clause: 'Section 5.3',
        title: 'Issuer JWS Signature',
        description: 'Issuer signs the JWT with EdDSA / Ed25519.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'SDJWT-SELECT-04',
        specification: 'SD_JWT',
        clause: 'Section 7.1',
        title: 'Selective Disclosure Verification',
        description: 'Verifier matches presented disclosures against signed _sd digests without learning undisclosed claims.',
        tested: false,
        passed: false,
        evidence: null
      },

      // ISO/IEC 18013-5 mDoc
      {
        id: 'MDOC-CBOR-01',
        specification: 'ISO_18013_5',
        clause: 'Section 9.1.2.4',
        title: 'Canonical CBOR IssuerSigned Items',
        description: 'IssuerSignedItem contains digestID, random salt, elementIdentifier, and elementValue.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'MDOC-MSO-02',
        specification: 'ISO_18013_5',
        clause: 'Section 9.1.2.4',
        title: 'MobileSecurityObject ValueDigests',
        description: 'MSO maps digestID to SHA-256 digests across namespaces.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'MDOC-COSE-03',
        specification: 'ISO_18013_5',
        clause: 'Section 9.1.2.4',
        title: 'COSE_Sign1 Cryptographic Signature',
        description: 'IssuerAuth contains COSE_Sign1 structure verifying the MSO payload.',
        tested: false,
        passed: false,
        evidence: null
      },
      {
        id: 'MDOC-TEMP-04',
        specification: 'ISO_18013_5',
        clause: 'Section 9.1.2.4',
        title: 'ValidityInfo Interval Validation',
        description: 'Verifier validates validFrom <= now <= validUntil.',
        tested: false,
        passed: false,
        evidence: null
      }
    ];
  }

  public static getSummaries(reqs: NormativeRequirement[] = this.getRequirements()): StandardsAuditSummary[] {
    const specs: Array<NormativeRequirement['specification']> = [
      'OpenID4VCI',
      'OpenID4VP',
      'W3C_VC',
      'SD_JWT',
      'ISO_18013_5'
    ];

    const names: Record<NormativeRequirement['specification'], { name: string; ver: string }> = {
      OpenID4VCI: { name: 'OpenID for Verifiable Credential Issuance', ver: 'Draft 13' },
      OpenID4VP: { name: 'OpenID for Verifiable Presentations', ver: 'Draft 21-23' },
      W3C_VC: { name: 'W3C Verifiable Credentials Data Model', ver: '1.1 / 2.0' },
      SD_JWT: { name: 'IETF Selective Disclosure for JWTs', ver: 'RFC Draft' },
      ISO_18013_5: { name: 'ISO/IEC 18013-5 Mobile Driving License', ver: '2021 Edition' }
    };

    return specs.map(s => {
      const items = reqs.filter(r => r.specification === s);
      const passed = items.filter(r => r.passed).length;
      return {
        spec: s,
        specName: names[s].name,
        specVersion: names[s].ver,
        totalRequirements: items.length,
        passedRequirements: passed,
        passRatePercentage: Math.round((passed / items.length) * 100)
      };
    });
  }
}
