import * as crypto from 'crypto';
import * as cbor from 'cbor';
import { Ed25519Crypto, Ed25519KeyPair } from './ed25519';

export interface MDocItem {
  digestID: number;
  random: Buffer;
  elementIdentifier: string;
  elementValue: any;
  encodedItemBytes: Buffer;
  digest: Buffer;
}

export interface MDocIssuanceResult {
  docType: string;
  issuerAuthCose: Buffer;
  nameSpaces: Record<string, Buffer[]>;
  mso: Record<string, any>;
  rawCborHex: string;
  issuerDid: string;
}

export interface MDocVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  digestsValid: boolean;
  notExpired: boolean;
  issuerDid: string;
  docType: string;
  claims: Record<string, any>;
  errorMessage?: string;
}

export class MDocCrypto {
  /**
   * Encodes a single IssuerSignedItem per ISO/IEC 18013-5 Section 9.1.2.4:
   * IssuerSignedItem = {
   *   digestID: uint,
   *   random: bstr,
   *   elementIdentifier: tstr,
   *   elementValue: any
   * }
   */
  public static createIssuerSignedItem(digestID: number, elementIdentifier: string, elementValue: any): MDocItem {
    const random = crypto.randomBytes(16);
    const itemMap = new Map<string, any>([
      ['digestID', digestID],
      ['random', random],
      ['elementIdentifier', elementIdentifier],
      ['elementValue', elementValue]
    ]);

    // CBOR encode the item
    const encodedItemBytes = cbor.encodeCanonical(itemMap);
    // SHA-256 digest
    const digest = crypto.createHash('sha256').update(encodedItemBytes).digest();

    return {
      digestID,
      random,
      elementIdentifier,
      elementValue,
      encodedItemBytes,
      digest
    };
  }

  /**
   * Issues an authentic ISO/IEC 18013-5 compliant mDoc with MobileSecurityObject (MSO) and COSE_Sign1.
   */
  public static issueMDoc(params: {
    issuerKeyPair: Ed25519KeyPair;
    docType?: string;
    validityDays?: number;
    claims: Record<string, any>;
  }): MDocIssuanceResult {
    const docType = params.docType || 'org.iso.18013.5.1.mDL';
    const namespace = 'org.iso.18013.5.1';

    const items: MDocItem[] = [];
    const valueDigestsMap = new Map<number, Buffer>();

    let digestID = 0;
    for (const [key, value] of Object.entries(params.claims)) {
      const item = this.createIssuerSignedItem(digestID, key, value);
      items.push(item);
      valueDigestsMap.set(digestID, item.digest);
      digestID++;
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + (params.validityDays || 365) * 24 * 3600 * 1000);

    // MobileSecurityObject (MSO) per ISO/IEC 18013-5 Section 9.1.2.4
    const mso = {
      version: '1.0',
      digestAlgorithm: 'SHA-256',
      docType,
      valueDigests: {
        [namespace]: Object.fromEntries(valueDigestsMap)
      },
      validityInfo: {
        signed: now.toISOString(),
        validFrom: now.toISOString(),
        validUntil: expiry.toISOString()
      },
      issuerDid: params.issuerKeyPair.did
    };

    const msoPayloadBytes = cbor.encodeCanonical(mso);

    // COSE_Sign1 structure:
    // [ protected: bstr, unprotected: map, payload: bstr, signature: bstr ]
    // Protected header: { 1: -8 } (alg: EdDSA / Ed25519)
    const protectedHeaderMap = new Map<number, number>([[1, -8]]);
    const protectedHeaderBytes = cbor.encodeCanonical(protectedHeaderMap);
    const unprotectedHeaderMap = new Map<number, any>([[4, Buffer.from(params.issuerKeyPair.did)]]);

    // Sig_structure = [ "Signature1", protectedHeaderBytes, external_aad: bstr empty, msoPayloadBytes ]
    const sigStructure = ['Signature1', protectedHeaderBytes, Buffer.alloc(0), msoPayloadBytes];
    const toBeSignedBytes = cbor.encodeCanonical(sigStructure);

    // Cryptographic signature
    const signatureBytes = Ed25519Crypto.sign(toBeSignedBytes, params.issuerKeyPair.privateKeyObject);

    // COSE_Sign1 array
    const coseSign1 = [protectedHeaderBytes, unprotectedHeaderMap, msoPayloadBytes, signatureBytes];
    const issuerAuthCose = cbor.encodeCanonical(new cbor.Tagged(18, coseSign1)); // Tag 18 is COSE_Sign1

    const nameSpaces: Record<string, Buffer[]> = {
      [namespace]: items.map(i => i.encodedItemBytes)
    };

    const fullMDocStructure = {
      docType,
      issuerSigned: {
        nameSpaces,
        issuerAuth: issuerAuthCose
      }
    };

    const rawCbor = cbor.encodeCanonical(fullMDocStructure);

    return {
      docType,
      issuerAuthCose,
      nameSpaces,
      mso,
      rawCborHex: rawCbor.toString('hex'),
      issuerDid: params.issuerKeyPair.did
    };
  }

  /**
   * Verifies an authentic ISO/IEC 18013-5 mDoc:
   * 1. Decodes and verifies the COSE_Sign1 signature over the MSO using Issuer public key.
   * 2. Validates MSO temporal validity (validFrom, validUntil).
   * 3. For every presented IssuerSignedItem, computes SHA-256 and matches against MSO valueDigests.
   */
  public static verifyMDoc(
    rawCborOrStructure: any,
    issuerPublicKey: crypto.KeyObject
  ): MDocVerificationResult {
    try {
      let doc: any = rawCborOrStructure;
      if (Buffer.isBuffer(rawCborOrStructure)) {
        doc = cbor.decodeFirstSync(rawCborOrStructure);
      } else if (typeof rawCborOrStructure === 'string') {
        doc = cbor.decodeFirstSync(Buffer.from(rawCborOrStructure, 'hex'));
      }

      if (!doc?.issuerSigned?.issuerAuth) {
        return {
          valid: false,
          signatureValid: false,
          digestsValid: false,
          notExpired: false,
          issuerDid: '',
          docType: doc?.docType || 'unknown',
          claims: {},
          errorMessage: 'Missing issuerSigned.issuerAuth in mDoc structure.'
        };
      }

      let unpackedAuth = doc.issuerSigned.issuerAuth;
      if (Buffer.isBuffer(unpackedAuth)) {
        unpackedAuth = cbor.decodeFirstSync(unpackedAuth);
      }
      const coseArray = unpackedAuth instanceof cbor.Tagged ? unpackedAuth.value : unpackedAuth;

      if (!Array.isArray(coseArray) || coseArray.length !== 4) {
        return {
          valid: false,
          signatureValid: false,
          digestsValid: false,
          notExpired: false,
          issuerDid: '',
          docType: doc.docType,
          claims: {},
          errorMessage: 'Invalid COSE_Sign1 structure: expected 4-element array.'
        };
      }

      const [protectedHeaderBytes, , msoPayloadBytes, signatureBytes] = coseArray;

      // 1. Verify COSE_Sign1 signature
      const sigStructure = ['Signature1', protectedHeaderBytes, Buffer.alloc(0), msoPayloadBytes];
      const toBeSignedBytes = cbor.encodeCanonical(sigStructure);

      const signatureValid = Ed25519Crypto.verify(toBeSignedBytes, signatureBytes, issuerPublicKey);
      if (!signatureValid) {
        return {
          valid: false,
          signatureValid: false,
          digestsValid: false,
          notExpired: false,
          issuerDid: '',
          docType: doc.docType,
          claims: {},
          errorMessage: 'COSE_Sign1 signature verification failed against issuer public key.'
        };
      }

      // 2. Decode and check MSO
      const mso = cbor.decodeFirstSync(msoPayloadBytes);
      const now = new Date().getTime();
      const validUntil = new Date(mso.validityInfo?.validUntil).getTime();
      const notExpired = now <= validUntil;

      if (!notExpired) {
        return {
          valid: false,
          signatureValid: true,
          digestsValid: false,
          notExpired: false,
          issuerDid: mso.issuerDid || '',
          docType: doc.docType,
          claims: {},
          errorMessage: `mDoc expired on ${mso.validityInfo?.validUntil}.`
        };
      }

      // 3. Verify digests in namespaces
      const namespace = 'org.iso.18013.5.1';
      const msoDigests = mso.valueDigests?.[namespace] || {};
      const presentedItems = doc.issuerSigned.nameSpaces?.[namespace] || [];
      const claims: Record<string, any> = {};

      for (const itemBytes of presentedItems) {
        const itemBuffer = Buffer.isBuffer(itemBytes) ? itemBytes : Buffer.from(itemBytes);
        const computedDigest = crypto.createHash('sha256').update(itemBuffer).digest();

        const decodedItem = cbor.decodeFirstSync(itemBuffer);
        const itemMap = decodedItem instanceof Map ? decodedItem : new Map(Object.entries(decodedItem));

        const digestID = itemMap.get('digestID');
        const expectedDigest = msoDigests[digestID];

        if (!expectedDigest || !computedDigest.equals(Buffer.from(expectedDigest))) {
          return {
            valid: false,
            signatureValid: true,
            digestsValid: false,
            notExpired: true,
            issuerDid: mso.issuerDid || '',
            docType: doc.docType,
            claims: {},
            errorMessage: `Value digest mismatch for digestID ${digestID}: element has been tampered with.`
          };
        }

        const elementIdentifier = itemMap.get('elementIdentifier');
        const elementValue = itemMap.get('elementValue');
        claims[elementIdentifier] = elementValue;
      }

      return {
        valid: true,
        signatureValid: true,
        digestsValid: true,
        notExpired: true,
        issuerDid: mso.issuerDid || '',
        docType: doc.docType,
        claims
      };
    } catch (err: any) {
      return {
        valid: false,
        signatureValid: false,
        digestsValid: false,
        notExpired: false,
        issuerDid: '',
        docType: 'unknown',
        claims: {},
        errorMessage: `mDoc CBOR verification error: ${err.message}`
      };
    }
  }
}
