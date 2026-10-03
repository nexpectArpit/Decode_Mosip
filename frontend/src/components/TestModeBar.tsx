import React from 'react';

export type TamperAttackVector = 'NONE' | 'INVALID_SIGNATURE' | 'EXPIRED_CREDENTIAL' | 'ALTERED_CLAIMS' | 'MISMATCHED_NONCE';

interface TestModeBarProps {
  tamperScenario: TamperAttackVector;
  onChangeScenario: (scenario: TamperAttackVector) => void;
}

export const TestModeBar: React.FC<TestModeBarProps> = ({ tamperScenario, onChangeScenario }) => {
  const scenarios: { id: TamperAttackVector; label: string; desc: string }[] = [
    { id: 'NONE', label: '● Normal (Happy Path)', desc: 'Standard cryptographic trust chain verification.' },
    { id: 'INVALID_SIGNATURE', label: '○ Invalid Signature', desc: 'Mutate proofValue signature bytes.' },
    { id: 'EXPIRED_CREDENTIAL', label: '○ Expired VC', desc: 'Advance expiration date to past timestamp.' },
    { id: 'ALTERED_CLAIMS', label: '○ Altered Claims', desc: 'Modify claim payload without private key.' },
    { id: 'MISMATCHED_NONCE', label: '○ Replay Attack', desc: 'Simulate mismatched verifier nonce.' }
  ];

  return (
    <div className="inji-card p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 bg-white border-slate-200 shadow-sm">
      <div>
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Test Mode & Attack Vector Simulator
        </h3>
        <span className="text-[11px] text-slate-500 font-medium">
          {scenarios.find(s => s.id === tamperScenario)?.desc}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 font-mono text-[11px]">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChangeScenario(s.id)}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
              tamperScenario === s.id
                ? s.id === 'NONE'
                  ? 'bg-[#1F9F60] text-white shadow-xs'
                  : 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};
