import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { IPOForm } from "@/features/ipo/components/IPOForm";
import { createIPOServerAction } from "@/features/ipo/actions/ipoActions";

export default function NewIPOMasterPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create New IPO Master"
        description="Register a new Mainboard or SME initial public offering into the system. The record will default to 'Draft' state until reviewed and approved."
      />

      <IPOForm
        isEditMode={false}
        onSubmitAction={createIPOServerAction}
      />
    </div>
  );
}
