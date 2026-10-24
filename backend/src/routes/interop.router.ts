import { Router } from 'express';
import { CertifyService } from '../services/certify.service';
import { VerifyService } from '../services/verify.service';
import { MimotoService } from '../services/mimoto.service';
import { MockExternalService } from '../services/mock-external.service';
import { LocalWalletService } from '../services/local-wallet.service';
import { CredentialTamperEngine, TamperAttackVector } from '../domain/tamper';
import { NormativeMatrixRegistry } from '../domain/normative-matrix';
import { runNormativeAudit } from '../domain/normative-audit';
import { RunStore, safeMatrixDiagnostic } from '../domain/run-store';
import { AuditStore } from '../domain/audit-store';
import * as crypto from 'node:crypto';
import {
  MatrixRunResult,
  IssuerImplementation,
  WalletImplementation,
  VerifierImplementation,
  CredentialFormat
} from '../types';

const router = Router();

// Normative specifications audit endpoint
router.get('/standards', (_req, res) => {
  const requirements = NormativeMatrixRegistry.getRequirements();
  const summaries = NormativeMatrixRegistry.getSummaries();
  res.json({
    timestamp: new Date().toISOString(),
    summaries,
    requirements
  });
});

// Overall interoperability status report based on live system probe
router.get('/report', async (_req, res) => {
  const requirements = await runNormativeAudit();
  const summaries = NormativeMatrixRegistry.getSummaries(requirements);
  const totalReqs = requirements.length;
  const passedReqs = requirements.filter(item => item.passed).length;

  // Live health verification
  let certifyUp = false;
  try {
    const certifyMeta = await CertifyService.getWellKnownIssuer();
    certifyUp = !!certifyMeta?.credential_configurations_supported;
  } catch {
    certifyUp = false;
  }

  let mimotoUp = false;
  try {
    const issuers = await MimotoService.getIssuers();
    mimotoUp = (issuers?.response?.issuers?.length || 0) > 0;
  } catch {
    mimotoUp = false;
  }

  let verifyUp = false;
  try {
    const verifyDid = await VerifyService.getDidDocument();
    verifyUp = !!verifyDid?.id;
  } catch {
    verifyUp = false;
  }

  const coverage = {
    upstreamApi: requirements.filter(item => item.scope === 'UPSTREAM_API' && item.passed).length,
    localReference: requirements.filter(item => item.scope === 'LOCAL_REFERENCE' && item.passed).length,
    walletPresentation: requirements.filter(item => item.scope === 'WALLET_PRESENTATION' && item.passed).length,
    upstreamApiTotal: requirements.filter(item => item.scope === 'UPSTREAM_API').length,
    localReferenceTotal: requirements.filter(item => item.scope === 'LOCAL_REFERENCE').length,
    walletPresentationTotal: requirements.filter(item => item.scope === 'WALLET_PRESENTATION').length,
    total: requirements.length,
    note: 'These are executable probes, not a formal standards certification. Local reference checks do not establish MOSIP wallet interoperability.'
  };
  const report = {
    timestamp: new Date().toISOString(),
    overallScore: Math.round((passedReqs / totalReqs) * 100),
    systemIntegrity: {
      certify: certifyUp ? 'UP' : 'DOWN',
      mimoto: mimotoUp ? 'UP' : 'DOWN',
      verify: verifyUp ? 'UP' : 'DOWN'
    },
    summaries,
    requirements,
    coverage
  };
  try {
    AuditStore.append({ id: crypto.randomUUID(), timestamp: report.timestamp,
      overallScore: report.overallScore, passed: passedReqs, total: totalReqs,
      coverage, requirements });
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: `Audit executed but could not persist its report: ${error.message}`, report });
  }
});

router.get('/report/history', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const after = typeof req.query.after === 'string' ? Date.parse(req.query.after) : NaN;
    const before = typeof req.query.before === 'string' ? Date.parse(req.query.before) : NaN;
    const runs = AuditStore.read().filter(run =>
      (Number.isNaN(after) || Date.parse(run.timestamp) >= after) &&
      (Number.isNaN(before) || Date.parse(run.timestamp) <= before));
    res.json({ totalRuns: runs.length, runs: runs.slice(0, limit).map(({ requirements, ...summary }) => summary) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/report/export', (req, res) => {
  try {
    const runs = AuditStore.read();
    const format = req.query.format === 'md' ? 'md' : 'json';
    res.attachment(`inji-standards-audit.${format}`);
    if (format === 'json') return res.json({ exportedAt: new Date().toISOString(), runs });
    res.type('text/markdown').send([
      '# Inji Standards Audit History', '',
      'Executable probes only; this is not formal certification. Upstream API, local reference, and wallet presentation scopes are recorded separately.', '',
      '| Time | Score | Passed | Upstream API | Local Reference | Wallet Presentation |',
      '|---|---:|---:|---:|---:|---:|',
      ...runs.map(run => `| ${run.timestamp} | ${run.overallScore}% | ${run.passed}/${run.total} | ${run.coverage.upstreamApi} | ${run.coverage.localReference} | ${run.coverage.walletPresentation} |`),
      '',
      ...runs.flatMap(run => [
        `## ${run.timestamp} (${run.passed}/${run.total})`, '',
        ...run.requirements.map(check => `- ${check.passed ? 'PASS' : 'FAIL'} ${check.id} [${check.scope}]: ${check.failureReason || 'Assertion satisfied'}`), ''
      ])
    ].join('\n'));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run live real cryptographic matrix test suite
router.post('/matrix/run', async (_req, res) => {
  const startTime = Date.now();
  const results: MatrixRunResult[] = [];

  const testMatrix: Array<{
    issuer: IssuerImplementation;
    wallet: WalletImplementation;
    verifier: VerifierImplementation;
    format: CredentialFormat;
    attackVector: TamperAttackVector;
    expected: 'SUCCESS' | 'REJECT';
    scenarioDescription: string;
  }> = [
    // The executionMode field distinguishes full reference-wallet protocols from direct API checks.
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'MOCK_EXTERNAL_WALLET',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'End-to-end OpenID4VP flow: Inji Certify issues a W3C VC, the local reference wallet signs a nonce-bound VP, and Inji Verify processes the presentation.'
    },
    // 2. Direct Certify VC verification; no mobile transport is exercised.
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'NOT_EXERCISED',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'Direct API check: Certify VC verified by Inji Verify; mobile QR and OpenID4VP presentation are not exercised.'
    },
    // 3. External Mock OID4VCI ➔ direct API ➔ Inji Verify (SD-JWT VC Clean)
    {
      issuer: 'MOCK_EXTERNAL_OID4VCI',
      wallet: 'NOT_EXERCISED',
      verifier: 'INJI_VERIFY',
      format: 'vc+sd-jwt',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'Direct API check: External SD-JWT VC issued with salts and verified by Inji Verify; no wallet presentation is exercised.'
    },
    // 4. External Mock OID4VCI ➔ External Wallet ➔ External OID4VP Verifier (SD-JWT VC Clean)
    {
      issuer: 'MOCK_EXTERNAL_OID4VCI',
      wallet: 'MOCK_EXTERNAL_WALLET',
      verifier: 'MOCK_EXTERNAL_OID4VP',
      format: 'vc+sd-jwt',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'Local protocol test: wallet receives SD-JWT through OpenID4VCI and presents a nonce-bound SD-JWT VP to the mock OpenID4VP verifier.'
    },
    // 5. Direct Certify VC submission to local verifier; no Inji Web wallet is exercised.
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'NOT_EXERCISED',
      verifier: 'MOCK_EXTERNAL_OID4VP',
      format: 'ldp_vc',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'Cross-issuer check: Inji Certify VC submitted directly to the local verifier implementation.'
    },
    // 6. Mock mDoc issuance and local cryptographic verification (the upstream Inji Verify API does not accept mDoc)
    {
      issuer: 'MOCK_EXTERNAL_OID4VCI',
      wallet: 'NOT_EXERCISED',
      verifier: 'MOCK_EXTERNAL_OID4VP',
      format: 'mso_mdoc',
      attackVector: 'NONE',
      expected: 'SUCCESS',
      scenarioDescription: 'Local reference crypto check: mock issuer issues canonical CBOR MSO and COSE_Sign1; local verifier checks signature, digests, and validity. DeviceResponse/OpenID4VP is not exercised.'
    },
    // 7. Security Test: Inji Certify ➔ Inji Verify (INVALID_SIGNATURE)
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'NOT_EXERCISED',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'INVALID_SIGNATURE',
      expected: 'REJECT',
      scenarioDescription: 'Attack Test: Mutated signature bytes submitted; verifier must mathematically reject.'
    },
    // 8. Security Test: Inji Certify ➔ Inji Verify (EXPIRED_CREDENTIAL)
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'NOT_EXERCISED',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'EXPIRED_CREDENTIAL',
      expected: 'REJECT',
      scenarioDescription: 'Attack Test: Temporal validation boundary; verifier must reject expired credential.'
    },
    // 9. Security Test: External SD-JWT ➔ Local Reference Wallet ➔ Mock OID4VP Verifier
    {
      issuer: 'MOCK_EXTERNAL_OID4VCI',
      wallet: 'MOCK_EXTERNAL_WALLET',
      verifier: 'MOCK_EXTERNAL_OID4VP',
      format: 'vc+sd-jwt',
      attackVector: 'CORRUPTED_DISCLOSURE',
      expected: 'REJECT',
      scenarioDescription: 'Protocol security test: corrupted SD-JWT disclosure is presented through OpenID4VP; verifier must reject the signed digest mismatch.'
    },
    // 10. Security Test: W3C JSON-LD ➔ Inji Verify (ALTERED_CLAIMS)
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'NOT_EXERCISED',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'ALTERED_CLAIMS',
      expected: 'REJECT',
      scenarioDescription: 'Attack Test: Modified subject name without private key breaks canonicalized digest.'
    },
    {
      issuer: 'INJI_CERTIFY',
      wallet: 'MOCK_EXTERNAL_WALLET',
      verifier: 'INJI_VERIFY',
      format: 'ldp_vc',
      attackVector: 'MISMATCHED_NONCE',
      expected: 'REJECT',
      scenarioDescription: 'Local gateway defense: reject a signed W3C VP whose holder proof challenge differs from the active Inji Verify request nonce.'
    }
  ];

  for (let i = 0; i < testMatrix.length; i++) {
    const item = testMatrix[i];
    const itemStart = Date.now();
    let issuanceSuccess = false;

    try {
      // Step 1: Real Cryptographic Issuance
      let vc;
      if (item.issuer === 'MOCK_EXTERNAL_OID4VCI') {
        vc = await LocalWalletService.obtainMockCredential({
          format: item.format,
          subjectData: { fullName: 'Interop Test Subject', uin: '88392019' }
        });
      } else {
        vc = await CertifyService.issueCredential({
          credentialType: item.format === 'mso_mdoc' ? 'MockMdl' : 'FarmerCredential',
          format: item.format
        });
      }
      issuanceSuccess = true;

      // Step 2: Apply Real Physical Mutation (if attack vector requested)
      let credentialToVerify = vc;
      if (item.attackVector !== 'NONE' && item.attackVector !== 'MISMATCHED_NONCE') {
        const mutation = CredentialTamperEngine.mutate(vc, item.attackVector);
        credentialToVerify = mutation.tamperedCredential;
      }

      // Step 3: Run Blind Mathematical Verification (Verifier has NO tamper flags!)
      let verifyRes;
      if (item.attackVector === 'MISMATCHED_NONCE' && item.verifier === 'INJI_VERIFY') {
        try {
          verifyRes = await LocalWalletService.presentToInjiVerify(vc, 'MISMATCHED_NONCE');
        } catch (error: any) {
          if (error.nonceRejected !== true) throw error;
          verifyRes = { valid: false, rejectionLayer: error.rejectionLayer,
            error: error.message, cryptographicCheck: { message: 'Gateway rejected holder proof challenge mismatch before upstream submission' } };
        }
      } else if (i === 0) {
        verifyRes = await LocalWalletService.presentToInjiVerify(vc);
      } else if (item.issuer === 'MOCK_EXTERNAL_OID4VCI' && item.wallet === 'MOCK_EXTERNAL_WALLET' &&
          item.verifier === 'MOCK_EXTERNAL_OID4VP' && item.format === 'vc+sd-jwt') {
        verifyRes = await LocalWalletService.presentSDJWTToMockVerifier(credentialToVerify,
          item.attackVector as 'NONE' | 'MISMATCHED_NONCE' | 'INVALID_SIGNATURE' | 'CORRUPTED_DISCLOSURE');
      } else if (item.verifier === 'MOCK_EXTERNAL_OID4VP') {
        verifyRes = await MockExternalService.verifyPresentation(credentialToVerify);
      } else {
        verifyRes = await VerifyService.verifyVC(credentialToVerify);
      }

      const actual: 'SUCCESS' | 'REJECT' = verifyRes.valid ? 'SUCCESS' : 'REJECT';
      const passed = actual === item.expected;

      const record: MatrixRunResult = {
        id: `run_${Date.now()}_${i}`,
        issuer: item.issuer,
        wallet: item.wallet,
        verifier: item.verifier,
        format: item.format,
        proofType: item.format === 'vc+sd-jwt' ? `${MockExternalService.getSDJWTSigningKey().algorithm} SD-JWT / KB-JWT` :
          item.format === 'mso_mdoc' ? 'COSE_Sign1' : (vc.proof?.type || 'Unknown'),
        tamperScenario: item.attackVector,
        executionMode: i === 0 || item.attackVector === 'MISMATCHED_NONCE' ? 'LOCAL_REFERENCE_WALLET_OID4VP' :
          item.format === 'mso_mdoc' ? 'LOCAL_REFERENCE_CRYPTO' :
          item.issuer === 'MOCK_EXTERNAL_OID4VCI' && item.wallet === 'MOCK_EXTERNAL_WALLET' &&
          item.verifier === 'MOCK_EXTERNAL_OID4VP' && item.format === 'vc+sd-jwt'
          ? 'LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP' : 'DIRECT_API',
        issuanceSuccess: true,
        verificationSuccess: verifyRes.valid,
        expectedOutcome: item.expected,
        actualOutcome: actual,
        passed,
        latencyMs: Date.now() - itemStart,
        errorDetail: verifyRes.valid ? undefined :
          safeMatrixDiagnostic(verifyRes.cryptographicCheck?.message ||
            verifyRes.verifierResult?.vcResults?.[0]?.error || verifyRes.error) ||
          (verifyRes.verifierResult
            ? `VP result ${verifyRes.verifierResult.vpResultStatus || 'UNKNOWN'}; credential statuses: ${
              (verifyRes.verifierResult.vcResults || []).map((entry: any) => entry.verificationStatus || 'UNKNOWN').join(', ') || 'none'}`
            : undefined),
        timestamp: new Date().toISOString()
      };

      results.push(record);
    } catch (err: any) {
      const record: MatrixRunResult = {
        id: `run_err_${Date.now()}_${i}`,
        issuer: item.issuer,
        wallet: item.wallet,
        verifier: item.verifier,
        format: item.format,
        proofType: 'Unknown',
        tamperScenario: item.attackVector,
        executionMode: i === 0 || item.attackVector === 'MISMATCHED_NONCE' ? 'LOCAL_REFERENCE_WALLET_OID4VP' :
          item.format === 'mso_mdoc' ? 'LOCAL_REFERENCE_CRYPTO' :
          item.issuer === 'MOCK_EXTERNAL_OID4VCI' && item.wallet === 'MOCK_EXTERNAL_WALLET' &&
          item.verifier === 'MOCK_EXTERNAL_OID4VP' && item.format === 'vc+sd-jwt'
          ? 'LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP' : 'DIRECT_API',
        issuanceSuccess,
        verificationSuccess: false,
        expectedOutcome: item.expected,
        actualOutcome: 'ERROR',
        passed: false,
        latencyMs: Date.now() - itemStart,
        errorDetail: safeMatrixDiagnostic(err.message) || 'Protocol execution failed; see service logs',
        timestamp: new Date().toISOString()
      };
      results.push(record);
    }
  }

  const passedTotal = results.filter(r => r.passed).length;
  const walletTransportExercised = results.some(r => r.executionMode?.startsWith('LOCAL_REFERENCE_WALLET_'));
  const coverage = walletTransportExercised
    ? 'API_AND_LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP'
    : 'ISSUER_AND_VERIFIER_API_ONLY';
  try {
    RunStore.append(results);
  } catch (err: any) {
    return res.status(500).json({ error: `Matrix completed but history could not be saved: ${err.message}`, results });
  }

  res.json({
    coverage,
    walletTransportExercised,
    totalTests: results.length,
    passedTotal,
    failedTotal: results.length - passedTotal,
    matrixSuccessRate: Math.round((passedTotal / results.length) * 100),
    durationTotalMs: Date.now() - startTime,
    results
  });
});

router.get('/matrix/history', (_req, res) => {
  try {
    const runs = RunStore.read();
    res.json({ totalRuns: runs.length, runs: runs.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/matrix/export', (req, res) => {
  try {
    const runs = RunStore.read();
    const format = req.query.format === 'md' ? 'md' : 'json';
    res.attachment(`inji-matrix-history.${format}`);
    const walletTransportExercised = runs.some(r => r.executionMode?.startsWith('LOCAL_REFERENCE_WALLET_'));
    const coverage = walletTransportExercised ? 'MIXED_API_AND_LOCAL_REFERENCE_WALLET' : 'ISSUER_AND_VERIFIER_API_ONLY';
    if (format === 'json') return res.json({ exportedAt: new Date().toISOString(), coverage, walletTransportExercised, runs });
    res.type('text/markdown').send([
      '# Inji API Matrix History',
      '',
      `Coverage: ${walletTransportExercised ? 'includes local reference-wallet OpenID4VP transport and the mock SD-JWT OpenID4VCI/OpenID4VP flow; Inji Web and mobile transport are not exercised.' : 'issuer and verifier APIs only; wallet transport and OpenID4VP presentation are not exercised.'}`,
      '',
      '| Time | Issuer | Wallet selection | Verifier | Format | Mode | Attack | Issued | Actual | Pass | Error |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...runs.map(r => `| ${r.timestamp} | ${r.issuer} | ${r.wallet} | ${r.verifier} | ${r.format} | ${r.executionMode || 'DIRECT_API'} | ${r.tamperScenario} | ${r.issuanceSuccess} | ${r.actualOutcome} | ${r.passed} | ${(r.errorDetail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)
    ].join('\n'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
