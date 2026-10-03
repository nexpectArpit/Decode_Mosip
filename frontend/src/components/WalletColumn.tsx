import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { formatCredentialTitle } from '../utils/format';

interface WalletColumnProps {
  issuedVc: any;
  onSelectForVerification: (vc: any) => void;
}

export const WalletColumn: React.FC<WalletColumnProps> = ({ issuedVc, onSelectForVerification }) => {
  const [walletType, setWalletType] = useState<'INJI_WEB' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET'>('INJI_WEB');
  const [storedCredentials, setStoredCredentials] = useState<any[]>([]);

  const walletOptions: SelectOption[] = [
    { value: 'INJI_WEB', label: 'Inji Web (Browser Vault)' },
    { value: 'INJI_MOBILE', label: 'Inji Wallet Mobile (QR)' },
    { value: 'MOCK_EXTERNAL_WALLET', label: 'External Wallet (OID4VP)' }
  ];

  useEffect(() => {
    if (issuedVc) {
      setStoredCredentials(prev => {
        const exists = prev.some(c => c.id === issuedVc.id);
        if (exists) return prev;
        return [issuedVc, ...prev];
      });
    }
  }, [issuedVc]);

  const activeVc = storedCredentials[0] || issuedVc;
  const [isPresented, setIsPresented] = useState(false);

  const handlePresent = async () => {
    if (!activeVc) return;
    setIsPresented(true);
    onSelectForVerification(activeVc);

    try {
      await fetch('http://localhost:4000/api/verifier/vp-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'inji-web-vault',
          presentationDefinition: {
            id: activeVc.type?.[1] || 'FarmerCredential',
            format: { [activeVc.format || 'ldp_vc']: {} }
          }
        })
      });
    } catch (err) {
      console.error('Presentation error:', err);
    } finally {
      setTimeout(() => setIsPresented(false), 2000);
    }
  };

  return (
    <div className="inji-card flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#38BDF8] text-lg tracking-tight italic">WALLET</h2>
          <span className="text-xs text-[#002452] dark:text-[#38BDF8] font-mono font-extrabold">Inji Web</span>
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
              onChange={(val) => setWalletType(val as any)}
            />
          </div>

          <div className="inji-subcard rounded-2xl p-3.5 flex items-center justify-between text-xs">
            <span className="text-[#002452] dark:text-white font-extrabold">Vault Status:</span>
            <span className="font-mono text-[#1F9F60] dark:text-[#4ADE80] font-bold bg-[#1F9F60]/10 dark:bg-[#1F9F60]/30 px-3 py-1 rounded-full border border-[#1F9F60]/30 dark:border-[#1F9F60]/60">
              {storedCredentials.length} Held
            </span>
          </div>

          {activeVc ? (
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
                <div className="font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#070210] p-3 rounded-xl border border-slate-200 dark:border-[#951F6F]/30 space-y-1 text-[11px]">
                  <div>Subject: <strong className="text-slate-900 dark:text-white">{activeVc.credentialSubject?.fullName || activeVc.credentialSubject?.id || 'Holder'}</strong></div>
                  <div>Issuer: <span className="text-[#F2680C] font-semibold">{activeVc.issuer || activeVc.issuerImplementation}</span></div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="inji-subcard border-dashed border-slate-300 dark:border-[#951F6F]/40 p-8 text-center rounded-2xl flex flex-col items-center justify-center">
              <p className="text-xs text-slate-800 dark:text-slate-200 font-bold">Vault is currently empty</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Issue a credential from Column 1 to hold here</p>
            </div>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={handlePresent}
          disabled={!activeVc}
          className={`w-full font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md border border-white/20 cursor-pointer ${
            isPresented
              ? 'bg-[#1F9F60] text-white'
              : 'bg-gradient-to-r from-[#1F9F60] to-emerald-600 hover:from-[#17854f] hover:to-emerald-700 disabled:opacity-50 text-white'
          }`}
        >
          <span>{isPresented ? 'Presented to Verifier' : 'Present Credential'}</span>
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
};
