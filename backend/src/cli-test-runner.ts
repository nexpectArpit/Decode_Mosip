import * as fs from 'fs';
import * as path from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function runCliMatrix() {
  console.log('\n===============================================================');
  console.log('  MOSIP Decode 2026 — Inji Interop Lab Test Runner              ');
  console.log('  Problem Statement #2: Automated Matrix & Normative Audit     ');
  console.log('===============================================================\n');

  try {
    console.log(`[*] Probing Playground Backend at ${BACKEND_URL}...`);
    const healthRes = await fetch(`${BACKEND_URL}/api/health`);
    const health = await healthRes.json();
    console.log(`[+] System Health: Certify [${health.certify.status}], Mimoto [${health.mimoto.status}], Verify [${health.verify.status}], DB [${health.database.status}]\n`);

    // 1. Fetch Normative Specifications Audit
    console.log('[*] Fetching Normative Specification Requirements Audit...');
    const standardsRes = await fetch(`${BACKEND_URL}/api/interop/standards`);
    const standardsData = await standardsRes.json();

    console.log('\n--- NORMATIVE SPECIFICATION CONFORMANCE ---');
    standardsData.summaries.forEach((s: any) => {
      console.log(`  • ${s.specName} (${s.specVersion}): ${s.passedRequirements}/${s.totalRequirements} requirements verified (${s.passRatePercentage}%)`);
    });
    console.log('-------------------------------------------\n');

    // 2. Execute Real Cryptographic Matrix
    console.log('[*] Executing Live Cryptographic Matrix & Tamper Security Scenarios...');
    const matrixRes = await fetch(`${BACKEND_URL}/api/interop/matrix/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await matrixRes.json();

    console.log('\n---------------------------------------------------------------------------------------------------------');
    console.log(
      '| # | ISSUER        | WALLET          | VERIFIER        | FORMAT    | ATTACK VECTOR      | EXPECT | RESULT |'
    );
    console.log('---------------------------------------------------------------------------------------------------------');

    let markdownRows = '';

    data.results.forEach((r: any, idx: number) => {
      const num = String(idx + 1).padEnd(2);
      const issuer = r.issuer.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(13);
      const wallet = r.wallet.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(15);
      const verifier = r.verifier.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(15);
      const format = r.format.padEnd(9);
      const tamper = (r.tamperScenario || 'NONE').padEnd(18);
      const exp = r.expectedOutcome.padEnd(6);
      const statusIcon = r.passed ? 'PASS [OK]' : 'FAIL [X] ';

      console.log(`| ${num}| ${issuer} | ${wallet} | ${verifier} | ${format} | ${tamper} | ${exp} | ${statusIcon} |`);

      markdownRows += `| ${idx + 1} | \`${r.issuer}\` | \`${r.wallet}\` | \`${r.verifier}\` | \`${r.format}\` | \`${r.tamperScenario}\` | \`${r.expectedOutcome}\` | **${r.actualOutcome}** | ${r.passed ? '✅ PASS' : '❌ FAIL'} | ${r.latencyMs}ms |\n`;
    });

    console.log('---------------------------------------------------------------------------------------------------------');
    console.log(`\n>> Matrix Scenarios: ${data.passedTotal} / ${data.totalTests} passed`);
    console.log(`>> Matrix Success Rate: ${data.matrixSuccessRate}%`);
    console.log(`>> Execution Time: ${data.durationTotalMs}ms\n`);

    // Write markdown report
    const reportPath = path.resolve(__dirname, '../../../docs/INTEROP_TEST_RESULTS.md');
    
    let standardsMd = '';
    standardsData.summaries.forEach((s: any) => {
      standardsMd += `| **${s.specName}** | ${s.specVersion} | ${s.passedRequirements}/${s.totalRequirements} | **${s.passRatePercentage}%** |\n`;
    });

    const mdContent = `# MOSIP Decode 2026: Verifiable Credentials Interoperability Matrix Report

**Execution Timestamp:** ${new Date().toISOString()}  
**Matrix Result:** **${data.passedTotal} / ${data.totalTests} scenarios passed**  
**Execution Latency:** ${data.durationTotalMs}ms  

---

## 1. Normative Specifications Verification Audit

| Specification | Version | Requirements Verified | Pass Rate |
| :--- | :--- | :---: | :---: |
${standardsMd}

---

## 2. Live Cryptographic Matrix Test Results

| # | Issuer | Wallet | Verifier | Format | Tamper / Attack Vector | Expected | Actual | Outcome | Latency |
|---|---|---|---|---|---|---|---|---|---|
${markdownRows}

---

## 3. Cryptographic Verification Integrity Details

1. **W3C VC (Ed25519Signature2020)**:
   - Canonicalized using RFC 8785 JSON Canonicalization Scheme (JCS).
   - Signatures generated and verified mathematically with raw 32-byte Ed25519 keys.
   - Tampered signatures correctly fail cryptographic verification without simulated flags.

2. **IETF SD-JWT VC**:
   - Disclosures formed as \`base64url(JSON([salt, claim_name, claim_value]))\` using 128-bit cryptographic salts.
   - SHA-256 digests validated against the signed \`_sd\` array.
   - Holder selectively presents disclosures; verifier reconstructs and matches digests while verifying JWS signature.

3. **ISO/IEC 18013-5 mDoc**:
   - Canonical CBOR encoding of \`IssuerSignedItem\` elements.
   - ValueDigests in MobileSecurityObject (MSO) verified against individual claim item SHA-256 hashes.
   - COSE_Sign1 structure verified using EdDSA / Ed25519 over \`Sig_structure\`.

4. **Negative-Path Security Posture**:
   - Verifiers receive credentials blindly without tamper flags.
   - Signature corruption, claim mutation, disclosure alteration, and temporal expiration are detected through pure mathematical proof and temporal boundary checks.
`;

    fs.writeFileSync(reportPath, mdContent, 'utf-8');
    console.log(`[+] Full markdown report written to: ${reportPath}\n`);

  } catch (err: any) {
    console.error('[-] Error executing test matrix:', err.message);
    process.exit(1);
  }
}

runCliMatrix();
