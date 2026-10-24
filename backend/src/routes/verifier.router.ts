import { Router } from 'express';
import { VerifyService } from '../services/verify.service';
import { MockExternalService } from '../services/mock-external.service';
import { CredentialTamperEngine, TamperAttackVector } from '../domain/tamper';
import { VerifierImplementation } from '../types';
import { VPRunStore, VPRunRecord } from '../domain/vp-run-store';
import { CertifyService } from '../services/certify.service';

const router = Router();
// The alpha verifier may not retain a completed transaction for a second poll.
// Keep its official response while the separate proof/VC check finishes.
const mobileFinalResults = new Map<string, any>();

router.get('/did', async (req, res) => {
  try {
    const impl = (req.query.implementation as VerifierImplementation) || 'INJI_VERIFY';
    if (impl === 'MOCK_EXTERNAL_OID4VP') {
      return res.json({
        id: MockExternalService.verifierKeyPair.did,
        verificationMethod: [{
          id: `${MockExternalService.verifierKeyPair.did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: MockExternalService.verifierKeyPair.did,
          publicKeyMultibase: MockExternalService.verifierKeyPair.publicKeyMultibase
        }]
      });
    }
    const didDoc = await VerifyService.getDidDocument();
    res.json(didDoc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mobile-readiness', async (_req, res) => {
  const issues: string[] = [];
  const verifyUrl = process.env.VERIFY_PUBLIC_URL || '';
  const verifyDid = process.env.VERIFY_PUBLIC_DID || '';
  const issuerDid = process.env.CERTIFY_PUBLIC_DID || '';
  const issuerOrigin = process.env.CERTIFY_PUBLIC_ORIGIN || '';
  try {
    const url = new URL(verifyUrl);
    if (url.protocol !== 'https:' || !url.pathname.endsWith('/v1/verify')) {
      issues.push('VERIFY_PUBLIC_URL must be a phone-reachable HTTPS URL ending in /v1/verify.');
    }
    if (/^(localhost|127\.|host\.docker\.internal$|verify-service$|verify-gateway$)/i.test(url.hostname)) {
      issues.push('VERIFY_PUBLIC_URL still points to a local or Docker-only hostname.');
    }
  } catch { issues.push('VERIFY_PUBLIC_URL is missing or invalid.'); }
  if (!verifyDid.startsWith('did:web:') || /verify-service|localhost|127\.0\.0\.1/.test(verifyDid)) {
    issues.push('VERIFY_PUBLIC_DID must resolve over the public HTTPS origin.');
  }
  if (!issuerDid.startsWith('did:web:') || /certify-nginx|localhost|127\.0\.0\.1/.test(issuerDid)) {
    issues.push('CERTIFY_PUBLIC_DID must resolve over the public HTTPS origin.');
  }
  try {
    const issuerUrl = new URL(issuerOrigin);
    const verifierUrl = new URL(verifyUrl);
    if (issuerUrl.protocol !== 'https:' || issuerUrl.origin !== verifierUrl.origin ||
        issuerDid !== `did:web:${issuerUrl.hostname.toLowerCase()}`) {
      issues.push('CERTIFY_PUBLIC_ORIGIN and CERTIFY_PUBLIC_DID must match the public HTTPS playground origin.');
    }
  } catch { issues.push('CERTIFY_PUBLIC_ORIGIN is missing or invalid.'); }
  try {
    const upstreamDid = await VerifyService.getDidDocument();
    if (upstreamDid.id !== verifyDid) issues.push('Inji Verify is still publishing a different verifier DID.');
  } catch { issues.push('Inji Verify DID discovery failed.'); }
  if (issues.length === 0) {
    try {
      await CertifyService.assertMobileIssuerConfiguration(`${issuerOrigin}/v1/certify`);
    } catch (error: any) {
      issues.push(error.message || 'Certify public issuer discovery failed.');
    }
  }
  res.json({ configuredForPhone: issues.length === 0, issues, verifyPublicUrl: verifyUrl,
    verifyDid, issuerDid, reachabilityValidatedFromPhone: false });
});

router.post('/verify-vc', async (req, res) => {
  try {
    const {
      vc,
      verifierImplementation = 'INJI_VERIFY',
      tamperScenario = 'NONE'
    } = req.body;

    if (!vc) {
      return res.status(400).json({ error: 'Missing vc payload in request body' });
    }

    // Step 1: If an attack vector was chosen in the UI/test runner,
    // mutate the credential bytes BEFORE passing to the verifier.
    let credentialToSubmit = vc;
    if (tamperScenario && tamperScenario !== 'NONE') {
      const mutation = CredentialTamperEngine.mutate(vc, tamperScenario as TamperAttackVector);
      credentialToSubmit = mutation.tamperedCredential;
    }

    // Step 2: Pass mutated credential BLINDLY to the verifier.
    // The verifier does NOT receive any tamper parameter!
    if (verifierImplementation === 'MOCK_EXTERNAL_OID4VP') {
      const result = await MockExternalService.verifyPresentation(credentialToSubmit);
      return res.json(result);
    }

    const result = await VerifyService.verifyVC(credentialToSubmit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vp-request', async (req, res) => {
  try {
    const vpRequest = await VerifyService.createVPRequest(req.body);
    res.json(vpRequest);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Create a real Verify request that the packaged Inji Web wallet can resolve over the Compose network. */
router.post('/inji-web-request', async (_req, res) => {
  try {
    const clientId = process.env.INJI_DID_VERIFY_URI || 'did:web:verify-service:v1:verify';
    const request = await VerifyService.createVPRequest({ clientId });
    if (!request.requestId || !request.transactionId) {
      throw new Error('Inji Verify did not return a request and transaction ID');
    }

    // Fetching the signed request through the local gateway registers its nonce
    // before Mimoto later submits the holder's direct_post response.
    const jwt = await VerifyService.getVPRequestJwt(request.requestId);
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error('Inji Verify returned an invalid request JWT');
    const authorization = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (authorization.client_id !== clientId || authorization.state !== request.requestId ||
      typeof authorization.nonce !== 'string' || !authorization.response_uri) {
      throw new Error('Inji Verify request JWT is missing its expected client, state, nonce, or response URI');
    }

    const webBase = process.env.INJI_WEB_URL || 'http://localhost:3004';
    const webUrl = new URL('/authorize', webBase);
    webUrl.searchParams.set('response_type', 'vp_token');
    webUrl.searchParams.set('client_id', clientId);
    // Mimoto resolves request_uri from inside the Compose network.
    webUrl.searchParams.set('request_uri', `http://verify-gateway:8080/v1/verify/vp-request/${encodeURIComponent(request.requestId)}`);
    res.json({ requestId: request.requestId, transactionId: request.transactionId, clientId, authorizationUrl: webUrl.toString() });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Could not create Inji Web presentation request' });
  }
});

router.get('/vp-result/:transactionId', async (req, res) => {
  try {
    const mobileAlphaProfile = req.query.profile === 'mobile-alpha';
    const result = mobileAlphaProfile
      ? mobileFinalResults.get(req.params.transactionId) ||
        await VerifyService.getMobileAlphaVPResult(req.params.transactionId)
      : await VerifyService.getVPResult(req.params.transactionId);
    const status = result?.vpResultStatus;
    if (mobileAlphaProfile && typeof status === 'string' &&
        !['PENDING', 'PROCESSING', 'CREATED'].includes(status) &&
        !mobileFinalResults.has(req.params.transactionId)) {
      mobileFinalResults.set(req.params.transactionId, result);
      if (mobileFinalResults.size > 1000) {
        mobileFinalResults.delete(mobileFinalResults.keys().next().value!);
      }
    }
    let interopDiagnostic: string | undefined;
    let submittedMetadata: any = null;
    let independentResult: VPRunRecord['independentResult'] | undefined;
    {
      try {
        const gateway = mobileAlphaProfile
          ? (process.env.VERIFY_ALPHA_GATEWAY_URL || 'http://verify-gateway-alpha:8080')
          : (process.env.VERIFY_GATEWAY_URL || (process.env.VERIFY_URL
            ? new URL(process.env.VERIFY_URL).origin : 'http://localhost:8095'));
        const diagnosticResponse = await fetch(`${gateway}/internal/proof-diagnostic/${encodeURIComponent(req.params.transactionId)}`,
          { signal: AbortSignal.timeout(1000) });
        if (diagnosticResponse.ok) {
          const metadata: any = await diagnosticResponse.json();
          submittedMetadata = metadata?.proof;
          const fragmentCount = submittedMetadata?.verificationMethodFragmentCount;
          if (status === 'FAILED' && Number.isInteger(fragmentCount) && fragmentCount > 1) {
            interopDiagnostic = `Submitted VP proof method contains ${fragmentCount} URI fragment delimiters (#); Inji Verify returned FAILED.`;
          }
        }
      } catch { /* A gateway restart must not hide the upstream verifier result. */ }
    }
    if (mobileAlphaProfile && typeof status === 'string' &&
        !['PENDING', 'PROCESSING', 'CREATED'].includes(status)) {
      try {
        const gateway = process.env.VERIFY_ALPHA_GATEWAY_URL || 'http://verify-gateway-alpha:8080';
        const response = await fetch(
          `${gateway}/internal/independent-result/${encodeURIComponent(req.params.transactionId)}`,
          { signal: AbortSignal.timeout(1500) }
        );
        if (response.ok) {
          const data: any = await response.json();
          independentResult = data?.result || { status: 'UNAVAILABLE', reason: 'NO_LOCAL_RESULT' };
        } else {
          independentResult = { status: 'UNAVAILABLE', reason: 'LOCAL_RESULT_UNAVAILABLE' };
        }
      } catch {
        independentResult = { status: 'UNAVAILABLE', reason: 'LOCAL_RESULT_UNAVAILABLE' };
      }
    }
    if (typeof status === 'string' && !['PENDING', 'PROCESSING', 'CREATED'].includes(status)) {
      const credentials = Array.isArray(result.vcResults) ? result.vcResults : [];
      const selectedWallet: VPRunRecord['selectedWallet'] = req.query.selectedWallet === 'INJI_MOBILE' ||
        req.query.selectedWallet === 'INJI_WEB' ? req.query.selectedWallet : 'UNSPECIFIED';
      VPRunStore.appendIfNew({
        transactionId: req.params.transactionId,
        completedAt: new Date().toISOString(),
        executionMode: 'EXTERNAL_WALLET_OPENID4VP',
        selectedWallet,
        walletIdentityVerified: false,
        verifier: 'INJI_VERIFY',
        vpResultStatus: status,
        valid: status === 'SUCCESS' && credentials.length > 0 && credentials.every((item: any) => item.verificationStatus === 'SUCCESS'),
        ...(interopDiagnostic ? { interopDiagnostic } : {}),
        ...(Number.isInteger(submittedMetadata?.submittedCredentialCount)
          ? { submittedCredentialCount: submittedMetadata.submittedCredentialCount } : {}),
        ...(Array.isArray(submittedMetadata?.submittedCredentialFormats)
          ? { submittedCredentialFormats: submittedMetadata.submittedCredentialFormats } : {}),
        ...(Array.isArray(submittedMetadata?.submittedCredentialProofTypes)
          ? { submittedCredentialProofTypes: submittedMetadata.submittedCredentialProofTypes } : {}),
        ...(Array.isArray(submittedMetadata?.submittedIssuerIds)
          ? { submittedIssuerIds: submittedMetadata.submittedIssuerIds } : {}),
        credentialCount: credentials.length,
        credentialResults: credentials.map((item: any) => {
          let verifiedCredential = item.vc;
          if (typeof verifiedCredential === 'string') {
            try { verifiedCredential = JSON.parse(verifiedCredential); } catch { verifiedCredential = null; }
          }
          const issuer = verifiedCredential?.issuer;
          return {
            verificationStatus: String(item.verificationStatus || 'UNKNOWN'),
            ...(typeof issuer === 'string' ? { issuer } : typeof issuer?.id === 'string' ? { issuer: issuer.id } : {}),
            ...(typeof verifiedCredential?.format === 'string' ? { format: verifiedCredential.format } : {}),
            ...(typeof verifiedCredential?.proof?.type === 'string' ? { proofType: verifiedCredential.proof.type } : {}),
            ...(typeof item.error === 'string' ? { error: item.error } : {})
          };
        }),
        ...(independentResult ? { independentResult } : {})
      });
    }
    if (mobileAlphaProfile) mobileFinalResults.delete(req.params.transactionId);
    res.json({
      ...result,
      ...(interopDiagnostic ? { interopDiagnostic } : {}),
      ...(independentResult ? { independentResult } : {})
    });
  } catch (err: any) {
    const status = /\(404\)/.test(err.message || '') ? 202 : 502;
    res.status(status).json({ pending: status === 202, error: err.message });
  }
});

router.get('/vp-independent-result/:transactionId', async (req, res) => {
  try {
    const gateway = process.env.VERIFY_ALPHA_GATEWAY_URL || 'http://verify-gateway-alpha:8080';
    const response = await fetch(
      `${gateway}/internal/independent-result/${encodeURIComponent(req.params.transactionId)}`,
      { signal: AbortSignal.timeout(1500) }
    );
    if (!response.ok) return res.status(502).json({ error: 'Independent verifier unavailable' });
    const data: any = await response.json();
    const result = data?.result || { status: 'UNAVAILABLE', reason: 'NO_LOCAL_RESULT' };
    if (result.status !== 'PENDING') {
      VPRunStore.updateIndependentResult(req.params.transactionId, result);
    }
    res.json({ result });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Independent verifier unavailable' });
  }
});

router.get('/vp-history', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const records = VPRunStore.read();
    res.json({ totalRuns: records.length, runs: records.slice(0, limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/vp-history/export', (req, res) => {
  try {
    const runs = VPRunStore.read();
    const format = req.query.format === 'md' ? 'md' : 'json';
    const cell = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    res.attachment(`inji-external-wallet-vp-history.${format}`);
    if (format === 'json') return res.json({ exportedAt: new Date().toISOString(), runs });
    res.type('text/markdown').send([
      '# External Wallet OpenID4VP Runs', '',
      'Wallet selection is recorded from the playground UI; the wallet app identity is not independently authenticated by this report.', '',
      'Submitted credential fields below are claims in the wallet payload; only VC results are verifier outcomes.', '',
      '| Completed | Transaction | Selected wallet | Verifier | Official status | Submitted VCs | Submitted formats | Submitted proof types | Claimed issuers | Official VC results | Official valid | Separate check | Diagnostic |',
      '|---|---|---|---|---|---:|---|---|---|---:|---|---|---|',
      ...runs.map(run => `| ${[
        run.completedAt, run.transactionId, run.selectedWallet, run.verifier, run.vpResultStatus,
        run.submittedCredentialCount ?? 'unknown', (run.submittedCredentialFormats || []).join(', '),
        (run.submittedCredentialProofTypes || []).join(', '), (run.submittedIssuerIds || []).join(', '),
        run.credentialCount, run.valid, run.independentResult?.status || 'not run', run.interopDiagnostic || ''
      ].map(cell).join(' | ')} |`)
    ].join('\n'));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/mock/vp-request', (req, res) => {
  try {
    const request = MockExternalService.createVPRequest(req.body?.format);
    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mock/vp-response', async (req, res) => {
  try {
    const result = await MockExternalService.submitSDJWTPresentation({
      state: req.body?.state, vpToken: req.body?.vp_token,
      presentationSubmission: req.body?.presentation_submission
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/vp-request/:requestId/jwt', async (req, res) => {
  try {
    const jwt = await VerifyService.getVPRequestJwt(req.params.requestId);
    res.json({ jwt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
