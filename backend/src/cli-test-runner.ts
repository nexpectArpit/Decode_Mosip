import * as fs from 'fs';
import * as path from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function runCliMatrix() {
  console.log('\n===============================================================');
  console.log('  MOSIP Decode 2026 — Inji Interop Lab Test Runner              ');
  console.log('  Problem Statement #2: Interoperability Matrix                    ');
  console.log('===============================================================\n');

  try {
    console.log(`[*] Probing Playground Backend at ${BACKEND_URL}...`);
    const healthRes = await fetch(`${BACKEND_URL}/api/health`);
    const health = await healthRes.json();
    console.log(`[+] System Health: Certify [${health.certify.status}], Mimoto [${health.mimoto.status}], Verify [${health.verify.status}], DB [${health.database.status}]\n`);

    // 1. Execute the bounded standards probes
    console.log('[*] Executing scoped standards probes...');
    const standardsRes = await fetch(`${BACKEND_URL}/api/interop/report`);
    const standardsData = await standardsRes.json();
    if (!standardsRes.ok) throw new Error(standardsData.error || `Standards audit failed (${standardsRes.status})`);

    console.log('\n--- EXECUTABLE STANDARDS PROBES ---');
    standardsData.summaries.forEach((s: any) => {
      console.log(`  • ${s.specName} (${s.specVersion}): ${s.passedRequirements}/${s.totalRequirements} requirements verified (${s.passRatePercentage}%)`);
    });
    console.log('-------------------------------------------\n');

    // 2. Execute Real Cryptographic Matrix
    console.log('[*] Executing interoperability scenarios...');
    const matrixRes = await fetch(`${BACKEND_URL}/api/interop/matrix/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await matrixRes.json();

    console.log('\n---------------------------------------------------------------------------------------------------------');
    console.log(
      '| # | ISSUER        | WALLET          | VERIFIER        | FORMAT    | MODE     | ATTACK VECTOR      | EXPECT | RESULT |'
    );
    console.log('---------------------------------------------------------------------------------------------------------');

    let markdownRows = '';

    data.results.forEach((r: any, idx: number) => {
      const num = String(idx + 1).padEnd(2);
      const issuer = r.issuer.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(13);
      const wallet = r.wallet.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(15);
      const verifier = r.verifier.replace('INJI_', '').replace('MOCK_EXTERNAL_', 'EXT_').padEnd(15);
      const format = r.format.padEnd(9);
      const mode = r.executionMode === 'LOCAL_REFERENCE_CRYPTO' ? 'LOCAL' :
        r.executionMode?.startsWith('LOCAL_REFERENCE_WALLET_') ? 'WALLET' : 'API';
      const tamper = (r.tamperScenario || 'NONE').padEnd(18);
      const exp = r.expectedOutcome.padEnd(6);
      const statusIcon = r.passed ? 'PASS [OK]' : 'FAIL [X] ';

      console.log(`| ${num}| ${issuer} | ${wallet} | ${verifier} | ${format} | ${mode.padEnd(8)} | ${tamper} | ${exp} | ${statusIcon} |`);

      const detail = (r.errorDetail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      markdownRows += `| ${idx + 1} | \`${r.issuer}\` | \`${r.wallet}\` | \`${r.verifier}\` | \`${r.format}\` | \`${r.executionMode || 'DIRECT_API'}\` | \`${r.tamperScenario}\` | \`${r.expectedOutcome}\` | **${r.actualOutcome}** | ${r.passed ? '✅ PASS' : '❌ FAIL'} | ${r.latencyMs}ms | ${detail} |\n`;
    });

    console.log('---------------------------------------------------------------------------------------------------------');
    console.log(`\n>> Matrix Scenarios: ${data.passedTotal} / ${data.totalTests} passed`);
    console.log(`>> API Matrix Success Rate: ${data.matrixSuccessRate}%`);
    const coverageText = data.walletTransportExercised
      ? 'local reference-wallet OpenID4VP and mock SD-JWT OpenID4VCI/OpenID4VP paths; Inji Web/mobile transport is not exercised.'
      : 'issuer/verifier APIs only; wallet transport and OpenID4VP presentation are not exercised.';
    console.log(`>> Coverage: ${coverageText}`);
    console.log(`>> Execution Time: ${data.durationTotalMs}ms\n`);

    // Write markdown report
    const reportPath = process.env.MATRIX_REPORT_PATH ||
      path.resolve(process.cwd(), '../docs/INTEROP_TEST_RESULTS.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    
    let standardsMd = '';
    standardsData.summaries.forEach((s: any) => {
      const scopes = [...new Set(standardsData.requirements.filter((r: any) => r.specification === s.spec).map((r: any) => r.scope))].join(', ');
      standardsMd += `| **${s.specName}** | ${s.specVersion} | ${scopes} | ${s.passedRequirements}/${s.totalRequirements} | **${s.passRatePercentage}%** |\n`;
    });

    const mdContent = `# MOSIP Decode 2026: Verifiable Credentials Interoperability Matrix Report

**Execution Timestamp:** ${new Date().toISOString()}  
**Matrix Result:** **${data.passedTotal} / ${data.totalTests} scenarios passed**  
**Execution Latency:** ${data.durationTotalMs}ms  

---

**Coverage:** ${coverageText} An error before verification never counts as a passing rejection.

**Local DID resolver repair:** The playground serves a compatibility-normalized DID document for the local Certify host, replacing Certify's bare-DID assertionMethod entry with its controlled verification-method references. The raw upstream defect remains recorded in docs/upstream-issue-drafts.md.

## 1. Executable Standards Probes

**Result:** ${standardsData.requirements.filter((r: any) => r.passed).length}/${standardsData.requirements.length} passed. Scopes: ${standardsData.coverage.upstreamApi} upstream API, ${standardsData.coverage.localReference} local reference, ${standardsData.coverage.walletPresentation} passing wallet presentation. These probes are not formal standards certification.

| Specification | Version | Probe scopes | Requirements Verified | Pass Rate |
| :--- | :--- | :--- | :---: | :---: |
${standardsMd}

${standardsData.requirements.filter((r: any) => !r.passed).map((r: any) => `- **FAIL ${r.id}** [${r.scope}]: ${r.failureReason}`).join('\n')}

---

## 2. Issuer and Verifier API Matrix Results

| # | Issuer | Wallet | Verifier | Format | Execution Mode | Tamper / Attack Vector | Expected | Actual | Outcome | Latency | Error Detail |
|---|---|---|---|---|---|---|---|---|---|---|---|
${markdownRows}

---

## 3. Interpretation

Only rows marked PASS met their expected outcome. ERROR means a service or flow failed before the expected verifier outcome could be observed. \`DIRECT_API\` rows do not exercise their wallet labels. \`LOCAL_REFERENCE_WALLET_OID4VCI_OID4VP\` executes the browser-reference wallet protocol path; it does not establish Inji Web or mobile interoperability.
`;

    fs.writeFileSync(reportPath, mdContent, 'utf-8');
    console.log(`[+] Full markdown report written to: ${reportPath}\n`);
    if (data.failedTotal > 0) process.exitCode = 1;

  } catch (err: any) {
    console.error('[-] Error executing test matrix:', err.message);
    process.exit(1);
  }
}

runCliMatrix();
