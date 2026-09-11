"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IPORow, IPOPublicationStatus } from "../types/ipo.types";
import { IPOStatusBadge } from "@/components/ipo/IPOStatusBadge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { formatCrores, formatDate } from "@/lib/utils";
import { transitionPublicationAction } from "../actions/ipoActions";
import {
  Edit3,
  Eye,
  CheckCircle,
  Search,
  ExternalLink,
  Plus,
  Clock,
  Layers,
} from "lucide-react";

interface AdminIPOTableProps {
  initialIpos: IPORow[];
}

export function AdminIPOTable({ initialIpos }: AdminIPOTableProps) {
  const { showToast } = useToast();
  const [ipos, setIpos] = useState<IPORow[]>(initialIpos);
  const [search, setSearch] = useState("");
  const [pubFilter, setPubFilter] = useState<IPOPublicationStatus | "all">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filteredIpos = ipos.filter((ipo) => {
    if (pubFilter !== "all" && ipo.publication_status !== pubFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        ipo.company_name.toLowerCase().includes(q) ||
        (ipo.symbol && ipo.symbol.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleStatusTransition = async (id: string, nextStatus: IPOPublicationStatus) => {
    setLoadingId(id);
    try {
      const res = await transitionPublicationAction(id, nextStatus);
      if (res.success) {
        setIpos((prev) =>
          prev.map((i) => (i.id === id ? { ...i, publication_status: nextStatus } : i))
        );
        showToast({
          type: "success",
          title: "Publication Status Updated",
          message: `IPO has been transitioned to '${nextStatus}'.`,
        });
      } else {
        showToast({
          type: "error",
          title: "Action Failed",
          message: res.error || "Failed to update publication status.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Error",
        message: "Failed to communicate with server.",
      });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex-1 w-full sm:max-w-xs">
          <Input
            placeholder="Search company or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={pubFilter}
            onChange={(e) => setPubFilter(e.target.value as typeof pubFilter)}
          >
            <option value="all">All States</option>
            <option value="draft">Drafts Only</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="published">Published (Live)</option>
            <option value="archived">Archived</option>
          </Select>

          <Link href="/admin/ipos/new">
            <Button size="sm" variant="primary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Create IPO
            </Button>
          </Link>
        </div>
      </div>

      {/* Data Table */}
      {filteredIpos.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-3">
          <Layers className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">No IPO records found</h4>
          <p className="text-xs text-[var(--text-secondary)]">Create a new IPO master to begin.</p>
          <Link href="/admin/ipos/new">
            <Button size="sm" variant="primary">Create First IPO</Button>
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company & Symbol</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price Band</TableHead>
              <TableHead>Issue Size</TableHead>
              <TableHead>Bidding Window</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Publication State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredIpos.map((ipo) => {
              const isBusy = loadingId === ipo.id;
              const formattedPrice =
                ipo.price_band_low && ipo.price_band_high
                  ? `₹${ipo.price_band_low} - ₹${ipo.price_band_high}`
                  : "TBA";

              return (
                <TableRow key={ipo.id}>
                  <TableCell>
                    <div className="font-bold text-[var(--text-primary)]">{ipo.company_name}</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">
                      {ipo.symbol || ipo.slug}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="uppercase text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {ipo.category}
                    </span>
                  </TableCell>

                  <TableCell className="font-medium text-[var(--text-primary)]">
                    {formattedPrice}
                  </TableCell>

                  <TableCell>{formatCrores(ipo.issue_size_cr)}</TableCell>

                  <TableCell>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {formatDate(ipo.open_date)} – {formatDate(ipo.close_date)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <IPOStatusBadge status={ipo.status} />
                  </TableCell>

                  <TableCell>
                    <IPOStatusBadge publicationStatus={ipo.publication_status} />
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Workflow state transition actions */}
                      {ipo.publication_status === "draft" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          isLoading={isBusy}
                          onClick={() => handleStatusTransition(ipo.id, "in_review")}
                          leftIcon={<Clock className="w-3 h-3" />}
                        >
                          Review
                        </Button>
                      )}

                      {ipo.publication_status === "in_review" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          isLoading={isBusy}
                          onClick={() => handleStatusTransition(ipo.id, "approved")}
                          leftIcon={<CheckCircle className="w-3 h-3 text-[var(--status-info)]" />}
                        >
                          Approve
                        </Button>
                      )}

                      {ipo.publication_status === "approved" && (
                        <Button
                          size="sm"
                          variant="success"
                          isLoading={isBusy}
                          onClick={() => handleStatusTransition(ipo.id, "published")}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Publish
                        </Button>
                      )}

                      {ipo.publication_status === "published" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={isBusy}
                          onClick={() => handleStatusTransition(ipo.id, "draft")}
                          title="Unpublish to Draft"
                        >
                          Unpublish
                        </Button>
                      )}

                      {/* Edit Button */}
                      <Link href={`/admin/ipos/${ipo.id}/edit`}>
                        <Button size="icon" variant="ghost" title="Edit IPO Master">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                      </Link>

                      {/* Public view if published */}
                      {ipo.publication_status === "published" && (
                        <Link href={`/ipos/${ipo.slug}`} target="_blank">
                          <Button size="icon" variant="ghost" title="View Public Page">
                            <ExternalLink className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
