"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { IPOFormData, ipoSchema } from "../schemas/ipoValidation";
import { IPORow } from "../types/ipo.types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { slugify, formatINR } from "@/lib/utils";
import { calculateMinimumInvestment } from "../services/ipoLifecycle";
import { Save, ArrowLeft, Building2, Coins, Layers, Calendar, Eye } from "lucide-react";
import Link from "next/link";

interface IPOFormProps {
  initialData?: Partial<IPORow>;
  isEditMode?: boolean;
  onSubmitAction: (data: IPOFormData) => Promise<{ success: boolean; error?: string }>;
}

export function IPOForm({
  initialData,
  isEditMode = false,
  onSubmitAction,
}: IPOFormProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [companyName, setCompanyName] = useState(initialData?.company_name || "");
  const [symbol, setSymbol] = useState(initialData?.symbol || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [logo, setLogo] = useState(initialData?.company_logo || "");
  const [category, setCategory] = useState<"mainboard" | "sme_bse" | "sme_nse">(
    initialData?.category || "mainboard"
  );
  const [issueType, setIssueType] = useState<"book_building" | "fixed_price">(
    initialData?.issue_type || "book_building"
  );
  const [status, setStatus] = useState(initialData?.status || "announced");
  const [publicationStatus, setPublicationStatus] = useState(
    initialData?.publication_status || "draft"
  );

  // Pricing & Lots
  const [priceLow, setPriceLow] = useState<number | string>(initialData?.price_band_low ?? "");
  const [priceHigh, setPriceHigh] = useState<number | string>(initialData?.price_band_high ?? "");
  const [faceValue, setFaceValue] = useState<number | string>(initialData?.face_value ?? 10);
  const [lotSize, setLotSize] = useState<number | string>(initialData?.lot_size ?? 1);

  // Issue Structure
  const [issueSizeCr, setIssueSizeCr] = useState<number | string>(initialData?.issue_size_cr ?? "");
  const [freshIssueCr, setFreshIssueCr] = useState<number | string>(initialData?.fresh_issue_cr ?? "");
  const [ofsCr, setOfsCr] = useState<number | string>(initialData?.ofs_cr ?? "");
  const [sharesOffered, setSharesOffered] = useState<number | string>(initialData?.shares_offered ?? "");

  // Quotas
  const [retailQuota, setRetailQuota] = useState<number | string>(initialData?.retail_quota_pct ?? 35);
  const [qibQuota, setQibQuota] = useState<number | string>(initialData?.qib_quota_pct ?? 50);
  const [hniQuota, setHniQuota] = useState<number | string>(initialData?.hni_quota_pct ?? 15);

  // Governance
  const [exchange, setExchange] = useState(initialData?.exchange || "NSE, BSE");
  const [registrar, setRegistrar] = useState(initialData?.registrar_name || "");
  const [leadManagersStr, setLeadManagersStr] = useState(
    (initialData?.lead_managers || []).join(", ")
  );

  // Timeline Dates
  const [announcementDate, setAnnouncementDate] = useState(initialData?.announcement_date || "");
  const [openDate, setOpenDate] = useState(initialData?.open_date || "");
  const [closeDate, setCloseDate] = useState(initialData?.close_date || "");
  const [allotmentDate, setAllotmentDate] = useState(initialData?.allotment_date || "");
  const [refundDate, setRefundDate] = useState(initialData?.refund_date || "");
  const [listingDate, setListingDate] = useState(initialData?.listing_date || "");

  // Content
  const [aboutCompany, setAboutCompany] = useState(initialData?.about_company || "");

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-generate slug when company name changes on new creations
  const handleNameChange = (val: string) => {
    setCompanyName(val);
    if (!isEditMode) {
      setSlug(slugify(val));
    }
  };

  // Calculate live minimum investment
  const calculatedMinInvestment = calculateMinimumInvestment(
    Number(priceHigh) || null,
    Number(lotSize) || null,
    Number(priceLow) || null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const formData: IPOFormData = {
      company_name: companyName,
      symbol: symbol.trim() || undefined,
      slug: slug.trim(),
      company_logo: logo.trim() || undefined,
      category,
      issue_type: issueType,
      status: status as IPOFormData["status"],
      publication_status: publicationStatus as IPOFormData["publication_status"],
      price_band_low: priceLow !== "" ? Number(priceLow) : undefined,
      price_band_high: priceHigh !== "" ? Number(priceHigh) : undefined,
      face_value: Number(faceValue) || 10,
      lot_size: Number(lotSize) || 1,
      issue_size_cr: issueSizeCr !== "" ? Number(issueSizeCr) : undefined,
      fresh_issue_cr: freshIssueCr !== "" ? Number(freshIssueCr) : undefined,
      ofs_cr: ofsCr !== "" ? Number(ofsCr) : undefined,
      shares_offered: sharesOffered !== "" ? Number(sharesOffered) : undefined,
      retail_quota_pct: Number(retailQuota) || 35,
      qib_quota_pct: Number(qibQuota) || 50,
      hni_quota_pct: Number(hniQuota) || 15,
      exchange: exchange || "NSE, BSE",
      registrar_name: registrar.trim() || undefined,
      lead_managers: leadManagersStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      announcement_date: announcementDate || undefined,
      open_date: openDate || undefined,
      close_date: closeDate || undefined,
      allotment_date: allotmentDate || undefined,
      refund_date: refundDate || undefined,
      listing_date: listingDate || undefined,
      about_company: aboutCompany.trim() || undefined,
    };

    const validationResult = ipoSchema.safeParse(formData);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setErrors(fieldErrors);
      showToast({
        type: "error",
        title: "Validation Error",
        message: "Please correct the highlighted form fields before submitting.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const result = await onSubmitAction(formData);
      if (result.success) {
        showToast({
          type: "success",
          title: isEditMode ? "IPO Record Updated" : "IPO Created Successfully",
          message: `${companyName} has been saved with publication status '${publicationStatus}'.`,
        });
        router.push("/admin/ipos");
        router.refresh();
      } else {
        showToast({
          type: "error",
          title: "Save Failed",
          message: result.error || "An unexpected error occurred while saving the IPO.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Submission Error",
        message: "Network or database error encountered.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/ipos">
          <Button size="sm" variant="outline" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Directory
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            {isEditMode ? "Save Changes" : "Create IPO Master"}
          </Button>
        </div>
      </div>

      {/* Section 1: Basic Company Info */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Basic Information & Classification</CardTitle>
          </div>
          <CardDescription>Legal name, stock symbol, category, and URL identifier.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Company Name *"
            placeholder="e.g. Premier Energies Limited"
            value={companyName}
            onChange={(e) => handleNameChange(e.target.value)}
            error={errors.company_name}
            required
          />

          <Input
            label="Stock Symbol / Ticker"
            placeholder="e.g. PREMIERENE"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            error={errors.symbol}
          />

          <Input
            label="SEO URL Slug *"
            placeholder="e.g. premier-energies-limited"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={errors.slug}
            helperText="Permanent public route identifier (/ipos/[slug])."
            required
          />

          <Input
            label="Company Logo URL"
            placeholder="https://example.com/logo.png"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            error={errors.company_logo}
          />

          <Select
            label="Issue Classification *"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="mainboard">Mainboard (NSE & BSE)</option>
            <option value="sme_nse">NSE SME (Emerge)</option>
            <option value="sme_bse">BSE SME</option>
          </Select>

          <Select
            label="Bidding Issue Type *"
            value={issueType}
            onChange={(e) => setIssueType(e.target.value as typeof issueType)}
          >
            <option value="book_building">100% Book Building</option>
            <option value="fixed_price">Fixed Price Issue</option>
          </Select>
        </CardContent>
      </Card>

      {/* Section 2: Pricing & Lots */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Pricing, Face Value & Lot Sizing</CardTitle>
          </div>
          <CardDescription>Price bands and lot size determine the minimum retail investment threshold.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="Price Band Floor (₹)"
            type="number"
            step="0.05"
            placeholder="427"
            value={priceLow}
            onChange={(e) => setPriceLow(e.target.value)}
            error={errors.price_band_low}
          />

          <Input
            label="Price Band Cap / Cutoff (₹) *"
            type="number"
            step="0.05"
            placeholder="450"
            value={priceHigh}
            onChange={(e) => setPriceHigh(e.target.value)}
            error={errors.price_band_high}
          />

          <Input
            label="Face Value (₹)"
            type="number"
            step="0.01"
            value={faceValue}
            onChange={(e) => setFaceValue(e.target.value)}
          />

          <Input
            label="Lot Size (Shares per lot) *"
            type="number"
            placeholder="33"
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            error={errors.lot_size}
            required
          />

          {/* Computed minimum investment badge preview */}
          <div className="sm:col-span-2 lg:col-span-4 p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/70 border border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] block uppercase">
                Calculated 1-Lot Minimum Investment (Retail)
              </span>
              <span className="text-sm font-bold text-[var(--status-success)]">
                {formatINR(calculatedMinInvestment)}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              Automatically derived from Price Cap × Lot Size
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Issue Structure & Crores */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Issue Size & Structure</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="Total Issue Size (₹ Crores)"
            type="number"
            step="0.01"
            placeholder="2830.40"
            value={issueSizeCr}
            onChange={(e) => setIssueSizeCr(e.target.value)}
            error={errors.issue_size_cr}
          />

          <Input
            label="Fresh Issue Size (₹ Crores)"
            type="number"
            step="0.01"
            placeholder="1291.40"
            value={freshIssueCr}
            onChange={(e) => setFreshIssueCr(e.target.value)}
            error={errors.fresh_issue_cr}
          />

          <Input
            label="Offer For Sale (OFS) (₹ Crores)"
            type="number"
            step="0.01"
            placeholder="1539.00"
            value={ofsCr}
            onChange={(e) => setOfsCr(e.target.value)}
            error={errors.ofs_cr}
          />

          <Input
            label="Total Shares Offered"
            type="number"
            placeholder="62897777"
            value={sharesOffered}
            onChange={(e) => setSharesOffered(e.target.value)}
          />

          <Input
            label="Retail Quota (%)"
            type="number"
            value={retailQuota}
            onChange={(e) => setRetailQuota(e.target.value)}
          />

          <Input
            label="QIB Quota (%)"
            type="number"
            value={qibQuota}
            onChange={(e) => setQibQuota(e.target.value)}
          />

          <Input
            label="NII / HNI Quota (%)"
            type="number"
            value={hniQuota}
            onChange={(e) => setHniQuota(e.target.value)}
          />

          <Input
            label="Stock Exchanges"
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
          />

          <div className="sm:col-span-2">
            <Input
              label="Registrar Name"
              placeholder="e.g. KFin Technologies Limited / Link Intime"
              value={registrar}
              onChange={(e) => setRegistrar(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Lead Managers (comma separated)"
              placeholder="Kotak Mahindra, ICICI Securities, J.P. Morgan"
              value={leadManagersStr}
              onChange={(e) => setLeadManagersStr(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Timeline Key Dates */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Timeline & Event Dates</CardTitle>
          </div>
          <CardDescription>Dates must be sequential in Indian Standard Time.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input
            label="Announcement Date"
            type="date"
            value={announcementDate}
            onChange={(e) => setAnnouncementDate(e.target.value)}
          />

          <Input
            label="Issue Open Date"
            type="date"
            value={openDate}
            onChange={(e) => setOpenDate(e.target.value)}
            error={errors.open_date}
          />

          <Input
            label="Issue Close Date"
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            error={errors.close_date}
          />

          <Input
            label="Basis of Allotment Date"
            type="date"
            value={allotmentDate}
            onChange={(e) => setAllotmentDate(e.target.value)}
            error={errors.allotment_date}
          />

          <Input
            label="Refunds & Lien Release Date"
            type="date"
            value={refundDate}
            onChange={(e) => setRefundDate(e.target.value)}
          />

          <Input
            label="Stock Exchange Listing Date"
            type="date"
            value={listingDate}
            onChange={(e) => setListingDate(e.target.value)}
            error={errors.listing_date}
          />
        </CardContent>
      </Card>

      {/* Section 5: Overview Content & Governance Status */}
      <Card>
        <CardHeader className="pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Overview Content & Publication State</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <Textarea
            label="About the Company / Business Overview"
            rows={4}
            placeholder="Brief overview of company operations, business model, and competitive strengths..."
            value={aboutCompany}
            onChange={(e) => setAboutCompany(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Select
              label="Business Lifecycle Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="announced">Announced</option>
              <option value="upcoming">Upcoming</option>
              <option value="open">Bidding Open</option>
              <option value="closed">Closed</option>
              <option value="allotment_pending">Allotment Pending</option>
              <option value="listing_soon">Listing Soon</option>
              <option value="listed">Listed</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="cancelled">Cancelled</option>
            </Select>

            <Select
              label="Publication State (Admin Gate)"
              value={publicationStatus}
              onChange={(e) => setPublicationStatus(e.target.value as typeof publicationStatus)}
              helperText="Only 'Published' records are visible to public investors."
            >
              <option value="draft">Draft (Internal)</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="published">Published (Public)</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Link href="/admin/ipos">
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            {isEditMode ? "Save Changes" : "Create IPO Master"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
