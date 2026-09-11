import React from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { IPOForm } from "@/features/ipo/components/IPOForm";
import { updateIPOServerAction } from "@/features/ipo/actions/ipoActions";
import { createClient } from "@/lib/supabase/server";
import { IPORow } from "@/features/ipo/types/ipo.types";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditIPOMasterPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ipos")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const ipo = data as IPORow;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit IPO: ${ipo.company_name}`}
        description={`Modify parameters for ${ipo.company_name} (${ipo.symbol || ipo.slug}). Current publication state: ${ipo.publication_status}.`}
      />

      <IPOForm
        initialData={ipo}
        isEditMode={true}
        onSubmitAction={async (formData) => {
          "use server";
          return await updateIPOServerAction(id, formData);
        }}
      />
    </div>
  );
}
