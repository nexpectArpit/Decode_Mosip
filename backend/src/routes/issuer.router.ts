import { Router } from 'express';
import { CertifyService } from '../services/certify.service';
import { MockExternalService } from '../services/mock-external.service';
import { IssuerImplementation, CredentialFormat } from '../types';

const router = Router();

router.get('/well-known', async (req, res) => {
  try {
    const impl = (req.query.implementation as IssuerImplementation) || 'INJI_CERTIFY';
    if (impl === 'MOCK_EXTERNAL_OID4VCI') {
      return res.json(MockExternalService.getWellKnownMetadata());
    }
    const metadata = await CertifyService.getWellKnownIssuer();
    res.json(metadata);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/did', async (req, res) => {
  try {
    const impl = (req.query.implementation as IssuerImplementation) || 'INJI_CERTIFY';
    if (impl === 'MOCK_EXTERNAL_OID4VCI') {
      return res.json({ id: MockExternalService.issuerKeyPair.did });
    }
    const didDoc = await CertifyService.getDidDocument();
    res.json(didDoc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/issue', async (req, res) => {
  try {
    const {
      implementation = 'INJI_CERTIFY',
      credentialType = 'FarmerCredential',
      format = 'ldp_vc',
      uin = '9876543210',
      holderDid,
      subjectData = {}
    } = req.body;

    if (implementation === 'MOCK_EXTERNAL_OID4VCI') {
      const vc = MockExternalService.issueCredential({
        format: format as CredentialFormat,
        holderDid: holderDid || 'did:key:z6MkqFLQZ83XN',
        subjectData: { ...subjectData, uin }
      });
      return res.json({ success: true, credential: vc });
    }

    const vc = await CertifyService.issueCredential({
      credentialType,
      format: format as CredentialFormat,
      uin,
      holderDid
    });

    res.json({ success: true, credential: vc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
