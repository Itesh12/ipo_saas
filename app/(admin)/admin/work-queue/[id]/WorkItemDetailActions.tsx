"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminWorkItem } from "@/features/admin/types/workQueue.types";
import { WorkItemResolutionModal } from "@/features/admin/components/workQueue/WorkItemResolutionModal";
import {
  assignWorkItemAction,
  markInvestigatingAction,
} from "@/features/admin/actions/workQueueActions";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, AlertTriangle, RotateCcw, UserPlus, Search } from "lucide-react";

interface WorkItemDetailActionsProps {
  item: AdminWorkItem;
  userRole: string;
  userId?: string;
}

export function WorkItemDetailActions({ item, userRole, userId }: WorkItemDetailActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<"resolve" | "dismiss" | "reopen" | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);

  const canResolve = ["super_admin", "admin"].includes(userRole);
  const canInvestigate = ["super_admin", "admin", "editor"].includes(userRole);
  const isAssignedToMe = item.assigned_to === userId;

  async function handleSelfAssign() {
    if (!userId) return;
    setIsAssigning(true);
    try {
      await assignWorkItemAction(item.id, userId, "Self-assigned for investigation");
      router.refresh();
    } catch (err) {
      console.error("Assign error:", err);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleInvestigate() {
    setIsInvestigating(true);
    try {
      await markInvestigatingAction(item.id);
      router.refresh();
    } catch (err) {
      console.error("Investigate error:", err);
    } finally {
      setIsInvestigating(false);
    }
  }

  return (
    <div className="space-y-2">
      {!isAssignedToMe && ["open", "investigating"].includes(item.status) && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleSelfAssign}
          isLoading={isAssigning}
          className="w-full justify-start text-xs"
          leftIcon={<UserPlus className="w-3.5 h-3.5" />}
        >
          Assign to Me
        </Button>
      )}

      {item.status === "open" && canInvestigate && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleInvestigate}
          isLoading={isInvestigating}
          className="w-full justify-start text-xs"
          leftIcon={<Search className="w-3.5 h-3.5" />}
        >
          Start Investigation
        </Button>
      )}

      {["open", "investigating"].includes(item.status) && canResolve && (
        <>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setActiveModal("resolve")}
            className="w-full justify-start text-xs bg-emerald-600 hover:bg-emerald-500"
            leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            Mark as Resolved
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveModal("dismiss")}
            className="w-full justify-start text-xs text-red-400 hover:bg-red-500/10"
            leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
          >
            Dismiss Alert
          </Button>
        </>
      )}

      {["resolved", "dismissed"].includes(item.status) && canResolve && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setActiveModal("reopen")}
          className="w-full justify-start text-xs text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Reopen Work Item
        </Button>
      )}

      {activeModal && (
        <WorkItemResolutionModal
          item={item}
          mode={activeModal}
          onClose={() => setActiveModal(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
