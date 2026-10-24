import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { resolveDidJwkKey, verifyPresentation } from './vp-verifier';
import { verifyIndependentVP } from '../services/independent-vp.service';

const jsonld: any = require('jsonld');
const credentialsContext: any = require('@digitalbazaar/credentials-context');
const ed25519SuiteContext: any = require('@digitalbazaar/ed25519-signature-2020').suiteContext;
const { FARMER_CONTEXT, FARMER_CONTEXT_URL } = require('../context/farmer');
const context = {
  '@version': 1.1, id: '@id', type: '@type',
  VerifiablePresentation: 'https://www.w3.org/2018/credentials#VerifiablePresentation',
  VerifiableCredential: 'https://www.w3.org/2018/credentials#VerifiableCredential',
  JsonWebSignature2020: 'https://w3id.org/security#JsonWebSignature2020',
  TestIssuerProof: 'https://example.org/TestIssuerProof',
  proof: { '@id': 'https://w3id.org/security#proof', '@type': '@id', '@container': '@graph' },
  holder: { '@id': 'https://www.w3.org/2018/credentials#holder', '@type': '@id' },
  verificationMethod: { '@id': 'https://w3id.org/security#verificationMethod', '@type': '@id' },
  verifiableCredential: { '@id': 'https://www.w3.org/2018/credentials#verifiableCredential', '@type': '@id' },
  issuer: { '@id': 'https://www.w3.org/2018/credentials#issuer', '@type': '@id' },
  credentialSubject: { '@id': 'https://www.w3.org/2018/credentials#credentialSubject', '@type': '@id' },
  challenge: 'https://w3id.org/security#challenge',
  domain: 'https://w3id.org/security#domain',
  proofPurpose: 'https://w3id.org/security#proofPurpose'
};

async function signedFixture(credentialHasProof = true, includeProofPurpose = true,
  mismatchedSubject = false, useIssuedFarmerContexts = false): Promise<any> {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicJwk = keys.publicKey.export({ format: 'jwk' });
  const did = `did:jwk:${Buffer.from(JSON.stringify(publicJwk)).toString('base64url')}`;
  const otherJwk = mismatchedSubject
    ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' }) : null;
  const subjectDid = otherJwk
    ? `did:jwk:${Buffer.from(JSON.stringify(otherJwk)).toString('base64url')}` : did;
  const method = `${did}#0#0`;
  const credential: any = useIssuedFarmerContexts ? {
    '@context': [
      'https://www.w3.org/2018/credentials/v1', FARMER_CONTEXT_URL,
      ed25519SuiteContext.CONTEXT_URL
    ],
    id: 'urn:fixture:credential',
    type: ['VerifiableCredential', 'FarmerCredential'],
    issuer: 'did:web:issuer.example',
    issuanceDate: '2026-10-24T08:52:52.103Z',
    expirationDate: '2028-10-23T08:52:52.103Z',
    credentialSubject: { id: `${subjectDid}#0`, fullName: 'Fixture Farmer', farmerID: 'fixture-id' }
  } : {
    '@context': [context], id: 'urn:fixture:credential',
    type: 'VerifiableCredential', issuer: 'did:example:issuer',
    credentialSubject: { id: `${subjectDid}#0` }
  };
  if (credentialHasProof) credential.proof = useIssuedFarmerContexts ? {
    type: 'Ed25519Signature2020', created: '2026-10-24T08:52:52Z',
    proofPurpose: 'assertionMethod', verificationMethod: 'did:web:issuer.example#key-1',
    proofValue: 'zFixtureProofValue'
  } : { type: 'TestIssuerProof' };
  const vp: any = {
    '@context': [context], type: 'VerifiablePresentation', holder: method,
    verifiableCredential: [credential]
  };
  const proof: any = {
    type: 'JsonWebSignature2020', verificationMethod: method,
    ...(includeProofPurpose ? { proofPurpose: 'authentication' } : {}),
    challenge: 'fixture-nonce',
    domain: 'did:example:verifier'
  };
  const documentLoader = async (url: string) => {
    const document = url === FARMER_CONTEXT_URL ? FARMER_CONTEXT
      : credentialsContext.contexts.get(url)
      || ed25519SuiteContext.contexts.get(url);
    if (!document) throw new Error(`Unresolvable fixture context: ${url}`);
    return { contextUrl: null, documentUrl: url, document };
  };
  const canonicalizationOptions = {
    algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader
  };
  const proofNQuads = await jsonld.canonize({ '@context': vp['@context'], ...proof }, canonicalizationOptions);
  const docNQuads = await jsonld.canonize(vp, canonicalizationOptions);
  const input = Buffer.concat([
    createHash('sha256').update(proofNQuads).digest(),
    createHash('sha256').update(docNQuads).digest()
  ]);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', b64: false, crit: ['b64'] })).toString('base64url');
  const signature = sign('SHA256', Buffer.concat([Buffer.from(`${header}.`), input]),
    { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  vp.proof = { ...proof, jws: `${header}..${signature}` };
  return vp;
}

test('unchanged double-fragment VP proof and separately accepted VC pass', async () => {
  const vp = await signedFixture();
  let calls = 0;
  const result = await verifyIndependentVP({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier',
    verifyCredential: async () => { calls += 1; return { verificationStatus: 'SUCCESS' }; }
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.vpProofValid, true);
  assert.equal(result.credentialSubjectBindingValid, true);
  assert.equal(result.verificationMethodFragmentCount, 2);
  assert.deepEqual(result.credentialStatuses, ['SUCCESS']);
  assert.equal(calls, 1);
});

test('a signed VP for another credential subject cannot pass holder binding', async () => {
  const result = await verifyIndependentVP({
    vp: await signedFixture(true, false, true),
    expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier',
    verifyCredential: async () => ({ verificationStatus: 'SUCCESS' })
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.vpProofValid, true);
  assert.equal(result.credentialSubjectBindingValid, false);
  assert.deepEqual(result.credentialStatuses, ['SUBJECT_BINDING_FAILED']);
});

test('tagged Inji Mobile proof shape without proofPurpose is cryptographically checked', async () => {
  const vp = await signedFixture(true, false);
  const result = await verifyIndependentVP({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier',
    verifyCredential: async () => ({ verificationStatus: 'SUCCESS' })
  });
  assert.equal(vp.verifiableCredential[0].credentialSubject.id.endsWith('#0'), true);
  assert.equal(vp.proof.verificationMethod.endsWith('#0#0'), true);
  assert.equal(result.status, 'PASS');
  vp.proof.challenge = 'different-nonce';
  assert.equal((await verifyPresentation({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier'
  })).valid, false);
});

test('Inji Mobile VP containing a Farmer VC resolves its pinned issuer contexts', async () => {
  const vp = await signedFixture(true, false, false, true);
  const result = await verifyIndependentVP({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier',
    verifyCredential: async () => ({ verificationStatus: 'SUCCESS' })
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.vpProofValid, true);
  assert.equal(result.credentialSubjectBindingValid, true);
  assert.deepEqual(result.credentialStatuses, ['SUCCESS']);
});

test('a valid holder proof cannot make an unsigned credential pass', async () => {
  const vp = await signedFixture(false);
  let calls = 0;
  const result = await verifyIndependentVP({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier',
    verifyCredential: async () => { calls += 1; return { verificationStatus: 'SUCCESS' }; }
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.vpProofValid, true);
  assert.deepEqual(result.credentialStatuses, ['INVALID']);
  assert.equal(calls, 0);
});

test('tampered holder signature, wrong nonce, and wrong domain fail', async () => {
  const vp = await signedFixture();
  const signature = vp.proof.jws;
  vp.proof.jws = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
  const tampered = await verifyPresentation({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:verifier'
  });
  assert.equal(tampered.valid, false);
  vp.proof.jws = signature;
  assert.equal((await verifyPresentation({
    vp, expectedNonce: 'wrong', expectedDomain: 'did:example:verifier'
  })).valid, false);
  assert.equal((await verifyPresentation({
    vp, expectedNonce: 'fixture-nonce', expectedDomain: 'did:example:wrong'
  })).valid, false);
});

test('credential verifier rejection remains a failed independent result', async () => {
  const result = await verifyIndependentVP({
    vp: await signedFixture(), expectedNonce: 'fixture-nonce',
    expectedDomain: 'did:example:verifier',
    verifyCredential: async () => ({ verificationStatus: 'INVALID' })
  });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.credentialStatuses, ['INVALID']);
});

test('only the known did:jwk key fragments are accepted', async () => {
  const vp = await signedFixture();
  const method = vp.proof.verificationMethod as string;
  assert.throws(() => resolveDidJwkKey(method.replace('#0#0', '#other')));
  assert.throws(() => resolveDidJwkKey(method.replace('#0#0', '#0#other')));
  assert.equal(resolveDidJwkKey(method).fragmentCount, 2);
});
