import React, { useState } from 'react';
import { Header } from './components/Header';
import { IssuerColumn } from './components/IssuerColumn';
import { WalletColumn } from './components/WalletColumn';
import { VerifierColumn } from './components/VerifierColumn';
import { ProtocolInspector } from './components/ProtocolInspector';
import { InteropModal } from './components/InteropModal';

export const App: React.FC = () => {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [issuedVc, setIssuedVc] = useState<any>(null);
  const [selectedForVerification, setSelectedForVerification] = useState<any>(null);

  const handleIssueSuccess = (vc: any) => {
    setIssuedVc(vc);
    setSelectedForVerification(vc);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <Header
        onOpenReport={() => setReportModalOpen(true)}
        onRefreshHealth={() => {}}
      />

      {/* Main 3-Column Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 flex-1 items-stretch">
        <IssuerColumn onIssueSuccess={handleIssueSuccess} />
        <WalletColumn
          issuedVc={issuedVc}
          onSelectForVerification={(vc) => setSelectedForVerification(vc)}
        />
        <VerifierColumn selectedVc={selectedForVerification || issuedVc} />
      </main>

      {/* Bottom Protocol Inspector Drawer */}
      <ProtocolInspector />

      {/* Interoperability Assessment Report Modal */}
      <InteropModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />
    </div>
  );
};

export default App;
