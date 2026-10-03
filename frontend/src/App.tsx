import React, { useState } from 'react';
import { Header } from './components/Header';
import { IssuerColumn } from './components/IssuerColumn';
import { WalletColumn } from './components/WalletColumn';
import { VerifierColumn, type TamperAttackVector } from './components/VerifierColumn';
import { ProtocolInspector } from './components/ProtocolInspector';
import { InteropModal } from './components/InteropModal';
import { ResultBanner, type InteropResult } from './components/ResultBanner';

export const App: React.FC = () => {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [issuedVc, setIssuedVc] = useState<any>(null);
  const [selectedForVerification, setSelectedForVerification] = useState<any>(null);
  const [tamperScenario, setTamperScenario] = useState<TamperAttackVector>('NONE');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const [testResult, setTestResult] = useState<InteropResult>({
    status: 'IDLE',
    issuer: 'Inji Certify',
    wallet: 'Inji Web',
    verifier: 'Inji Verify',
    format: 'W3C VC',
    attackVector: 'NONE'
  });

  const [inspectorTrigger, setInspectorTrigger] = useState(0);

  const handleIssueSuccess = (vc: any) => {
    setIssuedVc(vc);
    setSelectedForVerification(null);
    setVerificationResult(null);
    setInspectorTrigger(prev => prev + 1);
  };

  const handleExecuteVerify = async (verifierImplementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP') => {
    const vcToVerify = selectedForVerification;
    if (!vcToVerify) return;

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await fetch('http://localhost:4000/api/verifier/verify-vc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vc: vcToVerify,
          verifierImplementation,
          tamperScenario
        })
      });

      const data = await res.json();
      setVerificationResult(data);
      setInspectorTrigger(prev => prev + 1);

      const isPass = data.valid;
      setTestResult({
        status: isPass ? 'PASS' : 'FAIL',
        issuer: vcToVerify.issuerImplementation || 'Inji Certify',
        wallet: 'Inji Web',
        verifier: verifierImplementation === 'INJI_VERIFY' ? 'Inji Verify' : 'External Mock',
        format: vcToVerify.format || 'ldp_vc',
        attackVector: tamperScenario,
        details: data
      });
    } catch (err: any) {
      setTestResult({
        status: 'FAIL',
        issuer: 'Inji Certify',
        wallet: 'Inji Web',
        verifier: verifierImplementation === 'INJI_VERIFY' ? 'Inji Verify' : 'External Mock',
        format: 'ldp_vc',
        attackVector: tamperScenario,
        errorMessage: err.message
      });
      setInspectorTrigger(prev => prev + 1);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        onOpenReport={() => setReportModalOpen(true)}
      />

      <div className="flex-1 flex flex-col p-4 md:p-6 max-w-[1680px] w-full mx-auto">
        <ResultBanner
          result={testResult}
          onViewTrace={() => {
            const inspector = document.getElementById('protocol-inspector-tray');
            if (inspector) inspector.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
          <IssuerColumn onIssueSuccess={handleIssueSuccess} />
          <WalletColumn
            issuedVc={issuedVc}
            onSelectForVerification={(vc) => {
              setSelectedForVerification(vc);
              setInspectorTrigger(prev => prev + 1);
            }}
          />
          <VerifierColumn
            selectedVc={selectedForVerification}
            onExecuteVerify={handleExecuteVerify}
            isVerifying={isVerifying}
            verificationResult={verificationResult}
            tamperScenario={tamperScenario}
            onChangeTamperScenario={(s) => setTamperScenario(s)}
          />
        </main>

        <div id="protocol-inspector-tray" className="flex-1 flex flex-col">
          <ProtocolInspector refreshTrigger={inspectorTrigger} />
        </div>
      </div>

      <InteropModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />
    </div>
  );
};

export default App;
