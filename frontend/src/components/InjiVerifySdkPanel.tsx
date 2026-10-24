import React, { useEffect, useRef, useState } from 'react';
import { OpenID4VPVerification, QRCodeVerification } from '@injistack/react-inji-verify-sdk';

interface InjiVerifySdkPanelProps {
  onVPStarted: () => void;
  onVPResult: (result: any | null, error?: string) => void;
  onTransactionReceived: (transactionId: string) => void;
}

interface IndependentResult {
  status: 'PENDING' | 'PASS' | 'FAIL' | 'ERROR' | 'UNAVAILABLE';
  reason: string;
  vpProofValid?: boolean;
  credentialSubjectBindingValid?: boolean;
  credentialCount?: number;
  credentialStatuses?: string[];
}

export const InjiVerifySdkPanel: React.FC<InjiVerifySdkPanelProps> = ({ onVPStarted, onVPResult, onTransactionReceived }) => {
  const [clientId, setClientId] = useState('');
  const [state, setState] = useState('Checking Inji Verify…');
  const [outcome, setOutcome] = useState('');
  const [officialAccepted, setOfficialAccepted] = useState(false);
  const [independentResult, setIndependentResult] = useState<IndependentResult | null>(null);
  const [readiness, setReadiness] = useState<{ configuredForPhone: boolean; issues: string[] } | null>(null);
  const [transactionId, setTransactionId] = useState(() => crypto.randomUUID());
  const pollingController = useRef<AbortController | null>(null);
  // The browser creates and polls the request through its local proxy. Inji
  // Verify puts the configured phone-facing request_uri/response_uri in the QR.
  // This profile is paired with Inji Verify 1.0.0-alpha.1 and speaks DCQL,
  // matching Inji Mobile 1.0.0-alpha.1. The legacy PEX verifier remains
  // available through /v1/verify for older wallets and the rest of the lab.
  const serviceUrl = `${window.location.origin}/v1/verify`;
  // OpenID4VP 1.0 identifies a DID client with the standardized
  // decentralized_identifier prefix. The old `client_id_scheme=did` field
  // belongs to draft-era requests and is rejected by the alpha wallet.
  const mobileClientId = clientId ? `decentralized_identifier:${clientId}` : '';

  useEffect(() => {
    const controller = new AbortController();
    const inspect = async () => {
      try {
        const [response, readinessResponse] = await Promise.all([
          fetch('/api/verifier/did', { signal: controller.signal }),
          fetch('/api/verifier/mobile-readiness', { signal: controller.signal })
        ]);
        if (!response.ok) throw new Error(`Inji Verify unavailable (${response.status})`);
        if (!readinessResponse.ok) throw new Error(`Mobile configuration check failed (${readinessResponse.status})`);
        const document = await response.json();
        setReadiness(await readinessResponse.json());
        if (typeof document.id !== 'string' || !document.id.startsWith('did:')) {
          throw new Error('Inji Verify returned no usable verifier DID');
        }
        setClientId(document.id);
        setState('Ready');
      } catch (error) {
        if (!controller.signal.aborted) setState(error instanceof Error ? error.message : 'Inji Verify unavailable');
      }
    };
    void inspect();
    return () => controller.abort();
  }, []);

  useEffect(() => () => pollingController.current?.abort(), []);

  const waitForVerifierResult = async (transactionId: string) => {
    pollingController.current?.abort();
    const controller = new AbortController();
    pollingController.current = controller;
    onTransactionReceived(transactionId);
    setOutcome('Presentation received. Waiting for Inji Verify to finish…');
    try {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const response = await fetch(`/api/verifier/vp-result/${encodeURIComponent(transactionId)}?selectedWallet=INJI_MOBILE&profile=mobile-alpha`, {
          headers: { 'X-Playground-Flow-Id': transactionId }, signal: controller.signal
        });
        if (response.status !== 202) {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `Inji Verify result failed (${response.status})`);
          if (result.vpResultStatus && !['PENDING', 'PROCESSING', 'CREATED'].includes(result.vpResultStatus)) {
            const valid = result.vpResultStatus === 'SUCCESS' && Array.isArray(result.vcResults) &&
              result.vcResults.length > 0 && result.vcResults.every((entry: any) => entry.verificationStatus === 'SUCCESS');
            const localResult = result.independentResult || { status: 'UNAVAILABLE', reason: 'NO_LOCAL_RESULT' };
            setIndependentResult(localResult);
            setOfficialAccepted(valid);
            onVPResult({ ...result, valid, transactionId, executionMode: 'EXTERNAL_WALLET_OPENID4VP' });
            setOutcome(valid ? 'Inji Verify accepted the presentation.' :
              result.interopDiagnostic || `The wallet submitted its presentation, but Inji Verify returned ${result.vpResultStatus}. Sharing on the phone does not mean the verifier accepted it.`);
            setTransactionId(crypto.randomUUID());
            if (localResult.status === 'PENDING') {
              void waitForIndependentResult(transactionId, controller.signal);
            }
            return;
          }
        }
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        if (controller.signal.aborted) return;
      }
      throw new Error('No verifier result arrived before the five-minute presentation request expired');
    } catch (error: any) {
      if (controller.signal.aborted) return;
      const message = error.message || 'Could not retrieve Inji Verify result';
      setOutcome(message);
      onVPResult(null, message);
      setTransactionId(crypto.randomUUID());
    }
  };

  const waitForIndependentResult = async (transactionId: string, signal: AbortSignal) => {
    for (let attempt = 0; attempt < 30 && !signal.aborted; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 2000));
      if (signal.aborted) return;
      try {
        const response = await fetch(`/api/verifier/vp-independent-result/${encodeURIComponent(transactionId)}`, { signal });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.result?.status && data.result.status !== 'PENDING') {
          setIndependentResult(data.result);
          return;
        }
      } catch { if (signal.aborted) return; }
    }
    if (!signal.aborted) setIndependentResult({ status: 'UNAVAILABLE', reason: 'LOCAL_CHECK_TIMEOUT' });
  };

  return (
    <div className="inji-subcard rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-200">
      <h3 className="font-extrabold text-[#451691] dark:text-[#C084FC] mb-2">Official Inji Verify SDK</h3>
      {!clientId ? <p role="status">{state}</p> : (
        <>
          <p className="mb-3">In Inji Mobile, scan this verifier QR with bottom-bar Share → Scan, select the downloaded card, then approve the request. The + scanner is for downloading a card. The phone may say “Shared successfully” even if Inji Verify rejects the proof; check the result here.</p>
          {readiness && !readiness.configuredForPhone && <div role="status" className="mb-3 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <p className="font-bold">Phone QR configuration is incomplete:</p>
            <ul className="mt-1 list-disc pl-4">{readiness.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          </div>}
          <div className="flex flex-wrap gap-2">
            <OpenID4VPVerification
              verifyServiceUrl={serviceUrl}
              clientId={mobileClientId}
              transactionId={transactionId}
              dcqlQuery={{
                credentials: [{
                  id: 'farmer-credential',
                  format: 'ldp_vc',
                  // The sandbox issuer and the public Inji sandbox do not use
                  // the same credential type URI. Ask for an LDP VC by format
                  // so the wallet can offer the Farmer card it already holds;
                  // Inji Verify still validates issuer and holder proofs.
                  meta: {},
                  require_cryptographic_holder_binding: true
                }]
              }}
              isSameDeviceFlowEnabled={false}
              triggerElement={<button type="button" disabled={!readiness?.configuredForPhone} onClick={() => { onVPStarted(); onTransactionReceived(transactionId); setIndependentResult(null); setOfficialAccepted(false); setOutcome('Waiting for a wallet to scan the verifier QR…'); }} className="rounded-xl bg-[#451691] px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Show wallet QR</button>}
              onVPReceived={(transactionId) => { void waitForVerifierResult(transactionId); }}
              onQrCodeExpired={() => {
                setOutcome('Wallet QR expired. Start a new request.');
                setTransactionId(crypto.randomUUID());
              }}
              onError={(error) => {
                const message = error.errorMessage || 'SDK VP verification failed';
                setOutcome(message);
                onVPResult(null, message);
                setTransactionId(crypto.randomUUID());
              }}
            />
            <QRCodeVerification
              verifyServiceUrl={serviceUrl}
              clientId={clientId}
              isEnableScan={false}
              isEnableUpload={true}
              triggerElement={<button type="button" className="rounded-xl border border-[#451691] px-3 py-2 font-bold text-[#451691] dark:text-[#C084FC]">Upload credential QR</button>}
              onVCProcessed={(result) => setOutcome(`SDK VC result received (${result.length} credential results)`)}
              onError={(error) => setOutcome(error.message || 'SDK QR verification failed')}
            />
          </div>
          {outcome && <p role="status" className="mt-3">{outcome}</p>}
          {independentResult && (
            <div role="status" className="mt-3 rounded-xl border border-[#451691]/25 p-3">
              <p className="font-bold">Separate playground check: {officialAccepted && independentResult.status === 'FAIL' ? 'INCONCLUSIVE' : independentResult.status}</p>
              {officialAccepted && independentResult.status === 'FAIL' && <p className="mt-1 text-amber-700 dark:text-amber-300">The local checker could not validate this wallet proof, while official Inji Verify accepted the presentation and credential. Its compatibility with this wallet proof is unresolved; the official result above is PASS.</p>}
              <p className="mt-1">This checks the unchanged wallet VP proof locally and asks Inji Verify to verify each embedded credential. It does not change Inji Verify's VP result.</p>
              <p className="mt-1 font-mono">VP proof: {independentResult.vpProofValid ? 'valid' : 'not verified'} · Holder/subject binding: {independentResult.credentialSubjectBindingValid ? 'valid' : 'not verified'} · VC results: {independentResult.credentialStatuses?.join(', ') || 'none'} · {independentResult.reason}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
