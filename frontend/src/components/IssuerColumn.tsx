import React, { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { CustomSelect, type SelectOption } from './CustomSelect';

interface IssuerColumnProps {
  onIssueSuccess: (vc: any) => void;
}

export const IssuerColumn: React.FC<IssuerColumnProps> = ({ onIssueSuccess }) => {
  const [implementation, setImplementation] = useState<'INJI_CERTIFY' | 'MOCK_EXTERNAL_OID4VCI'>('INJI_CERTIFY');
  const [format, setFormat] = useState<'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'>('ldp_vc');
  const [uin, setUin] = useState('9876543210');
  const [fullName, setFullName] = useState('Ramesh Patel');
  const [isIssuing, setIsIssuing] = useState(false);

  const issuerOptions: SelectOption[] = [
    { value: 'INJI_CERTIFY', label: 'Inji Certify (Docker :8090)' },
    { value: 'MOCK_EXTERNAL_OID4VCI', label: 'External Mock Issuer (OID4VCI)' }
  ];

  const handleIssue = async () => {
    setIsIssuing(true);
    try {
      let credentialType = 'FarmerCredential';
      if (format === 'vc+sd-jwt') credentialType = 'NationalId';
      if (format === 'mso_mdoc') credentialType = 'MockMdl';

      const res = await fetch('http://localhost:4000/api/issuer/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          implementation,
          format,
          credentialType,
          uin,
          subjectData: { fullName }
        })
      });

      const data = await res.json();
      if (data.success && data.credential) {
        onIssueSuccess(data.credential);
      }
    } catch (err) {
      console.error('Issuance error:', err);
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <div className="inji-card flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#FF8C38] text-lg tracking-tight italic">ISSUER</h2>
          <span className="text-xs text-[#F2680C] dark:text-[#FF9D5C] font-mono font-extrabold">Inji Certify</span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#F2680C]/10 dark:bg-[#F2680C]/30 text-[#F2680C] dark:text-[#FF9D5C] border border-[#F2680C]/30 dark:border-[#F2680C]/60 px-3 py-1 rounded-full">
          OpenID4VCI
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
              value={implementation}
              onChange={(val) => setImplementation(val as any)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Credential Format:</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'ldp_vc', label: 'W3C VC' },
                { id: 'vc+sd-jwt', label: 'SD-JWT' },
                { id: 'mso_mdoc', label: 'ISO mDoc' }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id as any)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                    format === item.id
                      ? 'bg-gradient-to-r from-[#F2680C] to-[#451691] border-transparent text-white shadow-md'
                      : 'bg-white border-slate-300 text-slate-800 shadow-xs hover:border-[#F2680C] dark:bg-[#190D2E] dark:border-[#951F6F]/40 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

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
          </div>
        </div>

        {/* Issue Button */}
        <motion.button
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
              <span>Issue Credential</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
