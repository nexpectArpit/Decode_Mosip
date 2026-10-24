import React, { Suspense, useState } from 'react';
import { Header } from './components/Header';
import { IssuerColumn } from './components/IssuerColumn';
import { WalletColumn } from './components/WalletColumn';
import { VerifierColumn, type TamperAttackVector } from './components/VerifierColumn';
import { ProtocolInspector } from './components/ProtocolInspector';
const SequenceDiagram = React.lazy(() => import('./components/SequenceDiagram').then(module => ({ default: module.SequenceDiagram })));
import { InteropModal } from './components/InteropModal';
import { ResultBanner, type InteropResult } from './components/ResultBanner';
import { OverviewPage } from './components/OverviewPage';
import { WorkspaceTour } from './components/WorkspaceTour';

const TOUR_SEEN_KEY = 'inji-playground-workspace-tour-seen-v2';

export const App: React.FC = () => {
  const [view, setView] = useState<'overview' | 'workspace'>('overview');
  const [tourSeen, setTourSeen] = useState(() => localStorage.getItem(TOUR_SEEN_KEY) === 'true');
  const [tourActive, setTourActive] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [issuedVc, setIssuedVc] = useState<any>(null);
  const [walletType, setWalletType] = useState<'INJI_WEB' | 'PLAYGROUND_BROWSER_VAULT' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET'>('MOCK_EXTERNAL_WALLET');
  const [selectedForVerification, setSelectedForVerification] = useState<any>(null);
  const [tamperScenario, setTamperScenario] = useState<TamperAttackVector>('NONE');
  const [verifierImplementation, setVerifierImplementation] = useState<'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP'>('INJI_VERIFY');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [activeFlowId, setActiveFlowIdState] = useState<string | undefined>(() =>
    localStorage.getItem('inji-playground-active-flow') || undefined
  );
  const [credentialFlowId, setCredentialFlowId] = useState<string | undefined>();

  const setActiveFlowId = (flowId: string) => {
    localStorage.setItem('inji-playground-active-flow', flowId);
    setActiveFlowIdState(flowId);
  };

  const enterGuidedWorkspace = () => {
    setWalletType('INJI_MOBILE');
    setVerifierImplementation('INJI_VERIFY');
    setTamperScenario('NONE');
    setView('workspace');
    if (localStorage.getItem(TOUR_SEEN_KEY) !== 'true') setTourActive(true);
  };

  const finishWorkspaceTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
    setTourSeen(true);
    setTourActive(false);
  };

  const skipWorkspaceTour = () => finishWorkspaceTour();

  const [testResult, setTestResult] = useState<InteropResult>({
    status: 'IDLE',
    issuer: 'Inji Certify',
    wallet: 'Playground Browser Vault',
    verifier: 'Inji Verify',
    format: 'W3C VC',
    attackVector: 'NONE'
  });

  const [inspectorTrigger, setInspectorTrigger] = useState(0);

  const handleIssueSuccess = (vc: any, flowId: string) => {
    setCredentialFlowId(flowId);
    setActiveFlowId(flowId);
    if (vc.format !== 'ldp_vc') setVerifierImplementation('MOCK_EXTERNAL_OID4VP');
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
    const flowId = credentialFlowId || crypto.randomUUID();
    setActiveFlowId(flowId);

    try {
      const isNoncePresentationTest = tamperScenario === 'MISMATCHED_NONCE';
      const res = await fetch(isNoncePresentationTest ? '/api/wallet/present-vp' : '/api/verifier/verify-vc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Playground-Flow-Id': flowId },
        body: JSON.stringify(isNoncePresentationTest
          ? { vc: vcToVerify, verifierImplementation, attack: tamperScenario }
          : { vc: vcToVerify, verifierImplementation, tamperScenario })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification service failed');
      const expectedRejection = tamperScenario !== 'NONE';
      const passed = expectedRejection ? !data.valid : data.valid;
      setVerificationResult({ ...data, status: data.status || data.verifierResult?.vpResultStatus });
      setInspectorTrigger(prev => prev + 1);

      setTestResult({
        status: passed ? 'PASS' : 'FAIL',
        issuer: vcToVerify.issuerImplementation || 'Inji Certify',
        wallet: isNoncePresentationTest ? 'Local Reference Wallet (signed VP)' : 'Playground Browser Vault',
        verifier: verifierImplementation === 'INJI_VERIFY' ? 'Inji Verify' : 'Local Mock Verifier',
        format: vcToVerify.format || 'ldp_vc',
        attackVector: tamperScenario,
        details: data
      });
    } catch (err: any) {
      setTestResult({
        status: 'ERROR',
        issuer: vcToVerify.issuerImplementation || 'Unknown issuer',
        wallet: 'Playground Browser Vault',
        verifier: verifierImplementation === 'INJI_VERIFY' ? 'Inji Verify' : 'Local Mock Verifier',
        format: vcToVerify.format || 'unknown',
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
        onOpenOverview={view === 'workspace' ? () => setView('overview') : undefined}
        onReplayTour={view === 'workspace' && tourSeen ? () => setTourActive(true) : undefined}
        showWorkspaceActions={view === 'workspace'}
      />

      {view === 'overview' ? (
        <OverviewPage
          onStart={enterGuidedWorkspace}
        />
      ) : (
      <div className="flex-1 flex flex-col p-5 sm:p-4 md:p-6 max-w-[1680px] w-full mx-auto">
        <ResultBanner
          result={testResult}
          onViewTrace={() => {
            const inspector = document.getElementById('protocol-inspector-tray');
            if (inspector) inspector.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        <main className="min-w-0 grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 mb-6 items-stretch">
          <div className="min-w-0" data-tour-target="issuer"><IssuerColumn walletType={walletType} onIssueSuccess={handleIssueSuccess} onFlowStarted={setActiveFlowId} /></div>
          <div className="min-w-0" data-tour-target="wallet"><WalletColumn
            walletType={walletType}
            onWalletTypeChange={(wallet) => {
              setWalletType(wallet);
              if (wallet === 'INJI_MOBILE' || wallet === 'INJI_WEB') setTamperScenario('NONE');
            }}
            issuedVc={issuedVc}
            credentialFlowId={credentialFlowId}
            verifierImplementation={verifierImplementation}
            tamperScenario={tamperScenario}
            onVPResult={(result, error) => {
              const expectedRejection = tamperScenario !== 'NONE';
              const vpPassed = expectedRejection ? Boolean(result && !result.valid) : Boolean(result?.valid);
              setInspectorTrigger(prev => prev + 1);
              setVerificationResult(result ? {
                valid: result.valid,
                status: result.verifierResult?.vpResultStatus,
                vpResult: result.verifierResult
              } : null);
              setTestResult({
                status: error ? 'ERROR' : vpPassed ? 'PASS' : 'FAIL',
                issuer: issuedVc?.issuerImplementation || 'Unknown issuer',
                wallet: walletType === 'INJI_WEB' ? 'Inji Web (Mimoto)' : 'Local Reference Wallet (signed VP)',
                verifier: verifierImplementation === 'INJI_VERIFY' ? 'Inji Verify' : 'Local Mock OpenID4VP Verifier',
                format: issuedVc?.format || 'unknown',
                attackVector: tamperScenario,
                details: result,
                errorMessage: error || result?.interopDiagnostic
              });
            }}
            onFlowStarted={setActiveFlowId}
            onSelectForVerification={(vc) => {
              setSelectedForVerification(vc);
              setInspectorTrigger(prev => prev + 1);
            }}
          /></div>
          <div className="min-w-0" data-tour-target="verifier"><VerifierColumn
            walletType={walletType}
            selectedVc={selectedForVerification}
            implementation={verifierImplementation}
            onChangeImplementation={setVerifierImplementation}
            onExecuteVerify={handleExecuteVerify}
            isVerifying={isVerifying}
            verificationResult={verificationResult}
            tamperScenario={tamperScenario}
            onChangeTamperScenario={(s) => setTamperScenario(s)}
            onMobileVPStarted={() => {
              setVerificationResult(null);
              setTestResult(previous => ({ ...previous, status: 'IDLE' }));
            }}
            onMobileTransactionReceived={setActiveFlowId}
            onMobileVPResult={(result, error) => {
              const firstCredential = Array.isArray(result?.vcResults) ? result.vcResults[0] : undefined;
              let verifiedCredential = firstCredential?.vc;
              if (typeof verifiedCredential === 'string') {
                try { verifiedCredential = JSON.parse(verifiedCredential); } catch { verifiedCredential = undefined; }
              }
              const issuer = verifiedCredential?.issuer;
              setVerificationResult(result ? { valid: result.valid, status: result.vpResultStatus, vpResult: result } : null);
              setTestResult({
                status: error ? 'ERROR' : result?.valid ? 'PASS' : 'FAIL',
                issuer: typeof issuer === 'string' ? issuer : issuer?.id || 'Issuer not exposed in Verify result',
                wallet: walletType === 'INJI_MOBILE'
                  ? 'Inji Mobile selected (app identity unverified)'
                  : 'External wallet via QR (app identity unverified)',
                verifier: 'Inji Verify',
                format: firstCredential?.format || verifiedCredential?.format || 'W3C VC requested',
                attackVector: 'NONE',
                details: result,
                errorMessage: error
              });
              setInspectorTrigger(previous => previous + 1);
            }}
          /></div>
        </main>

        <div id="protocol-inspector-tray" className="flex-1 flex flex-col" data-tour-target="inspector">
          <ProtocolInspector refreshTrigger={inspectorTrigger} flowId={activeFlowId} />
        </div>
        <div data-tour-target="sequence">
        <Suspense fallback={<div className="inji-card mt-6 p-4 text-xs">Loading sequence diagram…</div>}>
          <SequenceDiagram refreshTrigger={inspectorTrigger} flowId={activeFlowId} />
        </Suspense>
        </div>
      </div>
      )}

      <WorkspaceTour active={tourActive} onFinish={finishWorkspaceTour} onSkip={skipWorkspaceTour} />

      <InteropModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />
    </div>
  );
};

export default App;
