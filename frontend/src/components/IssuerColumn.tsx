import React, { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { CustomSelect, type SelectOption } from './CustomSelect';

interface IssuerColumnProps {
  walletType: 'INJI_WEB' | 'PLAYGROUND_BROWSER_VAULT' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET';
  onIssueSuccess: (vc: any, flowId: string) => void;
  onFlowStarted: (flowId: string) => void;
}

export const IssuerColumn: React.FC<IssuerColumnProps> = ({ walletType, onIssueSuccess, onFlowStarted }) => {
  const [implementation, setImplementation] = useState<'INJI_CERTIFY' | 'MOCK_EXTERNAL_OID4VCI'>('INJI_CERTIFY');
  const [format, setFormat] = useState<'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'>('ldp_vc');
  const selectedImplementation = implementation;
  const selectedFormat = walletType === 'INJI_MOBILE' ? 'ldp_vc' : format;
  const [uin, setUin] = useState('9876543210');
  const [fullName, setFullName] = useState('Ramesh Patel');
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [mobileOffer, setMobileOffer] = useState<string | null>(null);
  const [isCreatingMobileOffer, setIsCreatingMobileOffer] = useState(false);
  const certifySupportsSelectedFormat = selectedImplementation !== 'INJI_CERTIFY' || selectedFormat === 'ldp_vc';
  const canIssueToSelectedWallet = walletType !== 'INJI_WEB' && walletType !== 'INJI_MOBILE' && certifySupportsSelectedFormat;
  const allFormats = [
    { id: 'ldp_vc', label: 'W3C VC' },
    { id: 'vc+sd-jwt', label: 'SD-JWT' },
    { id: 'mso_mdoc', label: 'ISO mDoc' }
  ];
  const selectableFormats = selectedImplementation === 'INJI_CERTIFY' || walletType === 'INJI_MOBILE'
    ? allFormats.slice(0, 1)
    : walletType === 'MOCK_EXTERNAL_WALLET'
      ? allFormats.filter((item) => item.id === 'vc+sd-jwt')
      : allFormats;

  const issuerOptions: SelectOption[] = [
    { value: 'INJI_CERTIFY', label: 'Inji Certify (Docker :8090)' },
    { value: 'MOCK_EXTERNAL_OID4VCI', label: 'Local Mock OID4VCI Issuer' }
  ];

  const handleIssue = async () => {
    const flowId = crypto.randomUUID();
    onFlowStarted(flowId);
    setIsIssuing(true);
    setIssueError(null);
    try {
      let credentialType = 'FarmerCredential';
      if (selectedFormat === 'vc+sd-jwt') credentialType = 'NationalId';
      if (selectedFormat === 'mso_mdoc') credentialType = 'MockMdl';

      const res = await fetch('/api/issuer/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Playground-Flow-Id': flowId },
        body: JSON.stringify({
          implementation: selectedImplementation,
          format: selectedFormat,
          credentialType,
          uin,
          subjectData: { fullName }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.credential) throw new Error(data.error || 'Credential issuance failed');
      onIssueSuccess(data.credential, flowId);
    } catch (err: any) {
      setIssueError(err.message || 'Credential issuance failed');
    } finally {
      setIsIssuing(false);
    }
  };

  const handleCreateMobileOffer = async () => {
    const flowId = crypto.randomUUID();
    onFlowStarted(flowId);
    setIsCreatingMobileOffer(true);
    setIssueError(null);
    setMobileOffer(null);
    try {
      const response = await fetch('/api/issuer/mobile-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Playground-Flow-Id': flowId },
        body: JSON.stringify({
          uin,
          fullName
        })
      });
      const data = await response.json();
      if (!response.ok || typeof data.credentialOfferUri !== 'string') throw new Error(data.error || `Offer creation failed (${response.status})`);
      setMobileOffer(data.credentialOfferUri);
    } catch (error: any) {
      setIssueError(error.message || 'Could not create Inji Mobile offer');
    } finally {
      setIsCreatingMobileOffer(false);
    }
  };

  return (
    <div className="inji-card min-w-0 flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#FF8C38] text-lg tracking-tight italic">ISSUER</h2>
          <span className="text-xs text-[#F2680C] dark:text-[#FF9D5C] font-mono font-extrabold">{selectedImplementation === 'INJI_CERTIFY' ? 'Inji Certify' : 'Local Mock OID4VCI Issuer'}</span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#F2680C]/10 dark:bg-[#F2680C]/30 text-[#F2680C] dark:text-[#FF9D5C] border border-[#F2680C]/30 dark:border-[#F2680C]/60 px-3 py-1 rounded-full">
          {selectedImplementation === 'INJI_CERTIFY' ? 'OpenID4VCI' : 'MOCK OID4VCI'}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-5 flex-1 justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Issuer Node Target:</span>
            </label>
            <CustomSelect
              options={issuerOptions}
              value={selectedImplementation}
              onChange={(val) => {
                const nextImplementation = val as 'INJI_CERTIFY' | 'MOCK_EXTERNAL_OID4VCI';
                setImplementation(nextImplementation);
                if (nextImplementation === 'INJI_CERTIFY') setFormat('ldp_vc');
              }}
            />
            {selectedImplementation === 'MOCK_EXTERNAL_OID4VCI' && walletType === 'INJI_MOBILE' && <div className="inji-subcard rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-300">
              <p>Local Mock is the browser reference issuer; it cannot create an Inji Mobile offer QR. For a phone test, switch this issuer to Inji Certify.</p>
              <button type="button" onClick={() => { setImplementation('INJI_CERTIFY'); setFormat('ldp_vc'); setMobileOffer(null); setIssueError(null); }} className="mt-2 font-bold text-[#451691] underline dark:text-[#C084FC]">Use Inji Certify for the mobile QR</button>
            </div>}
            {selectedImplementation === 'MOCK_EXTERNAL_OID4VCI' && walletType === 'INJI_WEB' && <p role="status" className="text-[10px] text-amber-700 dark:text-amber-300">Local Mock cannot issue into the Inji Web vault. Choose Playground Browser Vault or Local Reference Wallet in Column 2; Inji Web issuance uses Mimoto.</p>}
            {selectedImplementation === 'MOCK_EXTERNAL_OID4VCI' && walletType !== 'INJI_MOBILE' && walletType !== 'INJI_WEB' && <p className="text-[10px] text-slate-500 dark:text-slate-400">Local Mock issues directly into the selected lab wallet path; the verifier remains independently selectable in Column 3.</p>}
          </div>

          {walletType !== 'INJI_WEB' ? <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Credential Format:</span>
            </label>
            <div className={`min-w-0 grid gap-2 ${selectableFormats.length === 1 ? 'grid-cols-1' : 'grid-cols-2 min-[480px]:grid-cols-3'}`}>
              {selectableFormats.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id as any)}
                  className={`min-w-0 py-2.5 px-2 text-xs leading-tight rounded-xl font-bold border text-center transition-all cursor-pointer ${
                  selectedFormat === item.id
                      ? 'bg-gradient-to-r from-[#F2680C] to-[#451691] border-transparent text-white shadow-md'
                      : 'bg-white border-slate-300 text-slate-800 shadow-xs hover:border-[#F2680C] dark:bg-[#190D2E] dark:border-[#951F6F]/40 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {walletType === 'INJI_MOBILE'
              ? <p className="text-[10px] text-slate-500 dark:text-slate-400">The Inji Mobile offer path supports W3C VC. Other formats are unavailable in this phone flow.</p>
                : selectedImplementation === 'INJI_CERTIFY'
                  ? <p className="text-[10px] text-slate-500 dark:text-slate-400">This Inji Certify profile issues W3C VC. Select Local Mock OID4VCI Issuer for the SD-JWT reference flow or local mDoc cryptography.</p>
                  : walletType === 'MOCK_EXTERNAL_WALLET'
                    ? <p className="text-[10px] text-slate-500 dark:text-slate-400">The local OpenID4VP wallet currently presents SD-JWT. W3C and mDoc are hidden here because this wallet path does not support them.</p>
                  : selectedFormat === 'vc+sd-jwt'
                    ? <p className="text-[10px] text-slate-500 dark:text-slate-400">SD-JWT continues through the Local Reference Wallet and Local Mock Crypto Verifier. Select those in Columns 2 and 3 for OpenID4VP.</p>
                    : selectedFormat === 'mso_mdoc'
                      ? <p className="text-[10px] text-slate-500 dark:text-slate-400">mDoc supports local cryptographic verification. OpenID4VP device-response presentation is not implemented for this format.</p>
                      : null}
          </div> : <div className="inji-subcard rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300">Inji Web selects the credential format in its own Mimoto issuer flow.</div>}

          <div className="inji-subcard flex flex-col gap-3 p-4 rounded-2xl">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Subject Name:</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ramesh Patel"
                className="bg-white dark:bg-[#100620] border-slate-300 dark:border-[#951F6F]/40 text-slate-900 dark:text-white font-mono text-xs font-bold rounded-xl focus:border-[#F2680C]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">National ID / UIN:</label>
              <input
                type="text"
                value={uin}
                onChange={(e) => setUin(e.target.value)}
                placeholder="9876543210"
                className="bg-white dark:bg-[#100620] border-slate-300 dark:border-[#951F6F]/40 text-slate-900 dark:text-white font-mono text-xs font-bold rounded-xl focus:border-[#F2680C]"
              />
            </div>
            {selectedImplementation === 'INJI_CERTIFY' && <p className="text-[10px] text-slate-500 dark:text-slate-400">Other farmer claims use the bundled demo fixture.</p>}
          </div>
        </div>

        {issueError && <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{issueError}</p>}
        {walletType !== 'INJI_MOBILE' && walletType !== 'INJI_WEB' && canIssueToSelectedWallet && <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={handleIssue}
          disabled={isIssuing}
          className="w-full bg-gradient-to-r from-[#F2680C] to-[#451691] hover:from-[#e05b00] hover:to-[#39107b] disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md border border-white/20 cursor-pointer"
        >
          {isIssuing ? (
            <>
              <Sparkles className="w-4 h-4 animate-spin text-white" />
              <span>Issuing Credential...</span>
            </>
          ) : (
            <>
              <span>Issue to playground vault</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>}
        {walletType === 'INJI_WEB' && <div role="status" className="inji-subcard rounded-xl p-3 text-xs text-amber-800 dark:text-amber-200">Inji Web issuance is handled by Mimoto’s issuer page. Open Inji Web in Column 2, sign in, choose the Farmer issuer, then refresh the Mimoto vault. This button only issues into the playground vault.</div>}
        {walletType === 'INJI_MOBILE' && selectedImplementation === 'INJI_CERTIFY' && selectedFormat === 'ldp_vc' && <button
          type="button"
          onClick={() => void handleCreateMobileOffer()}
          disabled={isCreatingMobileOffer}
          className="mobile-offer-button w-full rounded-xl border border-white/25 px-3 py-3.5 text-xs font-extrabold shadow-md transition-all disabled:cursor-wait disabled:opacity-60"
        >{isCreatingMobileOffer ? 'Creating Inji Mobile offer…' : 'Create Inji Mobile offer QR'}</button>}
        {mobileOffer && <div className="inji-subcard flex flex-col items-center gap-3 rounded-2xl p-4 text-center">
          <QRCodeSVG value={mobileOffer} size={208} level="M" includeMargin aria-label="Inji Mobile credential offer QR code" />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">In Inji Mobile, use + → Scan &amp; Download to scan this issuer QR within 10 minutes.</p>
          <a className="break-all text-[10px] text-[#451691] underline dark:text-[#C084FC]" href={mobileOffer}>{mobileOffer}</a>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">The offer expires in 10 minutes. The configured public HTTPS origin and DID must be reachable from the phone.</p>
        </div>}
      </div>
    </div>
  );
};
