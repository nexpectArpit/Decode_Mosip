import * as crypto from 'crypto';
import bs58 from 'bs58';

export interface Ed25519KeyPair {
  publicKeyBytes: Buffer;      // 32-byte raw public key
  privateKeyBytes: Buffer;     // 32-byte or 64-byte raw private key
  publicKeyMultibase: string;  // Multibase base58btc (starts with 'z6Mk...')
  did: string;                 // did:key:z6Mk...
  publicKeyObject: crypto.KeyObject;
  privateKeyObject: crypto.KeyObject;
}

// Multicodec prefix for ed25519-pub is 0xed01 (varint [0xed, 0x01])
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

export class Ed25519Crypto {
  /**
   * Generates a genuine cryptographically secure Ed25519 keypair.
   */
  public static generateKeyPair(): Ed25519KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

    // Export raw 32 bytes
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    // SPKI DER for Ed25519 has a 12-byte header, followed by 32 bytes of raw public key
    const publicKeyBytes = publicKeyDer.subarray(publicKeyDer.length - 32);

    const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });
    // PKCS#8 DER for Ed25519 has a 16-byte header, followed by 32 bytes of raw seed
    const privateKeyBytes = privateKeyDer.subarray(privateKeyDer.length - 32);

    // Multicodec: prefix [0xed, 0x01] + 32-byte public key
    const prefixedPub = Buffer.concat([ED25519_MULTICODEC_PREFIX, publicKeyBytes]);
    const publicKeyMultibase = 'z' + bs58.encode(prefixedPub);
    const did = `did:key:${publicKeyMultibase}`;

    return {
      publicKeyBytes,
      privateKeyBytes,
      publicKeyMultibase,
      did,
      publicKeyObject: publicKey,
      privateKeyObject: privateKey
    };
  }

  /**
   * Imports an Ed25519 keypair from a seed or raw private key bytes.
   */
  public static fromSeed(seed: Buffer): Ed25519KeyPair {
    if (seed.length !== 32) {
      throw new Error(`Seed must be exactly 32 bytes, got ${seed.length}`);
    }

    // Wrap raw seed into PKCS#8 DER format for Ed25519
    // PKCS#8 header: 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 + 32-byte seed
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Header, seed]);

    const privateKeyObject = crypto.createPrivateKey({
      key: pkcs8Der,
      format: 'der',
      type: 'pkcs8'
    });

    const publicKeyObject = crypto.createPublicKey(privateKeyObject);
    const publicKeyDer = publicKeyObject.export({ type: 'spki', format: 'der' });
    const publicKeyBytes = publicKeyDer.subarray(publicKeyDer.length - 32);

    const prefixedPub = Buffer.concat([ED25519_MULTICODEC_PREFIX, publicKeyBytes]);
    const publicKeyMultibase = 'z' + bs58.encode(prefixedPub);
    const did = `did:key:${publicKeyMultibase}`;

    return {
      publicKeyBytes,
      privateKeyBytes: seed,
      publicKeyMultibase,
      did,
      publicKeyObject,
      privateKeyObject
    };
  }

  /**
   * Signs data using the Ed25519 private key.
   */
  public static sign(data: Buffer | string, privateKey: crypto.KeyObject): Buffer {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    return crypto.sign(null, dataBuffer, privateKey);
  }

  /**
   * Verifies data signature using the Ed25519 public key.
   */
  public static verify(data: Buffer | string, signature: Buffer, publicKey: crypto.KeyObject): boolean {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    try {
      return crypto.verify(null, dataBuffer, publicKey, signature);
    } catch {
      return false;
    }
  }

  /**
   * Parses a multibase public key string (e.g. z6Mkk...) and returns a crypto.KeyObject.
   */
  public static publicKeyFromMultibase(multibaseStr: string): crypto.KeyObject {
    if (!multibaseStr.startsWith('z')) {
      throw new Error(`Expected multibase base58btc string starting with 'z', got '${multibaseStr}'`);
    }

    const decoded = Buffer.from(bs58.decode(multibaseStr.slice(1)));
    let rawPub: Buffer;

    if (decoded[0] === 0xed && decoded[1] === 0x01) {
      // Strips the 2-byte multicodec header
      rawPub = decoded.subarray(2);
    } else if (decoded.length === 32) {
      rawPub = decoded;
    } else {
      rawPub = decoded.subarray(decoded.length - 32);
    }

    // SPKI DER header for Ed25519: 30 2a 30 05 06 03 2b 65 70 03 21 00 + 32-byte pub key
    const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
    const spkiDer = Buffer.concat([spkiHeader, rawPub]);

    return crypto.createPublicKey({
      key: spkiDer,
      format: 'der',
      type: 'spki'
    });
  }

  /**
   * Encodes a signature buffer to base58btc multibase (starts with 'z').
   */
  public static encodeSignatureMultibase(sig: Buffer): string {
    return 'z' + bs58.encode(sig);
  }

  /**
   * Decodes a base58btc multibase signature.
   */
  public static decodeSignatureMultibase(sigMultibase: string): Buffer {
    if (sigMultibase.startsWith('z')) {
      return Buffer.from(bs58.decode(sigMultibase.slice(1)));
    }
    return Buffer.from(bs58.decode(sigMultibase));
  }
}
