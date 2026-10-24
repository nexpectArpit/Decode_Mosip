import { Router } from 'express';
import { CertifyService } from '../services/certify.service';
import { MockExternalService } from '../services/mock-external.service';
import { LocalWalletService } from '../services/local-wallet.service';
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

router.get('/.well-known/openid-credential-issuer', (_req, res) => {
  res.json(MockExternalService.getWellKnownMetadata());
});

router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json(MockExternalService.getAuthorizationServerMetadata());
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

router.post('/mobile-offer', async (req, res) => {
  try {
    const { uin, fullName } = req.body || {};
    if (typeof uin !== 'string' || !/^\d{6,16}$/.test(uin) || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ error: 'Enter a 6–16 digit ID and a subject name.' });
    }
    const configuredOrigin = process.env.CERTIFY_PUBLIC_ORIGIN || '';
    if (!configuredOrigin.startsWith('https://')) {
      return res.status(409).json({ error: 'Configure a phone-reachable HTTPS origin for the mobile protocol edge before creating a mobile offer.' });
    }
    const credentialOfferUri = await CertifyService.createMobileCredentialOffer({
      uin, fullName: fullName.trim(), publicIssuerUrl: `${configuredOrigin}/v1/certify`
    });
    res.status(201).json({ credentialOfferUri, expiresInSeconds: 600, issuer: 'INJI_CERTIFY', wallet: 'INJI_MOBILE' });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Unable to create Inji Mobile offer' });
  }
});

// Local external-issuer endpoints used by the reference wallet's actual OpenID4VCI exchange.
router.post('/credential-offer', (req, res) => {
  try {
    const format = req.body?.format as CredentialFormat;
    if (!['ldp_vc', 'vc+sd-jwt', 'mso_mdoc'].includes(format)) {
      return res.status(400).json({ error: 'Unsupported credential format' });
    }
    const offer = MockExternalService.createCredentialOffer({ format, subjectData: req.body?.subjectData || {} });
    res.status(201).json(offer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/credential-offer/:offerId', (req, res) => {
  try {
    res.json(MockExternalService.getCredentialOffer(req.params.offerId));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/oauth/token', (req, res) => {
  const grantType = req.body?.grant_type;
  if (grantType !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  try {
    res.json(MockExternalService.exchangePreAuthorizedCode(req.body?.['pre-authorized_code'] || ''));
  } catch (err: any) {
    res.status(400).json({ error: 'invalid_grant', error_description: err.message });
  }
});

router.post('/credential', (req, res) => {
  const authorization = req.header('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return res.status(401).json({ error: 'invalid_token' });
  try {
    const result = MockExternalService.issueFromToken(accessToken,
      req.body?.format as CredentialFormat, req.body?.proof?.jwt || '');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'invalid_credential_request', error_description: err.message });
  }
});

router.post('/issue', async (req, res) => {
  try {
    const {
      implementation = 'INJI_CERTIFY',
      credentialType = 'FarmerCredential',
      format = 'ldp_vc',
      uin = '9876543210',
      subjectData = {}
    } = req.body;

    if (implementation === 'MOCK_EXTERNAL_OID4VCI') {
      const vc = await LocalWalletService.obtainMockCredential({
        format: format as CredentialFormat,
        subjectData: { ...subjectData, uin }
      });
      return res.json({ success: true, credential: vc });
    }

    const vc = await CertifyService.issueCredential({
      credentialType,
      format: format as CredentialFormat,
      uin,
      subjectData: { ...subjectData, uin }
    });

    res.json({ success: true, credential: vc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
