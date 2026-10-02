import { Router } from 'express';
import { VerifyService } from '../services/verify.service';
import { MockExternalService } from '../services/mock-external.service';
import { CredentialTamperEngine, TamperAttackVector } from '../domain/tamper';
import { VerifierImplementation } from '../types';

const router = Router();

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

router.get('/vp-request/:requestId/jwt', async (req, res) => {
  try {
    const jwt = await VerifyService.getVPRequestJwt(req.params.requestId);
    res.json({ jwt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
