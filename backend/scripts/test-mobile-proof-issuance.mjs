/**
 * Live, nonpersonal regression for the Inji Mobile alpha issuance proof.
 * The phone sends a signed proof JWT whose kid ends in #0. Certify must sign
 * credentialSubject.id as the base did:jwk, allowing the wallet to append #0
 * once when building its VP proof. This does not exercise a physical wallet.
 */
import crypto from 'node:crypto';

const certify = process.env.CERTIFY_TEST_URL || 'http://127.0.0.1:8091/v1/certify';
const verify = process.env.VERIFY_TEST_URL || 'http://127.0.0.1:8095/v1/verify';
const testId = '9876543210';

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`${new URL(url).pathname} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) {
    throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}: ${JSON.stringify(body).slice(0, 180)}`);
  }
  return body;
}

const issuerMeta = await requestJson(`${certify}/.well-known/openid-credential-issuer`).catch(() => null);
const audience = process.env.CERTIFY_PROOF_AUDIENCE || issuerMeta?.credential_issuer || process.env.CERTIFY_PUBLIC_ORIGIN || 'http://certify-nginx:80';

const preAuth = await requestJson(`${certify}/pre-authorized-data`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    credential_configuration_id: 'FarmerCredential',
    claims: {
      id: testId, fullName: 'Test Holder', mobileNumber: testId,
      dateOfBirth: '1978-08-20', gender: 'Male', state: 'Karnataka',
      district: 'Bangalore', villageOrTown: 'Koramangala', postalCode: '453000',
      landArea: '3 hectares', landOwnershipType: 'Owner',
      primaryCropType: 'Maize', secondaryCropType: 'Rice', face: '', farmerID: testId
    },
    expires_in: 600
  })
});
const offerId = decodeURIComponent(preAuth.credential_offer_uri).split('/').pop();
const offer = await requestJson(`${certify}/credential-offer-data/${offerId}`);
const code = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
const token = await requestJson(`${certify}/oauth/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    'pre-authorized_code': code
  })
});

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...publicKey.export({ format: 'jwk' }), use: 'sig' };
const did = `did:jwk:${Buffer.from(JSON.stringify(jwk)).toString('base64url')}`;
const header = { alg: 'ES256', typ: 'openid4vci-proof+jwt', kid: `${did}#0` };
const now = Math.floor(Date.now() / 1000);
const payload = { aud: audience, nonce: token.c_nonce, iat: now, exp: now + 600 };
const input = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
const signer = crypto.createSign('SHA256');
signer.update(input);
const jwt = `${input}.${signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
const issued = await requestJson(`${certify}/issuance/credential`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token.access_token}` },
  body: JSON.stringify({
    format: 'ldp_vc',
    credential_definition: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'FarmerCredential']
    },
    proof: { proof_type: 'jwt', jwt }
  })
});
const vc = issued.credential;
const valid = await requestJson(`${verify}/vc-verification`, {
  method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(vc)
});
const tamperedVc = structuredClone(vc);
tamperedVc.credentialSubject.fullName = 'Tampered Holder';
const tampered = await requestJson(`${verify}/vc-verification`, {
  method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(tamperedVc)
});
const result = {
  subjectMatchesBaseDid: vc.credentialSubject?.id === did,
  subjectFragmentCount: (vc.credentialSubject?.id.match(/#/g) || []).length,
  issuerProofPresent: Boolean(vc.proof),
  signedCredentialStatus: valid.verificationStatus,
  tamperedCredentialStatus: tampered.verificationStatus
};
console.log(JSON.stringify(result));
if (!result.subjectMatchesBaseDid || !result.issuerProofPresent ||
    result.signedCredentialStatus !== 'SUCCESS' || result.tamperedCredentialStatus === 'SUCCESS') {
  process.exitCode = 1;
}
