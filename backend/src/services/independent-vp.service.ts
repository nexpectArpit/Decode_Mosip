import { resolveDidJwkKey, verifyPresentation } from '../crypto/vp-verifier';

export type IndependentVPStatus = 'PENDING' | 'PASS' | 'FAIL' | 'ERROR';

/** Metadata only. A VP or credential body must never be put in this result. */
export interface IndependentVPResult {
  status: IndependentVPStatus;
  reason: string;
  vpProofValid: boolean;
  vpProofType?: string;
  vpProofAlgorithm?: string;
  vpProofFailure?: 'NONCE_MISMATCH' | 'DOMAIN_MISMATCH' | 'HOLDER_BINDING_FAILED' |
    'KEY_RESOLUTION_FAILED' | 'CANONICALIZATION_FAILED' | 'SIGNATURE_INVALID' | 'UNSUPPORTED_PROOF';
  holderBindingValid: boolean;
  credentialSubjectBindingValid: boolean;
  nonceValid: boolean;
  verificationMethodFragmentCount: number;
  credentialCount: number;
  credentialStatuses: string[];
  credentialVerifier: 'INJI_VERIFY_VC_API';
}

export interface CredentialVerificationResponse {
  verificationStatus: string;
}

/**
 * Verify the holder's unchanged VP proof locally, then ask Inji Verify's VC
 * endpoint to verify each embedded issuer credential independently.
 * This result is separate from Inji Verify's official VP transaction result.
 */
export async function verifyIndependentVP(params: {
  vp: unknown;
  expectedNonce: string;
  expectedDomain: string;
  verifyCredential: (credential: unknown) => Promise<CredentialVerificationResponse>;
}): Promise<IndependentVPResult> {
  const proof = await verifyPresentation({
    vp: params.vp, expectedNonce: params.expectedNonce, expectedDomain: params.expectedDomain
  });
  const vpProofFailure: IndependentVPResult['vpProofFailure'] = proof.valid ? undefined
    : !proof.checks.nonceValid ? 'NONCE_MISMATCH'
      : proof.message.startsWith('Proof domain') ? 'DOMAIN_MISMATCH'
        : proof.message.startsWith('Holder binding') ? 'HOLDER_BINDING_FAILED'
          : proof.message.startsWith('Key resolution') ? 'KEY_RESOLUTION_FAILED'
            : proof.message.startsWith('Failed to compute signing input') ? 'CANONICALIZATION_FAILED'
              : proof.message.startsWith('Unsupported proof') ? 'UNSUPPORTED_PROOF'
                : 'SIGNATURE_INVALID';
  const base: IndependentVPResult = {
    status: 'FAIL',
    reason: 'VP_PROOF_INVALID',
    vpProofValid: proof.checks.proofSignatureValid,
    vpProofType: proof.checks.proofType,
    vpProofAlgorithm: proof.checks.algorithm,
    vpProofFailure,
    holderBindingValid: proof.checks.holderBindingValid,
    credentialSubjectBindingValid: false,
    nonceValid: proof.checks.nonceValid,
    verificationMethodFragmentCount: proof.checks.fragmentCount,
    credentialCount: 0,
    credentialStatuses: [],
    credentialVerifier: 'INJI_VERIFY_VC_API'
  };
  if (!proof.valid) return base;

  const credentials = proof.verifiableCredentials;
  if (!Array.isArray(credentials) || credentials.length === 0 || credentials.length > 10) {
    return { ...base, reason: 'VC_COUNT_INVALID' };
  }
  const statuses: string[] = [];
  const subjectBindings: boolean[] = [];
  const holderKey = resolveDidJwkKey(proof.checks.holderDid).publicKey
    .export({ type: 'spki', format: 'der' });
  for (const credential of credentials) {
    if (!credential || typeof credential !== 'object' || Array.isArray(credential) ||
        !(typeof credential['@context'] === 'string' || Array.isArray(credential['@context'])) ||
        !credential.proof) {
      statuses.push('INVALID');
      subjectBindings.push(false);
      continue;
    }
    const subject = credential.credentialSubject;
    const subjects = Array.isArray(subject) ? subject : [subject];
    const subjectBound = subjects.length > 0 && subjects.every((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          typeof (item as { id?: unknown }).id !== 'string') return false;
      try {
        const key = resolveDidJwkKey((item as { id: string }).id).publicKey
          .export({ type: 'spki', format: 'der' });
        return holderKey.equals(key);
      } catch { return false; }
    });
    if (!subjectBound) {
      statuses.push('SUBJECT_BINDING_FAILED');
      subjectBindings.push(false);
      continue;
    }
    subjectBindings.push(true);
    try {
      const result = await params.verifyCredential(credential);
      statuses.push(typeof result?.verificationStatus === 'string'
        ? result.verificationStatus : 'ERROR');
    } catch {
      statuses.push('ERROR');
    }
  }
  const allValid = statuses.every(status => status === 'SUCCESS');
  const serviceError = statuses.some(status => status === 'ERROR');
  return {
    ...base,
    credentialSubjectBindingValid: subjectBindings.length === credentials.length &&
      subjectBindings.every(Boolean),
    status: allValid ? 'PASS' : serviceError ? 'ERROR' : 'FAIL',
    reason: allValid ? 'VP_AND_VC_VERIFIED' : serviceError ? 'VC_VERIFIER_ERROR' : 'VC_VERIFICATION_REJECTED',
    credentialCount: credentials.length,
    credentialStatuses: statuses
  };
}
