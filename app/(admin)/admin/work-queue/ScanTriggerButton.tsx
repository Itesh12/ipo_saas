"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { runAnomalyScanAction } from "@/features/admin/actions/anomalyScannerActions";
import { RefreshCw, CheckCircle2 } from "lucide-react";

export function ScanTriggerButton() {
  const [isScanning, setIsScanning] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  async function handleScan() {
    setIsScanning(true);
    setResultMessage(null);

    try {
      const res = await runAnomalyScanAction();
      if (res.success && res.summary) {
        setResultMessage(`Scanned! ${res.summary.detectedCount} anomalies found.`);
        setTimeout(() => setResultMessage(null), 4000);
      }
    } catch (err: unknown) {
      setResultMessage(err instanceof Error ? err.message : "Scan failed");
      setTimeout(() => setResultMessage(null), 4000);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {resultMessage && (
        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {resultMessage}
        </span>
      )}
      <Button
        size="sm"
        variant="primary"
        onClick={handleScan}
        isLoading={isScanning}
        leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
      >
        Run Anomaly Scan
      </Button>
    </div>
  );
}
