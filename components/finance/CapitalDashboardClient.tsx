/**
 * components/finance/CapitalDashboardClient.tsx
 *
 * Client interactive container for Capital & General Ledger page.
 * Houses modals for Deposit and Opening Balance Declaration.
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Plus, Landmark } from 'lucide-react';
import { CapitalDepositModal } from './CapitalDepositModal';
import { DeclareOpeningBalanceModal } from './DeclareOpeningBalanceModal';

export function CapitalDashboardClient() {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showOpeningBalModal, setShowOpeningBalModal] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Landmark className="w-3.5 h-3.5" />}
          onClick={() => setShowOpeningBalModal(true)}
        >
          Declare Opening Balance
        </Button>
        <Button
          size="sm"
          variant="primary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setShowDepositModal(true)}
        >
          Deposit Funds
        </Button>
      </div>

      <CapitalDepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
      />

      <DeclareOpeningBalanceModal
        isOpen={showOpeningBalModal}
        onClose={() => setShowOpeningBalModal(false)}
      />
    </>
  );
}
