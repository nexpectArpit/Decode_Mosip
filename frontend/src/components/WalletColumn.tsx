import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { formatCredentialTitle } from '../utils/format';
import type { TamperAttackVector } from './VerifierColumn';

interface WalletColumnProps {
  walletType: 'INJI_WEB' | 'PLAYGROUND_BROWSER_VAULT' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET';
  onWalletTypeChange: (wallet: 'INJI_WEB' | 'PLAYGROUND_BROWSER_VAULT' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET') => void;
  issuedVc: any;
  credentialFlowId?: string;
  onSelectForVerification: (vc: any) => void;
  onVPResult: (result: any, error?: string) => void;
  onFlowStarted: (flowId: string) => void;
  verifierImplementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP';
  tamperScenario: TamperAttackVector;
}

export const WalletColumn: React.FC<WalletColumnProps> = ({ walletType, onWalletTypeChange, issuedVc, credentialFlowId, onSelectForVerification, onVPResult, onFlowStarted, verifierImplementation, tamperScenario }) => {
  const [storedCredentials, setStoredCredentials] = useState<any[]>(() => {
    try {
      const saved = sessionStorage.getItem('inji-playground-wallet-vault');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isPresenting, setIsPresenting] = useState(false);
  const [injiWebStatus, setInjiWebStatus] = useState('Not checked');
  const [isInjiWebAuthenticated, setIsInjiWebAuthenticated] = useState(false);
  const [injiWebCredentials, setInjiWebCredentials] = useState<Array<{ credentialId: string; credentialTypeDisplayName: string }>>([]);
  const [injiWebAuthorizationUrl, setInjiWebAuthorizationUrl] = useState('');

  const walletOptions: SelectOption[] = [
    { value: 'INJI_WEB', label: 'Inji Web Wallet (Mimoto)' },
    { value: 'PLAYGROUND_BROWSER_VAULT', label: 'Playground Browser Vault (direct VC)' },
    { value: 'INJI_MOBILE', label: 'Inji Mobile (existing app)' },
    { value: 'MOCK_EXTERNAL_WALLET', label: 'Local Reference Wallet (OpenID4VP)' }
  ];

  const [lastIssuedId, setLastIssuedId] = useState<string | undefined>();
  if (issuedVc?.id !== lastIssuedId) {
    setLastIssuedId(issuedVc?.id);
    if (issuedVc && !storedCredentials.some(c => c.id === issuedVc.id)) {
      setStoredCredentials([issuedVc, ...storedCredentials]);
    }
  }

  useEffect(() => {
    const localMockCredentials = storedCredentials.filter(vc => vc.issuerImplementation === 'MOCK_EXTERNAL_OID4VCI');
    sessionStorage.setItem('inji-playground-wallet-vault', JSON.stringify(localMockCredentials));
  }, [storedCredentials]);

  const activeVc = storedCredentials[0] || issuedVc;
  const [isPresented, setIsPresented] = useState(false);
  const supportsVPFlow = walletType === 'MOCK_EXTERNAL_WALLET' &&
    ((verifierImplementation === 'INJI_VERIFY' && activeVc?.format === 'ldp_vc' &&
      ['NONE', 'MISMATCHED_NONCE', 'INVALID_SIGNATURE'].includes(tamperScenario)) ||
      (verifierImplementation === 'MOCK_EXTERNAL_OID4VP' && activeVc?.format === 'vc+sd-jwt' &&
        ['NONE', 'MISMATCHED_NONCE', 'INVALID_SIGNATURE', 'CORRUPTED_DISCLOSURE'].includes(tamperScenario)));
  const injiWebCanPresent = walletType === 'INJI_WEB' && verifierImplementation === 'INJI_VERIFY';

  const handlePresent = async () => {
    if (walletType === 'INJI_WEB') {
      // The Inji Web route creates a signed request at Inji Verify and polls
      // that service's transaction result. Never label it as a mock verifier.
      if (!injiWebCanPresent) return;
      const popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      const flowId = crypto.randomUUID();
      onFlowStarted(flowId);
      setIsPresenting(true);
      setInjiWebStatus('Creating a signed Inji Verify request…');
      try {
        const response = await fetch('/api/verifier/inji-web-request', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Playground-Flow-Id': flowId }, body: '{}'
        });
        const data = await response.json();
        if (!response.ok || typeof data.authorizationUrl !== 'string') {
          throw new Error(data.error || `Inji Web request failed (${response.status})`);
        }
        setInjiWebAuthorizationUrl(data.authorizationUrl);
        setInjiWebStatus('Waiting for consent and presentation in Inji Web…');
        if (popup) popup.location.replace(data.authorizationUrl);

        // The browser wallet completes the direct_post out of band through Mimoto.
        // Poll Verify's transaction result and report only the service response.
        for (let attempt = 0; attempt < 150; attempt += 1) {
          await new Promise(resolve => window.setTimeout(resolve, 2000));
          const resultResponse = await fetch(`/api/verifier/vp-result/${encodeURIComponent(data.transactionId)}?selectedWallet=INJI_WEB`);
          if (resultResponse.status === 202) continue;
          const result = await resultResponse.json();
          if (!resultResponse.ok) throw new Error(result.error || `Inji Verify result failed (${resultResponse.status})`);
          if (!result.vpResultStatus || ['PENDING', 'PROCESSING', 'CREATED'].includes(result.vpResultStatus)) continue;
          const valid = result.vpResultStatus === 'SUCCESS' && Array.isArray(result.vcResults) &&
            result.vcResults.length > 0 && result.vcResults.every((entry: any) => entry.verificationStatus === 'SUCCESS');
          onVPResult({ ...result, valid, walletImplementation: 'INJI_WEB_MIMOTO', transactionId: data.transactionId });
          setInjiWebStatus(valid ? 'Inji Web presentation verified' : `Inji Verify returned ${result.vpResultStatus}`);
          return;
        }
        throw new Error('No verifier result arrived before the five-minute presentation request expired');
      } catch (error: any) {
        setInjiWebStatus(error.message || 'Inji Web presentation failed');
        onVPResult(null, error.message);
      } finally {
        setIsPresenting(false);
      }
      return;
    }
    if (!activeVc) return;
    if (walletType === 'MOCK_EXTERNAL_WALLET') {
      const flowId = credentialFlowId || crypto.randomUUID();
      onFlowStarted(flowId);
      setIsPresenting(true);
      try {
        const response = await fetch('/api/wallet/present-vp', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Playground-Flow-Id': flowId },
          body: JSON.stringify({ vc: activeVc, verifierImplementation, attack: tamperScenario })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `VP presentation failed (${response.status})`);
        onVPResult(data);
      } catch (error: any) {
        onVPResult(null, error.message);
      } finally {
        setIsPresenting(false);
      }
    } else {
      setIsPresented(true);
      onSelectForVerification(activeVc);
      setTimeout(() => setIsPresented(false), 2000);
    }
  };

  const refreshInjiWebVault = async () => {
    setInjiWebStatus('Checking the authenticated Mimoto wallet…');
    setIsInjiWebAuthenticated(false);
    try {
      const profileResponse = await fetch('/v1/mimoto/users/me', { credentials: 'include' });
      if (!profileResponse.ok) throw new Error(profileResponse.status === 401 || profileResponse.status === 403
        ? 'Sign in to Inji Web first, then refresh this wallet.'
        : `Mimoto profile check failed (${profileResponse.status})`);
      setIsInjiWebAuthenticated(true);
      const walletsResponse = await fetch('/v1/mimoto/wallets', { credentials: 'include' });
      if (!walletsResponse.ok) throw new Error(`Mimoto wallet lookup failed (${walletsResponse.status})`);
      const wallets = await walletsResponse.json();
      if (!Array.isArray(wallets) || wallets.length === 0 || typeof wallets[0].walletId !== 'string') {
        setInjiWebCredentials([]);
        setInjiWebStatus('Signed in, but no Inji Web wallet exists yet. Open Inji Web and finish wallet setup.');
        return;
      }
      if (['temporarily_locked', 'permanently_locked'].includes(String(wallets[0].walletStatus || '').toLowerCase())) {
        setInjiWebCredentials([]);
        setInjiWebStatus(`Inji Web wallet is ${wallets[0].walletStatus}. Unlock it in Inji Web, then refresh.`);
        return;
      }
      const credentialsResponse = await fetch(`/v1/mimoto/wallets/${encodeURIComponent(wallets[0].walletId)}/credentials`, { credentials: 'include' });
      if (!credentialsResponse.ok) throw new Error(`Mimoto credential readback failed (${credentialsResponse.status}). Unlock the wallet in Inji Web, then refresh.`);
      const credentials = await credentialsResponse.json();
      if (!Array.isArray(credentials)) throw new Error('Mimoto returned an unexpected credential list');
      const summary = credentials.map((entry: any) => ({
        credentialId: String(entry.credentialId || ''),
        credentialTypeDisplayName: String(entry.credentialTypeDisplayName || 'Verifiable Credential')
      }));
      setInjiWebCredentials(summary);
      setInjiWebStatus(`Authenticated Mimoto readback: ${summary.length} credential${summary.length === 1 ? '' : 's'} held`);
    } catch (error: any) {
      setInjiWebCredentials([]);
      setInjiWebStatus(error.message || 'Inji Web wallet is not available');
    }
  };

  return (
    <div className="inji-card min-w-0 flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#38BDF8] text-lg tracking-tight italic">WALLET</h2>
          <span className="text-xs text-[#002452] dark:text-[#38BDF8] font-mono font-extrabold">{walletType === 'INJI_WEB' ? 'Inji Web · Mimoto' : walletType === 'INJI_MOBILE' ? 'Inji Mobile' : walletType === 'PLAYGROUND_BROWSER_VAULT' ? 'Playground Browser Vault' : 'Local Reference Wallet'}</span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#1F9F60]/10 dark:bg-[#1F9F60]/30 text-[#1F9F60] dark:text-[#4ADE80] border border-[#1F9F60]/30 dark:border-[#1F9F60]/60 px-3 py-1 rounded-full">
          Holder Node
        </span>
      </div>

      <div className="p-5 flex flex-col gap-5 flex-1 justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Wallet Node Target:</span>
            </label>
            <CustomSelect
              options={walletOptions}
              value={walletType}
              onChange={(val) => onWalletTypeChange(val as any)}
            />
          </div>

          {walletType === 'INJI_MOBILE' ? (
            <div className="inji-subcard rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-200">
              <p className="font-extrabold text-[#451691] dark:text-[#C084FC]">Use the existing Inji Mobile app</p>
              <p className="mt-2">To receive a credential, create an Inji Certify offer QR in the Issuer column and scan it in Inji Mobile with + → Scan &amp; Download. To present it, open the Inji Verify SDK QR in the Verifier column and use the bottom-bar Share → Scan option.</p>
              <p className="mt-2 font-bold">A public HTTPS origin and matching issuer/verifier DIDs are required for phone QR testing. Phone wallet contents cannot be read by this playground.</p>
            </div>
          ) : walletType === 'INJI_WEB' ? (
            <div className="inji-subcard rounded-2xl p-3.5 flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#002452] dark:text-white font-extrabold">Mimoto Vault</span>
                <span className="shrink-0 font-mono text-[#1F9F60] dark:text-[#4ADE80] font-bold bg-[#1F9F60]/10 dark:bg-[#1F9F60]/30 px-3 py-1 rounded-full border border-[#1F9F60]/30 dark:border-[#1F9F60]/60">{injiWebCredentials.length} Held</span>
              </div>
              <p role="status" className="break-words text-slate-600 dark:text-slate-300">{injiWebStatus}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Sign in to Inji Web and finish wallet setup. Then launch the Agriculture Department issuance screen here. Refresh after download to confirm Mimoto storage.</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">The bundled Certify profile is configured for mobile pre-authorized issuance. This separate eSignet-backed Inji Web issuance route has not been verified in the current profile.</p>
              {injiWebCredentials.slice(0, 3).map((credential, index) => (
                <div key={credential.credentialId || index} className="rounded-lg bg-white/70 dark:bg-slate-950/40 p-2 text-[11px] font-semibold">{credential.credentialTypeDisplayName}</div>
              ))}
              <div className="flex flex-wrap gap-2">
                <a href="http://localhost:3004" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#1F9F60] px-3 py-2 text-[11px] font-bold text-white">Open Inji Web</a>
                {isInjiWebAuthenticated && <a href="http://localhost:3004/user/issuers/Farmer" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#1F9F60]/40 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Open Agriculture credential issuance</a>}
                <button type="button" onClick={() => void refreshInjiWebVault()} className="rounded-lg border border-emerald-700/30 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Refresh Mimoto Vault</button>
              </div>
              {injiWebAuthorizationUrl && <a href={injiWebAuthorizationUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#451691] underline dark:text-[#C084FC]">Reopen Inji Web presentation request</a>}
            </div>
          ) : <div className="inji-subcard rounded-2xl p-3.5 flex items-center justify-between text-xs">
            <span className="text-[#002452] dark:text-white font-extrabold">Vault Status:</span>
            <span className="font-mono text-[#1F9F60] dark:text-[#4ADE80] font-bold bg-[#1F9F60]/10 dark:bg-[#1F9F60]/30 px-3 py-1 rounded-full border border-[#1F9F60]/30 dark:border-[#1F9F60]/60">
              {storedCredentials.length} Held
            </span>
          </div>}

          {walletType !== 'INJI_WEB' && walletType !== 'INJI_MOBILE' && activeVc ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inji-subcard rounded-2xl overflow-hidden flex flex-col shadow-md"
            >
              <div className="inji-credential-gradient p-3.5 flex items-center justify-between text-white">
                <span className="font-extrabold text-xs tracking-wide">
                  {formatCredentialTitle(activeVc.type?.[1] || activeVc.credentialSubject?.doctype || 'FarmerCredential')}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase bg-black/30 dark:bg-black/40 text-white border border-white/30 px-2.5 py-0.5 rounded-full">
                  {activeVc.format || 'ldp_vc'}
                </span>
              </div>

              <div className="p-4 flex flex-col gap-2 text-xs">
                <div className="min-w-0 overflow-hidden font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#070210] p-3 rounded-xl border border-slate-200 dark:border-[#951F6F]/30 space-y-1 text-[11px]">
                  <div className="min-w-0 break-words [overflow-wrap:anywhere]">Subject: <strong className="text-slate-900 dark:text-white">{activeVc.credentialSubject?.fullName || activeVc.credentialSubject?.id || 'Holder'}</strong></div>
                  <div className="min-w-0 break-words [overflow-wrap:anywhere]">Issuer: <span className="text-[#F2680C] font-semibold break-all">{activeVc.issuer || activeVc.issuerImplementation}</span></div>
                </div>
              </div>
            </motion.div>
          ) : walletType !== 'INJI_WEB' && walletType !== 'INJI_MOBILE' ? (
            <div className="inji-subcard border-dashed border-slate-300 dark:border-[#951F6F]/40 p-8 text-center rounded-2xl flex flex-col items-center justify-center">
              <p className="text-xs text-slate-800 dark:text-slate-200 font-bold">Vault is currently empty</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Issue a credential from Column 1 to hold here</p>
            </div>
          ) : null}
        </div>

        {walletType === 'MOCK_EXTERNAL_WALLET' && activeVc && !supportsVPFlow && (
          <p className="-mt-3 text-[11px] text-amber-700 dark:text-amber-300" role="status">
            {activeVc.format === 'mso_mdoc'
              ? 'mDoc has local cryptographic checks; the OpenID4VP device-response flow is not implemented yet.'
              : 'Choose a verifier that supports this credential format to present it.'}
          </p>
        )}
        {walletType === 'INJI_WEB' && tamperScenario !== 'NONE' && (
          <p className="-mt-3 text-[11px] text-amber-700 dark:text-amber-300" role="status">
            Attack injection is unavailable for the existing Inji Web flow. Choose Normal Verification to use its native presentation.
          </p>
        )}
        {walletType === 'INJI_WEB' && verifierImplementation === 'MOCK_EXTERNAL_OID4VP' && (
          <p className="-mt-3 text-[11px] text-amber-700 dark:text-amber-300" role="status">
            Inji Web presentations are currently created and verified by Inji Verify. Select Inji Verify to use this wallet route.
          </p>
        )}
        {walletType === 'INJI_MOBILE' && verifierImplementation === 'MOCK_EXTERNAL_OID4VP' && (
          <p className="-mt-3 text-[11px] text-amber-700 dark:text-amber-300" role="status">
            The phone QR presentation is an Inji Verify request. Select Inji Verify before scanning with Inji Mobile.
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={handlePresent}
          disabled={walletType === 'INJI_MOBILE' || isPresenting ||
            (walletType === 'INJI_WEB' && !injiWebCanPresent) ||
            (walletType === 'INJI_WEB' && tamperScenario !== 'NONE') ||
            (walletType === 'INJI_WEB' && injiWebCredentials.length === 0) ||
            (walletType !== 'INJI_WEB' && !activeVc) ||
            (walletType === 'MOCK_EXTERNAL_WALLET' && !supportsVPFlow)}
          className={`w-full font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md border border-white/20 cursor-pointer ${
            isPresented
              ? 'bg-[#1F9F60] text-white'
              : 'bg-gradient-to-r from-[#1F9F60] to-emerald-600 hover:from-[#17854f] hover:to-emerald-700 disabled:opacity-50 text-white'
          }`}
        >
          <span>{isPresenting ? walletType === 'INJI_WEB' ? 'Waiting for Inji Web…' : 'Presenting via OpenID4VP…' : walletType === 'INJI_WEB' ? 'Present held credential via Inji Web' : walletType === 'MOCK_EXTERNAL_WALLET' ? 'Present via OpenID4VP' :
            isPresented ? 'Selected for Verification' : 'Select Credential for Verification'}</span>
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
};
