import React from 'react';
import { KycReviewPanel } from '../../components/admin/KycReviewPanel';

export const KycCompliancePage: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">KYC & Compliance Verification</h1>
          <p className="text-xs text-gray-400 mt-1">Review pending user verification requests, inspect submitted identity documents, and manage Tier promotions.</p>
        </div>
      </div>
      <KycReviewPanel />
    </div>
  );
};

export default KycCompliancePage;
