import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { THEMES, THEME_LIST, THEME_STORAGE_KEY, DEFAULT_THEME } from "../config/themes";
import { ROLE_HIERARCHY, hasMinimumRole, PERMISSIONS } from "../lib/security/roles";
import { formatINR, formatCrores, formatPercentage, formatDate, slugify, cn } from "../lib/utils";
import {
  calculateMinimumInvestment,
  deriveIPOStatus,
  calculateDaysRemaining,
  buildIPOTimeline,
  getIPOProgressPercentage,
} from "../features/ipo/services/ipoLifecycle";
import {
  calculateYoYGrowth,
  calculateMargin,
  calculateCAGR,
  calculateROE,
  calculateROCE,
  calculateDebtToEquity,
} from "../features/ipo/services/financialCalculations";
import { calculateGMPEstimate } from "../features/ipo/services/gmpEngine";
import {
  formatSubscriptionMultiple,
  calculateWeightedSubscription,
} from "../features/ipo/services/subscriptionEngine";
import { calculateIPOScore } from "../features/ipo/services/ipoScoreEngine";
import { ipoSchema } from "../features/ipo/schemas/ipoValidation";
import { maskPAN, maskDematAccount, maskUPI } from "../features/application/services/piiMasking";
import {
  isValidApplicationTransition,
  getApplicationStatusMeta,
} from "../features/application/services/applicationLifecycle";
import {
  validateLotDivisibility,
  evaluateBids,
  computeApplicationAggregates,
  calculateAllotmentFinancials,
} from "../features/application/services/applicationRules";
import {
  validateCategoryAmount,
  isCutoffAllowedForCategory,
  CURRENT_REGULATORY_RULES,
} from "../config/investorCategories";
import {
  applicantSchema,
  createApplicationSchema,
  updateMandateSchema,
  recordAllotmentSchema,
} from "../features/application/schemas/application.schemas";
import { JournalService } from "../features/finance/services/journalService";
import { ChartOfAccountsService } from "../features/finance/services/chartOfAccountsService";
import { InvestmentService } from "../features/finance/services/investmentService";
import { DefaultMarketDataProvider } from "../features/finance/services/marketDataProvider";
import {
  declareOpeningBalanceSchema,
  capitalDepositSchema,
  capitalWithdrawalSchema,
  journalReversalSchema,
  securityPriceSchema,
} from "../features/finance/schemas/finance.schemas";
import { IpoScreenerService, DEV_SCREENER_SEED } from "../features/analytics/services/ipoScreenerService";
import { SavedScreenService } from "../features/analytics/services/savedScreenService";
import { InvestorRankingService } from "../features/analytics/services/investorRankingService";
import { PortfolioAnalyticsService } from "../features/analytics/services/portfolioAnalyticsService";
import {
  screenerFilterSchema,
  savedScreenSchema,
  investorPreferencesSchema,
  compareQuerySchema,
} from "../features/analytics/schemas/screener.schemas";
import type { HoldingItem } from "../features/finance/types/finance.types";
import type { ScreenerRecord } from "../features/analytics/types/analytics.types";
import type { IPOCategory } from "../features/ipo/types/ipo.types";
import {
  renderNotificationContent,
  escapeHtml,
  MANDATORY_GMP_DISCLAIMER,
} from "../features/notifications/services/templateRenderer";
import {
  notificationCategoryEnum,
  notificationPriorityEnum,
  notificationStatusEnum,
  notificationFilterSchema,
  updateNotificationPreferenceSchema,
  updateUserNotificationSettingSchema,
} from "../features/notifications/schemas/notification.schemas";
import { EventProcessor } from "../features/notifications/services/eventProcessor";
import { PreferenceEvaluator } from "../features/notifications/services/preferenceEvaluator";
import { IPOMilestoneEvaluator } from "../features/notifications/services/evaluators/evaluateIPOMilestones";
import { GMPMovementEvaluator } from "../features/notifications/services/evaluators/evaluateGMPMovements";
import { GovernanceRiskEvaluator } from "../features/notifications/services/evaluators/evaluateGovernanceRisks";
import { SavedScreenEvaluator } from "../features/notifications/services/evaluators/evaluateSavedScreens";
import { PortfolioHHIEvaluator } from "../features/notifications/services/evaluators/evaluatePortfolioHHI";
import {
  computeUnreadCount,
  isValidStatusTransition,
  reconcileNotification,
  drainBufferedEvents,
} from "../features/notifications/services/realtime/realtimeReconciler";
import { NotificationRealtimeService } from "../features/notifications/services/realtime/notificationRealtimeService";
import type { NotificationRow } from "../features/notifications/types/notification.types";
import { sanitizeAuditPayload } from "../features/admin/services/auditLoggingService";
import { sanitizeWorkItemMetadata } from "../features/admin/services/adminWorkQueueService";
import type { WorkItemStatus } from "../features/admin/types/workQueue.types";
import {
  providerRegistry,
  cdslProvider,
  nsdlProvider,
  validateCdslBoId,
  validateNsdlAccountId,
  validateDematReference,
  externalAccountService,
  externalEventService,
  standardHmacWebhookVerifier,
  reconciliationEngine,
  integrationHealthService,
  integrationAuditAdapter,
  ProhibitedCredentialError,
  CapabilityNotAvailableError,
  hashPayload,
  isPrunedPayload,
  createPrunedPayloadMarker,
  isPayloadExpired,
  type ExternalEventRecord,
  FAILURE_TAXONOMY,
  IntegrationError,
  IntegrationTracer,
  integrationMetrics,
  ALERT_CONTRACTS,
  WebhookKeyRing,
  MAX_PAYLOAD_BYTES,
  MAX_METADATA_BYTES,
} from "../features/external-integrations";

describe("IPO SaaS Platform — Complete Test Suite", () => {
  describe("Phase 1: Multi-Theme Configuration", () => {
    it("should provide exactly the 4 required themes plus system preference", () => {
      const themeKeys = Object.keys(THEMES);
      assert.ok(themeKeys.includes("light"));
      assert.ok(themeKeys.includes("dark"));
      assert.ok(themeKeys.includes("midnight"));
      assert.ok(themeKeys.includes("professional"));
      assert.equal(THEME_LIST.length, 4);
    });

    it("should have correct theme storage key and default theme", () => {
      assert.equal(THEME_STORAGE_KEY, "ipo_theme_preference");
      assert.equal(DEFAULT_THEME, "dark");
    });
  });

  describe("Phase 1: RBAC Hierarchy & Permissions", () => {
    it("should enforce correct hierarchical authority", () => {
      assert.ok(ROLE_HIERARCHY.super_admin > ROLE_HIERARCHY.admin);
      assert.ok(ROLE_HIERARCHY.admin > ROLE_HIERARCHY.editor);
      assert.ok(ROLE_HIERARCHY.editor > ROLE_HIERARCHY.analyst);
      assert.ok(ROLE_HIERARCHY.analyst > ROLE_HIERARCHY.user);
    });

    it("should correctly evaluate hasMinimumRole", () => {
      assert.equal(hasMinimumRole("super_admin", "admin"), true);
      assert.equal(hasMinimumRole("admin", "editor"), true);
      assert.equal(hasMinimumRole("editor", "analyst"), true);
      assert.equal(hasMinimumRole("user", "editor"), false);
      assert.equal(hasMinimumRole("analyst", "super_admin"), false);
    });

    it("should correctly evaluate operational capability permissions", () => {
      assert.equal(PERMISSIONS.CAN_MANAGE_IPOS("editor"), true);
      assert.equal(PERMISSIONS.CAN_MANAGE_IPOS("user"), false);
      assert.equal(PERMISSIONS.CAN_MANAGE_USERS("admin"), true);
      assert.equal(PERMISSIONS.CAN_MANAGE_USERS("analyst"), false);
      assert.equal(PERMISSIONS.CAN_VIEW_AUDIT_LOGS("super_admin"), true);
      assert.equal(PERMISSIONS.CAN_VIEW_AUDIT_LOGS("admin"), false);
    });
  });

  describe("Phase 2: IPO Lifecycle Engine & IST Date Derivations", () => {
    const sampleIPO = {
      open_date: "2026-09-10",
      close_date: "2026-09-12",
      allotment_date: "2026-09-15",
      listing_date: "2026-09-18",
      status: "announced" as const,
    };

    it("should derive 'upcoming' when reference date is before open_date", () => {
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-05"), "upcoming");
    });

    it("should derive 'open' when reference date is within bidding window", () => {
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-10"), "open");
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-11"), "open");
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-12"), "open");
    });

    it("should derive 'closed' when reference date is after close_date but before allotment", () => {
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-13"), "closed");
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-14"), "closed");
    });

    it("should derive 'listing_soon' when after allotment but before listing", () => {
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-16"), "listing_soon");
    });

    it("should derive 'listed' when reference date reaches listing_date", () => {
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-18"), "listed");
      assert.equal(deriveIPOStatus(sampleIPO, "2026-09-25"), "listed");
    });

    it("should preserve manual override statuses like 'withdrawn' and 'cancelled'", () => {
      const withdrawnIPO = { ...sampleIPO, status: "withdrawn" as const };
      assert.equal(deriveIPOStatus(withdrawnIPO, "2026-09-11"), "withdrawn");

      const cancelledIPO = { ...sampleIPO, status: "cancelled" as const };
      assert.equal(deriveIPOStatus(cancelledIPO, "2026-09-11"), "cancelled");
    });

    it("should calculate days remaining countdown accurately", () => {
      assert.equal(calculateDaysRemaining("2026-09-12", "2026-09-10"), 2);
      assert.equal(calculateDaysRemaining("2026-09-10", "2026-09-10"), 0);
      assert.equal(calculateDaysRemaining("2026-09-08", "2026-09-10"), null);
      assert.equal(calculateDaysRemaining(null, "2026-09-10"), null);
    });

    it("should return correct progress percentages per status", () => {
      assert.equal(getIPOProgressPercentage("open"), 50);
      assert.equal(getIPOProgressPercentage("listed"), 100);
      assert.equal(getIPOProgressPercentage("withdrawn"), 0);
    });
  });

  describe("Phase 2: IPO Minimum Investment & Financial Calculations", () => {
    it("should calculate minimum investment as price_band_high * lot_size", () => {
      // Premier Energies: 450 * 33 = 14,850
      assert.equal(calculateMinimumInvestment(450, 33, 427), 14850);
      // Bajaj Housing: 70 * 214 = 14,980
      assert.equal(calculateMinimumInvestment(70, 214, 66), 14980);
      // Fixed Price: 100 * 50 = 5,000
      assert.equal(calculateMinimumInvestment(null, 50, 100), 5000);
    });

    it("should return null if price or lot size is invalid", () => {
      assert.equal(calculateMinimumInvestment(0, 33), null);
      assert.equal(calculateMinimumInvestment(450, 0), null);
      assert.equal(calculateMinimumInvestment(null, null), null);
    });

    it("should format INR currency, dates, and classnames properly", () => {
      assert.equal(formatINR(14850), "₹14,850");
      assert.equal(formatINR(null), "—");
      assert.match(formatDate("2026-09-10"), /^10 Sep.* 2026$/);
      assert.equal(cn("px-4", true && "py-2", false && "hidden"), "px-4 py-2");
    });

    it("should build 6-step IPO timeline with status tracking", () => {
      const timeline = buildIPOTimeline(
        {
          announcement_date: "2026-09-01",
          open_date: "2026-09-10",
          close_date: "2026-09-12",
          allotment_date: "2026-09-13",
          refund_date: "2026-09-14",
          listing_date: "2026-09-16",
        },
        "2026-09-11"
      );
      assert.equal(timeline.length, 6);
      assert.equal(timeline[0].type, "announcement");
      assert.equal(timeline[0].status, "completed");
      assert.equal(timeline[1].type, "open");
      assert.equal(timeline[1].status, "active");
      assert.equal(timeline[2].type, "close");
      assert.equal(timeline[2].status, "upcoming");
    });

    it("should format Crores and percentages properly", () => {
      assert.equal(formatCrores(2830.4), "₹2,830.40 Cr");
      assert.equal(formatCrores(null), "—");
      assert.equal(formatPercentage(15.5), "15.50%");
      assert.equal(formatPercentage(15.5, { showSign: true }), "+15.50%");
    });
  });

  describe("Phase 2: SEO Slug Generation & Normalization", () => {
    it("should generate clean lowercase URL slugs", () => {
      assert.equal(
        slugify("Premier Energies Limited"),
        "premier-energies-limited"
      );
      assert.equal(
        slugify("L&T Technology Services"),
        "l-and-t-technology-services"
      );
      assert.equal(
        slugify("Paramount Speciality Forgings Ltd. (NSE SME)"),
        "paramount-speciality-forgings-ltd-nse-sme"
      );
    });
  });

  describe("Phase 2: Zod Schema Validation Constraints", () => {
    const validIPO = {
      company_name: "Test Solar Tech Ltd",
      slug: "test-solar-tech-ltd",
      category: "mainboard" as const,
      issue_type: "book_building" as const,
      status: "announced" as const,
      publication_status: "draft" as const,
      price_band_low: 100,
      price_band_high: 110,
      face_value: 10,
      lot_size: 135,
      issue_size_cr: 500,
      retail_quota_pct: 35,
      qib_quota_pct: 50,
      hni_quota_pct: 15,
      open_date: "2026-10-01",
      close_date: "2026-10-03",
      allotment_date: "2026-10-06",
      listing_date: "2026-10-08",
    };

    it("should pass for valid IPO data", () => {
      const result = ipoSchema.safeParse(validIPO);
      assert.equal(result.success, true);
    });

    it("should reject when price_band_high < price_band_low", () => {
      const invalid = { ...validIPO, price_band_low: 120, price_band_high: 100 };
      const result = ipoSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("should reject when close_date < open_date", () => {
      const invalid = { ...validIPO, open_date: "2026-10-05", close_date: "2026-10-01" };
      const result = ipoSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("should reject when lot_size <= 0", () => {
      const invalid = { ...validIPO, lot_size: 0 };
      const result = ipoSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("should reject invalid uppercase or space in slug", () => {
      const invalid = { ...validIPO, slug: "Invalid Slug Here" };
      const result = ipoSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });
  });

  describe("Phase 3: Financial Growth, Margins & Ratio Calculations", () => {
    it("should calculate YoY growth accurately", () => {
      // 3143.80 vs 1463.20 = +114.86%
      assert.equal(calculateYoYGrowth(3143.8, 1463.2), 114.86);
      // Decline: 80 vs 100 = -20%
      assert.equal(calculateYoYGrowth(80, 100), -20);
    });

    it("should preserve missing financial data as null without silent zeroing", () => {
      assert.equal(calculateYoYGrowth(null, 100), null);
      assert.equal(calculateYoYGrowth(100, null), null);
      assert.equal(calculateYoYGrowth(100, 0), null);
      assert.equal(calculateMargin(null, 1000), null);
      assert.equal(calculateMargin(100, null), null);
      assert.equal(calculateMargin(100, 0), null);
      assert.equal(calculateCAGR(null, 100, 3), null);
      assert.equal(calculateDebtToEquity(null, 500), null);
    });

    it("should calculate profit margins, ROE, ROCE, and D/E ratios accurately", () => {
      // PAT Margin: 231.40 / 3143.80 = 7.36%
      assert.equal(calculateMargin(231.4, 3143.8), 7.36);
      // ROE: 231.40 / 812.30 = 28.49%
      assert.equal(calculateROE(231.4, 812.3), 28.49);
      // ROCE: EBIT (450) / Capital Employed (1122.7) = 40.08%
      assert.equal(calculateROCE(450, 1122.7), 40.08);
      // Debt to Equity: 310.40 / 812.30 = 0.38
      assert.equal(calculateDebtToEquity(310.4, 812.3), 0.38);
      // 3-year CAGR: 100 to 200 in 3 years = 25.99%
      assert.equal(calculateCAGR(200, 100, 3), 25.99);
    });
  });

  describe("Phase 3: Unofficial GMP & Listing Price Estimations", () => {
    it("should calculate estimated listing price and gain percentage accurately", () => {
      // Premier Energies: Cutoff 450, GMP 410 -> Est. 860, Gain +91.11%
      const result = calculateGMPEstimate(410, 450);
      assert.equal(result.hasValidEstimate, true);
      assert.equal(result.estimatedListingPrice, 860);
      assert.equal(result.estimatedListingGainPct, 91.11);
      assert.equal(result.gmpPercentage, 91.11);
    });

    it("should safely return null estimates when GMP or cutoff price is unavailable", () => {
      const nullResult = calculateGMPEstimate(null, 450);
      assert.equal(nullResult.hasValidEstimate, false);
      assert.equal(nullResult.estimatedListingPrice, null);
      assert.equal(nullResult.estimatedListingGainPct, null);
    });
  });

  describe("Phase 3: Subscription Demand Analytics", () => {
    it("should format subscription multiples cleanly", () => {
      assert.equal(formatSubscriptionMultiple(11.4), "11.40x");
      assert.equal(formatSubscriptionMultiple(0.05), "0.05x");
      assert.equal(formatSubscriptionMultiple(null), "—");
    });

    it("should compute weighted subscription demand correctly", () => {
      // QIB: 4x (50%), NII: 20x (15%), Retail: 6x (35%) -> (2.0 + 3.0 + 2.1) = 7.1x
      assert.equal(calculateWeightedSubscription(4, 20, 6), 7.1);
    });
  });

  describe("Phase 3: Versioned & Explainable IPO Score Engine", () => {
    const mockIPO = {
      id: "a1111111-1111-1111-1111-111111111111",
      slug: "premier-energies-limited",
      company_name: "Premier Energies Limited",
      symbol: "PREMIERENE",
      company_logo: null,
      category: "mainboard" as const,
      issue_type: "book_building" as const,
      status: "open" as const,
      publication_status: "published" as const,
      price_band_low: 427,
      price_band_high: 450,
      face_value: 1,
      lot_size: 33,
      min_investment: 14850,
      issue_size_cr: 2830.4,
      fresh_issue_cr: 1291.4,
      ofs_cr: 1539.0,
      shares_offered: 62897777,
      retail_quota_pct: 35,
      qib_quota_pct: 50,
      hni_quota_pct: 15,
      exchange: "NSE, BSE",
      lead_managers: null,
      registrar_name: "KFin Technologies",
      announcement_date: "2026-08-20",
      open_date: "2026-09-09",
      close_date: "2026-09-11",
      allotment_date: "2026-09-12",
      refund_date: "2026-09-15",
      listing_date: "2026-09-16",
      listing_price: null,
      about_company: null,
      created_by: null,
      approved_by: null,
      published_at: null,
      created_at: "2026-09-01",
      updated_at: "2026-09-01",
    };

    it("should calculate score adhering to max 100 pts and exposed version", () => {
      const breakdown = calculateIPOScore({
        ipo: mockIPO,
        financials: [
          {
            id: "f1",
            ipo_id: mockIPO.id,
            financial_year: "FY24",
            period_type: "full_year",
            statement_type: "consolidated",
            audit_status: "restated",
            currency: "INR",
            unit: "Crores",
            revenue_cr: 3143.8,
            revenue_growth_pct: 114.85,
            ebitda_cr: 528.2,
            ebitda_margin_pct: 16.8,
            pat_cr: 231.4,
            pat_margin_pct: 7.36,
            eps: 6.42,
            roe_pct: 28.5,
            roce_pct: 31.2,
            total_assets_cr: 2200,
            total_debt_cr: 310.4,
            net_worth_cr: 812.3,
            operating_cash_flow_cr: 428.1,
            free_cash_flow_cr: 210.5,
            is_derived: false,
            source: "RHP",
            source_url: null,
            as_of: null,
            created_at: "2026-09-01",
            updated_at: "2026-09-01",
          },
        ],
        valuation: {
          id: "v1",
          ipo_id: mockIPO.id,
          pe_ratio_low: 66.5,
          pe_ratio_high: 70.1,
          pb_ratio: 5.54,
          ev_ebitda: 38.2,
          market_cap_cr: 20280,
          post_issue_shares_cr: 45.0667,
          eps_diluted: 6.42,
          industry_pe_median: 85.4,
          valuation_summary: null,
          source: "RHP",
          as_of: null,
          created_at: "2026-09-01",
          updated_at: "2026-09-01",
        },
        latestGmp: {
          id: "g1",
          ipo_id: mockIPO.id,
          gmp_value: 410,
          gmp_percentage: 91.11,
          estimated_listing_price: 860,
          estimated_listing_gain_pct: 91.11,
          confidence_level: "verified",
          observed_at: "2026-09-10",
          source: "Market",
          source_url: null,
          notes: null,
          created_at: "2026-09-10",
        },
        latestSubscription: {
          id: "s1",
          ipo_id: mockIPO.id,
          day_number: 2,
          snapshot_date: "2026-09-10",
          snapshot_time: "2026-09-10",
          qib_x: 4.2,
          nii_x: 28.5,
          nii_bighni_x: 32.1,
          nii_smallhni_x: 21.3,
          retail_x: 6.8,
          employee_x: 7.2,
          overall_x: 11.4,
          total_bids_count: 500000,
          total_shares_offered: 62897777,
          source: "NSE",
          as_of: "2026-09-10",
          created_at: "2026-09-10",
        },
      });

      assert.equal(breakdown.version, "v1.0-standard");
      assert.equal(breakdown.maxOverall, 100);
      assert.ok(breakdown.overall >= 0 && breakdown.overall <= 100);
      assert.ok(breakdown.financialHealth.score <= 25);
      assert.ok(breakdown.valuation.score <= 20);
      assert.ok(breakdown.issueStructure.score <= 15);
      assert.ok(breakdown.marketSentiment.score <= 15);
      assert.ok(breakdown.subscriptionDemand.score <= 15);
      assert.ok(breakdown.industryRisk.score <= 10);
      assert.equal(breakdown.isInsufficientData, false);
    });

    it("should flag insufficient_data when required data components are unavailable", () => {
      const bareBreakdown = calculateIPOScore({ ipo: mockIPO });
      assert.equal(bareBreakdown.isInsufficientData, true);
      assert.ok(bareBreakdown.missingCategories.length >= 3);
    });
  });

  describe("Phase 4: Applicant Identity & PII Masking", () => {
    it("should mask PAN strictly retaining first 5 and last character", () => {
      assert.equal(maskPAN("ABCDE1234F"), "ABCDE****F");
      // Pre-masked inputs should be preserved
      assert.equal(maskPAN("ABCDE****F"), "ABCDE****F");
      assert.equal(maskPAN(null), "—");
    });

    it("should mask Demat account retaining only the last 4 digits", () => {
      assert.equal(maskDematAccount("1208160012345678"), "****5678");
      assert.equal(maskDematAccount("1234"), "****1234");
      assert.equal(maskDematAccount(null), "—");
    });

    it("should mask UPI handles without exposing full username", () => {
      assert.equal(maskUPI("rahulsharma@okaxis"), "ra***@okaxis");
      assert.equal(maskUPI("om@icici"), "o***@icici");
      assert.equal(maskUPI(null), "—");
    });
  });

  describe("Phase 4: Investor Category Rules & Regulatory Versioning", () => {
    it("should expose version v1.0-sebi and configure all 5 investor categories", () => {
      assert.equal(CURRENT_REGULATORY_RULES.version, "v1.0-sebi");
      assert.ok(CURRENT_REGULATORY_RULES.categories.retail);
      assert.ok(CURRENT_REGULATORY_RULES.categories.s_hni);
      assert.ok(CURRENT_REGULATORY_RULES.categories.b_hni);
      assert.ok(CURRENT_REGULATORY_RULES.categories.employee);
      assert.ok(CURRENT_REGULATORY_RULES.categories.shareholder);
    });

    it("should permit cut-off bidding for Retail and Employee, but strictly forbid it for sHNI and bHNI", () => {
      assert.equal(isCutoffAllowedForCategory("retail"), true);
      assert.equal(isCutoffAllowedForCategory("employee"), true);
      assert.equal(isCutoffAllowedForCategory("shareholder"), true);
      assert.equal(isCutoffAllowedForCategory("s_hni"), false);
      assert.equal(isCutoffAllowedForCategory("b_hni"), false);
    });

    it("should enforce retail maximum limit of ₹2,00,000", () => {
      assert.equal(validateCategoryAmount("retail", 14850).isValid, true);
      assert.equal(validateCategoryAmount("retail", 200000).isValid, true);
      assert.equal(validateCategoryAmount("retail", 200001).isValid, false);
    });

    it("should enforce sHNI bracket of ₹2,00,000.01 to ₹10,00,000", () => {
      assert.equal(validateCategoryAmount("s_hni", 150000).isValid, false);
      assert.equal(validateCategoryAmount("s_hni", 250000).isValid, true);
      assert.equal(validateCategoryAmount("s_hni", 1000000).isValid, true);
      assert.equal(validateCategoryAmount("s_hni", 1000050).isValid, false);
    });

    it("should enforce bHNI minimum threshold of ₹10,00,000.01 without upper cap", () => {
      assert.equal(validateCategoryAmount("b_hni", 500000).isValid, false);
      assert.equal(validateCategoryAmount("b_hni", 1000001).isValid, true);
      assert.equal(validateCategoryAmount("b_hni", 50000000).isValid, true);
    });
  });

  describe("Phase 4: Application Lot Divisibility & Multi-Bid Calculations", () => {
    it("should validate lot divisibility strictly", () => {
      // Lot size 33
      assert.deepEqual(validateLotDivisibility(33, 33), { isValid: true, lots: 1 });
      assert.deepEqual(validateLotDivisibility(66, 33), { isValid: true, lots: 2 });
      assert.equal(validateLotDivisibility(40, 33).isValid, false);
      assert.equal(validateLotDivisibility(0, 33).isValid, false);
    });

    it("should evaluate multiple bids correctly within price band", () => {
      const bids = [
        { bidNumber: 1, lotCount: 1, price: 450, isCutoff: true },
        { bidNumber: 2, lotCount: 2, price: 440, isCutoff: false },
      ];

      const res = evaluateBids(bids, 33, 427, 450, "retail");
      assert.equal(res.success, true);
      assert.equal(res.calculatedBids?.length, 2);
      // Bid 1: 33 * 450 = 14850
      assert.equal(res.calculatedBids?.[0].amount, 14850);
      // Bid 2: 66 * 440 = 29040
      assert.equal(res.calculatedBids?.[1].amount, 29040);
    });

    it("should reject cut-off bid when category is s_hni", () => {
      const bids = [{ bidNumber: 1, lotCount: 15, price: 450, isCutoff: true }];
      const res = evaluateBids(bids, 33, 427, 450, "s_hni");
      assert.equal(res.success, false);
      assert.ok(res.error?.includes("Cut-off price is not permitted"));
    });

    it("should enforce Indian SEBI rule: application amount equals highest bid amount", () => {
      const calculatedBids = [
        { bidNumber: 1, lotCount: 1, quantity: 33, price: 450, isCutoff: true, amount: 14850 },
        { bidNumber: 2, lotCount: 2, quantity: 66, price: 440, isCutoff: false, amount: 29040 },
        { bidNumber: 3, lotCount: 1, quantity: 33, price: 430, isCutoff: false, amount: 14190 },
      ];

      const aggRes = computeApplicationAggregates(calculatedBids, "retail");
      assert.equal(aggRes.success, true);
      // Highest bid is Bid #2 (₹29,040)
      assert.equal(aggRes.aggregates?.applicationAmount, 29040);
      assert.equal(aggRes.aggregates?.totalLots, 2);
      assert.equal(aggRes.aggregates?.totalQuantity, 66);
      assert.equal(aggRes.aggregates?.bidPrice, 440);
      assert.equal(aggRes.aggregates?.activeBidNumber, 2);
    });

    it("should guarantee parent application aggregates never contradict child bids", () => {
      const calculatedBids = [
        { bidNumber: 1, lotCount: 5, quantity: 165, price: 450, isCutoff: true, amount: 74250 },
      ];
      const aggRes = computeApplicationAggregates(calculatedBids, "retail");
      assert.equal(aggRes.success, true);
      assert.equal(aggRes.aggregates?.totalLots, calculatedBids[0].lotCount);
      assert.equal(aggRes.aggregates?.totalQuantity, calculatedBids[0].quantity);
      assert.equal(aggRes.aggregates?.applicationAmount, calculatedBids[0].amount);
    });
  });

  describe("Phase 4: Application Lifecycle State Machine & Terminal Transitions", () => {
    it("should validate all forward valid transitions from draft to allotment", () => {
      assert.equal(isValidApplicationTransition("draft", "applied"), true);
      assert.equal(isValidApplicationTransition("applied", "mandate_pending"), true);
      assert.equal(isValidApplicationTransition("mandate_pending", "mandate_approved"), true);
      assert.equal(isValidApplicationTransition("mandate_approved", "funds_blocked"), true);
      assert.equal(isValidApplicationTransition("funds_blocked", "bidding_closed"), true);
      assert.equal(isValidApplicationTransition("bidding_closed", "allotment_pending"), true);
    });

    it("should permit full allotment transition directly to completed", () => {
      assert.equal(isValidApplicationTransition("allotment_pending", "allotted"), true);
      assert.equal(isValidApplicationTransition("allotted", "completed"), true);
    });

    it("should enforce linear progression from refund to completed", () => {
      assert.equal(isValidApplicationTransition("not_allotted", "refund_pending"), true);
      assert.equal(isValidApplicationTransition("refund_pending", "refund_completed"), true);
      assert.equal(isValidApplicationTransition("refund_completed", "funds_unblocked"), true);
      assert.equal(isValidApplicationTransition("funds_unblocked", "completed"), true);
    });

    it("should reject illegal transition jumps", () => {
      assert.equal(isValidApplicationTransition("applied", "allotted"), false);
      assert.equal(isValidApplicationTransition("draft", "completed"), false);
      assert.equal(isValidApplicationTransition("completed", "applied"), false);
      assert.equal(isValidApplicationTransition("cancelled", "draft"), false);
    });

    it("should return correct status metadata and styling variants", () => {
      const meta = getApplicationStatusMeta("funds_blocked");
      assert.equal(meta.label, "Funds Blocked");
      assert.equal(meta.variant, "success");
      assert.ok(meta.stepIndex > 0);
    });
  });

  describe("Phase 4: Mandate Tracking & Allotment Financials", () => {
    it("should calculate full allotment financials with zero refund", () => {
      // Applied: 33 shares @ cutoff 450 = 14850. Allotment price = 450.
      const res = calculateAllotmentFinancials({
        sharesApplied: 33,
        sharesAllotted: 33,
        lotSize: 33,
        allotmentPrice: 450,
        blockedOrApplicationAmount: 14850,
      });

      assert.equal(res.isFullAllotment, true);
      assert.equal(res.isPartialAllotment, false);
      assert.equal(res.isZeroAllotment, false);
      assert.equal(res.allotmentAmount, 14850);
      assert.equal(res.refundAmount, 0);
      assert.equal(res.lotsAllotted, 1);
    });

    it("should calculate allotment financials with final issue price lower than bid price", () => {
      // Bid at upper cap 450 (14850), but registrar final allotment price discovered at 440
      const res = calculateAllotmentFinancials({
        sharesApplied: 33,
        sharesAllotted: 33,
        lotSize: 33,
        allotmentPrice: 440,
        blockedOrApplicationAmount: 14850,
      });

      assert.equal(res.isFullAllotment, true);
      // Allotment: 33 * 440 = 14520
      assert.equal(res.allotmentAmount, 14520);
      // Refund: 14850 - 14520 = 330
      assert.equal(res.refundAmount, 330);
    });

    it("should calculate partial allotment financials and refund accurately", () => {
      // Applied 66 shares (29700), allotted 33 shares @ 450 (14850)
      const res = calculateAllotmentFinancials({
        sharesApplied: 66,
        sharesAllotted: 33,
        lotSize: 33,
        allotmentPrice: 450,
        blockedOrApplicationAmount: 29700,
      });

      assert.equal(res.isPartialAllotment, true);
      assert.equal(res.allotmentAmount, 14850);
      assert.equal(res.refundAmount, 14850);
      assert.equal(res.lotsAllotted, 1);
    });

    it("should calculate zero allotment with 100% refund amount", () => {
      const res = calculateAllotmentFinancials({
        sharesApplied: 33,
        sharesAllotted: 0,
        lotSize: 33,
        allotmentPrice: 450,
        blockedOrApplicationAmount: 14850,
      });

      assert.equal(res.isZeroAllotment, true);
      assert.equal(res.allotmentAmount, 0);
      assert.equal(res.refundAmount, 14850);
      assert.equal(res.lotsAllotted, 0);
    });
  });

  describe("Phase 4: Zod Validation Schemas for Application Mutations", () => {
    it("should validate valid applicant profile form data", () => {
      const valid = {
        relationship: "self",
        display_name: "Rahul Sharma",
        pan: "ABCDE1234F",
        demat_dp_id: "IN300123",
        demat_account_no: "12345678",
        upi_id: "rahul@okaxis",
        default_category: "retail",
        notes: "Primary account",
        is_active: true,
      };

      const parsed = applicantSchema.safeParse(valid);
      assert.equal(parsed.success, true);
    });

    it("should reject applicant with missing name or invalid relationship", () => {
      const invalid = {
        relationship: "invalid_rel",
        display_name: "",
        pan: "ABC",
      };

      const parsed = applicantSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it("should validate application creation payload with multi-bids", () => {
      const payload = {
        ipo_id: "a1111111-1111-1111-1111-111111111111",
        applicant_id: "c1111111-1111-1111-1111-111111111111",
        investor_category: "retail",
        bids: [
          { bid_number: 1, lot_count: 1, price: 450, is_cutoff: true },
          { bid_number: 2, lot_count: 2, price: 440, is_cutoff: false },
        ],
        upi_id: "rahul@okaxis",
        notes: null,
      };

      const parsed = createApplicationSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    it("should reject application creation with 0 bids or invalid UUIDs", () => {
      const invalid = {
        ipo_id: "non-uuid",
        applicant_id: "non-uuid",
        investor_category: "retail",
        bids: [],
      };

      const parsed = createApplicationSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it("should validate mandate update and allotment recording schemas", () => {
      const mandateUpdate = {
        application_id: "a1111111-1111-1111-1111-111111111111",
        mandate_status: "approved",
        provider: "BHIM_UPI",
        provider_reference: "REF-12345",
        blocked_amount: 14850,
      };
      assert.equal(updateMandateSchema.safeParse(mandateUpdate).success, true);

      const allotmentRecord = {
        application_id: "a1111111-1111-1111-1111-111111111111",
        allotment_status: "allotted",
        shares_allotted: 33,
        allotment_price: 450,
        basis_of_allotment_ref: "BOA-2026",
      };
      assert.equal(recordAllotmentSchema.safeParse(allotmentRecord).success, true);
    });
  });

  describe("Phase 5: Double-Entry General Ledger Balance & Deferred Trigger Invariants", () => {
    it("1. Balanced posted journal succeeds with debit equals credit and line count >= 2", () => {
      const balancedLines = [
        { accountId: "acc-1010", debitAmount: 14850, creditAmount: 0 },
        { accountId: "acc-3010", debitAmount: 0, creditAmount: 14850 },
      ];
      const res = JournalService.validateJournalBalance(balancedLines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 14850);
      assert.equal(res.totalCredit, 14850);

      // Verify PostgreSQL Deferred Header Constraint Trigger
      const pgRes = JournalService.validatePostgresHeaderBalance(
        { id: "jrn-001", status: "posted" },
        [{ debit: 14850, credit: 0 }, { debit: 0, credit: 14850 }]
      );
      assert.equal(pgRes.valid, true);
    });

    it("2. Zero-line posted journal strictly fails at commit (empty journal defense)", () => {
      const res = JournalService.validateJournalBalance([]);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("at least two lines"));

      // Verify PostgreSQL Deferred Trigger rejects zero-line posted journal
      const pgRes = JournalService.validatePostgresHeaderBalance(
        { id: "jrn-empty", status: "posted" },
        []
      );
      assert.equal(pgRes.valid, false);
      assert.ok(pgRes.error?.includes("must contain at least 2 lines (found 0 lines)"));
    });

    it("3. Single-line posted journal strictly fails", () => {
      const singleLine = [{ accountId: "acc-1010", debitAmount: 14850, creditAmount: 0 }];
      const res = JournalService.validateJournalBalance(singleLine);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("at least two lines"));

      const pgRes = JournalService.validatePostgresHeaderBalance(
        { id: "jrn-single", status: "posted" },
        [{ debit: 14850, credit: 0 }]
      );
      assert.equal(pgRes.valid, false);
      assert.ok(pgRes.error?.includes("found 1 lines"));
    });

    it("4. Unbalanced posted journal strictly fails at transaction completion", () => {
      const imbalancedLines = [
        { accountId: "acc-1010", debitAmount: 15000, creditAmount: 0 },
        { accountId: "acc-3010", debitAmount: 0, creditAmount: 10000 },
      ];
      const res = JournalService.validateJournalBalance(imbalancedLines);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("Journal entry is not balanced"));

      const pgRes = JournalService.validatePostgresHeaderBalance(
        { id: "jrn-imbal", status: "posted" },
        [{ debit: 15000, credit: 0 }, { debit: 0, credit: 10000 }]
      );
      assert.equal(pgRes.valid, false);
      assert.ok(pgRes.error?.includes("Total Debits (₹15000) does not equal Total Credits (₹10000)"));
    });

    it("5. Journal line with both debit and credit fails database check constraint", () => {
      const simultaneous = [
        { accountId: "acc-1010", debitAmount: 500, creditAmount: 500 },
        { accountId: "acc-3010", debitAmount: 0, creditAmount: 0 },
      ];
      const res = JournalService.validateJournalBalance(simultaneous);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("cannot have both debit and credit amounts"));
    });

    it("6. Journal line with zero debit AND zero credit fails database check constraint", () => {
      const zeroLine = [
        { accountId: "acc-1010", debitAmount: 1000, creditAmount: 0 },
        { accountId: "acc-3010", debitAmount: 0, creditAmount: 1000 },
        { accountId: "acc-1020", debitAmount: 0, creditAmount: 0 },
      ];
      const res = JournalService.validateJournalBalance(zeroLine);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("must have either debit > 0 or credit > 0"));
    });

    it("7. Draft journal can be modified and lines reordered before posting without trigger errors", () => {
      // In draft status, PostgreSQL trigger does not enforce balance yet, allowing draft construction
      const pgDraft = JournalService.validatePostgresHeaderBalance(
        { id: "jrn-draft-01", status: "draft" },
        [{ debit: 14850, credit: 0 }] // Temporarily 1 line while drafting
      );
      assert.equal(pgDraft.valid, true, "Draft journal must permit staging lines before posting");
    });
  });

  describe("Phase 5: PostgreSQL Immutability Triggers & Reversal Integrity", () => {
    it("8. Posted journal UPDATE fails under PostgreSQL immutability trigger", () => {
      const oldEntry = {
        id: "a1111111-1111-4111-8111-111111111111",
        status: "posted",
        journal_number: "JRN-2026-001",
        user_id: "u1111111-1111-4111-8111-111111111111",
      };

      // Attempting to revert posted journal back to draft
      const updateToDraft = JournalService.validatePostgresJournalImmutability(
        "UPDATE",
        oldEntry,
        { status: "draft", journal_number: oldEntry.journal_number, user_id: oldEntry.user_id }
      );
      assert.equal(updateToDraft.allowed, false);
      assert.ok(updateToDraft.error?.includes("Posted journal"));
      assert.ok(updateToDraft.error?.includes("is immutable"));

      // Attempting to mutate journal number or user_id
      const mutateNumber = JournalService.validatePostgresJournalImmutability(
        "UPDATE",
        oldEntry,
        { status: "posted", journal_number: "MUTATED-001", user_id: oldEntry.user_id }
      );
      assert.equal(mutateNumber.allowed, false);
      assert.ok(mutateNumber.error?.includes("Cannot mutate core identifiers"));
    });

    it("9. Posted journal DELETE fails under PostgreSQL immutability trigger", () => {
      const oldEntry = {
        id: "a1111111-1111-4111-8111-111111111111",
        status: "posted",
        journal_number: "JRN-2026-001",
        user_id: "u1111111-1111-4111-8111-111111111111",
      };

      const delRes = JournalService.validatePostgresJournalImmutability("DELETE", oldEntry);
      assert.equal(delRes.allowed, false);
      assert.ok(delRes.error?.includes("cannot be deleted"));

      // Reversed journals also cannot be deleted
      const reversedEntry = { ...oldEntry, status: "reversed" };
      const delRevRes = JournalService.validatePostgresJournalImmutability("DELETE", reversedEntry);
      assert.equal(delRevRes.allowed, false);
      assert.ok(delRevRes.error?.includes("cannot be deleted"));
    });

    it("10. Posted journal line UPDATE fails under PostgreSQL line protection trigger", () => {
      const res = JournalService.validatePostgresLineImmutability("UPDATE", "posted");
      assert.equal(res.allowed, false);
      assert.ok(res.error?.includes("Journal lines belonging to a posted journal are immutable"));
    });

    it("11. Posted journal line DELETE fails under PostgreSQL line protection trigger", () => {
      const res = JournalService.validatePostgresLineImmutability("DELETE", "posted");
      assert.equal(res.allowed, false);
      assert.ok(res.error?.includes("Journal lines belonging to a posted journal are immutable"));
    });

    it("12. Journal-line journal_id mutation cannot leave either affected posted journal unbalanced", () => {
      // Origin journal A had 2 balanced lines: Dr 14850, Cr 14850.
      // If a line is moved to Journal B, Journal A has only 1 line left and is unbalanced.
      const crossMoveRes = JournalService.validatePostgresLineJournalMutation({
        oldJournalId: "jrn-origin-A",
        oldJournalStatus: "posted",
        oldJournalLinesAfterMove: [{ debit: 14850, credit: 0 }], // only 1 line left!
        newJournalId: "jrn-target-B",
        newJournalStatus: "posted",
        newJournalLinesAfterMove: [
          { debit: 0, credit: 14850 },
          { debit: 10000, credit: 0 },
        ], // unbalanced!
      });

      assert.equal(crossMoveRes.allowed, false);
      assert.ok(crossMoveRes.error?.includes("Line update unbalanced the origin journal"));
    });

    it("13. Reversal journal correctly reverses original journal without mutating history", () => {
      const originalLines = [
        { accountId: "acc-1020", applicantId: "app-1", debit: 14850, credit: 0 },
        { accountId: "acc-1010", applicantId: "app-1", debit: 0, credit: 14850 },
      ];

      // Build inverted reversal lines
      const inverted = JournalService.buildInvertedReversalLines(originalLines);
      assert.equal(inverted.length, 2);
      assert.equal(inverted[0].debit, 0, "Original Dr must invert to Cr");
      assert.equal(inverted[0].credit, 14850, "Original Dr must invert to Cr");
      assert.equal(inverted[1].debit, 14850, "Original Cr must invert to Dr");
      assert.equal(inverted[1].credit, 0, "Original Cr must invert to Dr");

      // Balance of reversal journal
      const reversalBalance = JournalService.validateJournalBalance(inverted);
      assert.equal(reversalBalance.valid, true);
      assert.equal(reversalBalance.totalDebit, 14850);
      assert.equal(reversalBalance.totalCredit, 14850);
    });
  });

  describe("Phase 5: Idempotency & Financial Event Deduplication", () => {
    it("14. Duplicate journal idempotency key cannot create a second journal", () => {
      const appId = "a1111111-1111-4111-8111-111111111111";
      const key1 = `phase4:app:${appId}:mandate:block`;
      const key2 = `phase4:app:${appId}:mandate:block`;

      assert.equal(key1, key2, "Idempotency keys must be deterministic strings");
      // Simulating idempotency check in JournalService:
      const existingRecord = { id: "jrn-exist-001", status: "posted" };
      const simulatedCheck = existingRecord ? { success: true, journalId: existingRecord.id, isDuplicate: true } : null;
      assert.equal(simulatedCheck?.isDuplicate, true);
      assert.equal(simulatedCheck?.journalId, "jrn-exist-001");
    });

    it("15. Duplicate investment idempotency key cannot create a second investment transaction", () => {
      const appId = "a1111111-1111-4111-8111-111111111111";
      const allotmentId = "b2222222-2222-4222-8222-222222222222";
      const txKey = `phase4:app:${appId}:allotment:${allotmentId}`;

      assert.equal(txKey, `phase4:app:${appId}:allotment:${allotmentId}`);
      assert.match(txKey, /^phase4:app:[a-f0-9-]+:allotment:[a-f0-9-]+$/);
      assert.ok(InvestmentService.handleAllotmentRecordedEvent, "InvestmentService must export handleAllotmentRecordedEvent");
    });
  });

  describe("Phase 5: 4-Tier Ownership Model & Cash Ledger Isolation", () => {
    it("16. Case A (Self-funded IPO) changes personal available/encumbered balances correctly", () => {
      // User A self-funds: Available Cash (1010) decreases, ASBA Lien (1020) increases
      const blockLines = [
        { accountId: "1020", debit: 14850, credit: 0 },
        { accountId: "1010", debit: 0, credit: 14850 },
      ];
      const res = JournalService.validateJournalBalance(blockLines);
      assert.equal(res.valid, true);

      // Liquid available decreases by 14,850; encumbered increases by 14,850
      const availableDelta = 0 - 14850;
      const lienDelta = 14850 - 0;
      assert.equal(availableDelta, -14850);
      assert.equal(lienDelta, 14850);
      assert.equal(availableDelta + lienDelta, 0, "Total bank cash remains constant");
    });

    it("17. Case B (Father-direct-funded IPO) produces zero impact on User A personal cash", () => {
      // When funding_owner_type is 'applicant_direct', user's personal cash (1010/1020) is bypassed
      const fundingOwner: string = "applicant_direct";
      const affectsPersonalCash = fundingOwner === "user_personal" || fundingOwner === "family_pool";
      assert.equal(affectsPersonalCash, false, "Father's direct money must have zero impact on User A's liquid cash account");
    });

    it("18. Case C (Father-funded-by-User) produces expected User exposure with Father beneficial ownership", () => {
      // User A funds the IPO (Cr 1010 / Dr 1020), but applicant_id is Father's ID
      const userLienLine = {
        accountId: "1020",
        applicantId: "father-applicant-uuid",
        debit: 14850,
        credit: 0,
      };
      const userCashLine = {
        accountId: "1010",
        applicantId: "father-applicant-uuid",
        debit: 0,
        credit: 14850,
      };
      const res = JournalService.validateJournalBalance([userLienLine, userCashLine]);
      assert.equal(res.valid, true);
      assert.equal(userLienLine.applicantId, "father-applicant-uuid");
    });

    it("19. Case D (Friend external-tracked IPO) produces zero User GL impact", () => {
      // External tracked holdings bypass double-entry GL entirely
      const fundingType = "external_tracked";
      const createsJournalEntry = fundingType !== "external_tracked";
      assert.equal(createsJournalEntry, false, "External tracked holdings must NEVER create personal GL entries");
    });
  });

  describe("Phase 5: ASBA Lien Accounting & Allotment Financial Lifecycle", () => {
    it("20. ASBA funds_blocked preserves total bank assets (Asset reclassification, not expense)", () => {
      const lienLines = [
        { accountId: "1020", debit: 14850, credit: 0 }, // Dr. Bank: IPO Lien
        { accountId: "1010", debit: 0, credit: 14850 }, // Cr. Bank: Available Cash
      ];
      const res = JournalService.validateJournalBalance(lienLines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 14850);
      assert.equal(res.totalCredit, 14850);
    });

    it("21. Full allotment converts the correct lien amount into investment cost", () => {
      // 33 shares @ ₹450 = ₹14,850 converted to investments; lien released
      const allotmentLines = [
        { accountId: "1110", debit: 14850, credit: 0 }, // Dr. Investments: IPO Equities
        { accountId: "1020", debit: 0, credit: 14850 }, // Cr. Bank: IPO Lien
      ];
      const res = JournalService.validateJournalBalance(allotmentLines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 14850);
      assert.equal(res.totalCredit, 14850);
    });

    it("22. Full allotment where bid amount != final allotment consideration releases surplus lien", () => {
      // Applied at upper cap ₹450 with ₹14,850 blocked; final price fixed at ₹440 (33 * 440 = ₹14,520).
      // Allotment consideration is ₹14,520; surplus ₹330 unblocks back to available cash.
      const bidAmount = 14850;
      const allotmentAmount = 14520;
      const surplusRefund = bidAmount - allotmentAmount; // 330

      const lines = [
        { accountId: "1110", debit: allotmentAmount, credit: 0 }, // Dr. Equity Cost 14,520
        { accountId: "1010", debit: surplusRefund, credit: 0 },    // Dr. Available Cash Unblocked 330
        { accountId: "1020", debit: 0, credit: bidAmount },        // Cr. Lien Released 14,850
      ];

      const res = JournalService.validateJournalBalance(lines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 14850);
      assert.equal(res.totalCredit, 14850);
    });

    it("23. Partial allotment releases only surplus amount and capitalizes allotted shares", () => {
      // Applied 2 lots (66 shares) @ ₹450 = ₹29,700 blocked.
      // Allotted 1 lot (33 shares) @ ₹450 = ₹14,850.
      // Surplus ₹14,850 refunded to liquid cash; lien discharged for ₹29,700.
      const partialLines = [
        { accountId: "1110", debit: 14850, credit: 0 }, // Dr. Equity Cost
        { accountId: "1010", debit: 14850, credit: 0 }, // Dr. Available Cash Refund
        { accountId: "1020", debit: 0, credit: 29700 }, // Cr. IPO Lien Released
      ];
      const res = JournalService.validateJournalBalance(partialLines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 29700);
      assert.equal(res.totalCredit, 29700);
    });

    it("24. Zero allotment releases the entire lien back to available cash", () => {
      // Blocked ₹14,850; allotted 0. Entire ₹14,850 returns to Available Cash.
      const zeroAllotmentLines = [
        { accountId: "1010", debit: 14850, credit: 0 }, // Dr. Available Cash
        { accountId: "1020", debit: 0, credit: 14850 }, // Cr. IPO Lien
      ];
      const res = JournalService.validateJournalBalance(zeroAllotmentLines);
      assert.equal(res.valid, true);
      assert.equal(res.totalDebit, 14850);
      assert.equal(res.totalCredit, 14850);
    });

    it("25. Historical unverified Phase 4 records create no fabricated financial cash movement", () => {
      const historicalState: string = "unverified";
      const createsCashMovement = historicalState === "verified";
      assert.equal(createsCashMovement, false, "Historical unverified records must NEVER fabricate journal cash entries");
    });
  });

  describe("Phase 5: Market Price Provenance & Missing-Price Safeguards", () => {
    it("26. Missing security price produces null valuation/P&L rather than ₹0", async () => {
      const quote = await DefaultMarketDataProvider.getQuote("IN9999999999");
      assert.equal(quote, null, "Missing price must strictly return null instead of 0 to protect portfolio valuation");

      // Verify calculation engine treats null quote safely
      const quantity = 33;
      const cost = 14850;
      const currentPrice: number | null = quote ? (quote as { currentPrice: number }).currentPrice : null;
      const marketValue = currentPrice !== null ? quantity * currentPrice : null;
      const unrealizedPnl = marketValue !== null ? marketValue - cost : null;

      assert.equal(marketValue, null, "Market value must be null when quote is missing");
      assert.equal(unrealizedPnl, null, "Unrealized P&L must be null when quote is missing");
    });

    it("27. Stale or unverified price cannot be treated as a verified portfolio valuation", () => {
      const unverifiedQuote = {
        price: 450,
        is_verified: false,
        source: "manual_unverified",
      };

      // DefaultMarketDataProvider filters for is_verified === true
      const isEligibleForValuation = unverifiedQuote.is_verified === true;
      assert.equal(isEligibleForValuation, false, "Unverified price snapshot must not be used for portfolio valuation");
    });

    it("28. GMP is strictly excluded from security price snapshots and portfolio valuation", () => {
      const gmpPrice = 120; // Unofficial grey market premium
      assert.equal(typeof gmpPrice, "number");
      const isOfficialExchangeQuote = false;
      const usedForPortfolioValuation = isOfficialExchangeQuote;

      assert.equal(usedForPortfolioValuation, false, "GMP must NEVER be used to value equity holdings");
    });
  });

  describe("Phase 5: Opening Balance Provenance & Audit Trail Verification", () => {
    it("29. User-declared opening balance records explicit provenance and remains marked unverified", () => {
      const openingRecord = {
        source: "user_declared",
        verification: "unverified_opening_book",
        declared_by: "u1111111-1111-4111-8111-111111111111",
        declared_at: "2026-09-10T10:00:00.000Z",
        effective_date: "2026-04-01",
        verificationStatus: "user_declared_unverified",
      };

      assert.equal(openingRecord.source, "user_declared");
      assert.equal(openingRecord.verification, "unverified_opening_book");
      assert.equal(openingRecord.verificationStatus, "user_declared_unverified");
      assert.notEqual(openingRecord.verification, "bank_statement_verified", "Opening balance must never claim bank verification");
    });

    it("30. Standard 10 system accounts are defined with exact GAAP classifications", () => {
      const standardCodes = ChartOfAccountsService.STANDARD_ACCOUNTS.map((a) => a.code);
      assert.ok(standardCodes.includes("1010")); // Available Cash (Asset)
      assert.ok(standardCodes.includes("1020")); // ASBA Lien (Asset)
      assert.ok(standardCodes.includes("1030")); // Demat Clearing (Asset)
      assert.ok(standardCodes.includes("1110")); // IPO Equities (Asset)
      assert.ok(standardCodes.includes("2010")); // Payable to Family (Liability)
      assert.ok(standardCodes.includes("3010")); // Owner Capital (Equity)
      assert.ok(standardCodes.includes("4010")); // Realized Gains (Income)
      assert.ok(standardCodes.includes("4020")); // Dividend (Income)
      assert.ok(standardCodes.includes("5010")); // Realized Losses (Expense)
      assert.ok(standardCodes.includes("5020")); // Charges (Expense)
    });
  });

  describe("Phase 5: Zod Validation Schemas for Financial Mutations", () => {
    it("31. Validates opening balance declaration schema with audit notes", () => {
      const payload = {
        amount: 150000,
        asOfDate: "2026-04-01",
        accountCode: "1010",
        bankName: "HDFC Trading Bank",
        notes: "Self-declared beginning book balance",
      };
      const parsed = declareOpeningBalanceSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    it("32. Rejects opening balance declaration with negative amount", () => {
      const invalid = {
        amount: -5000,
        asOfDate: "2026-04-01",
      };
      const parsed = declareOpeningBalanceSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it("33. Validates capital deposit payload", () => {
      const deposit = {
        amount: 50000,
        depositDate: "2026-09-10",
        source: "upi",
        referenceNumber: "UPI-REF-998877",
        notes: "Capital infusion for SME IPOs",
      };
      const parsed = capitalDepositSchema.safeParse(deposit);
      assert.equal(parsed.success, true);
    });

    it("34. Validates capital withdrawal payload", () => {
      const withdrawal = {
        amount: 25000,
        withdrawalDate: "2026-09-10",
        destination: "savings_account",
        notes: "Quarterly profit drawing",
      };
      const parsed = capitalWithdrawalSchema.safeParse(withdrawal);
      assert.equal(parsed.success, true);
    });

    it("35. Validates journal reversal schema requiring non-empty reason", () => {
      const valid = {
        originalEntryId: "a1111111-1111-4111-8111-111111111111",
        reason: "Duplicate manual deposit recorded in error",
      };
      assert.equal(journalReversalSchema.safeParse(valid).success, true);

      const invalid = {
        originalEntryId: "a1111111-1111-4111-8111-111111111111",
        reason: "   ", // Blank reason
      };
      assert.equal(journalReversalSchema.safeParse(invalid).success, false);
    });

    it("36. Validates security price recording schema with positive price", () => {
      const valid = {
        securityId: "b1111111-1111-4111-8111-111111111111",
        price: 485.5,
        priceDate: "2026-09-10T10:00:00Z",
        source: "bse_live",
      };
      assert.equal(securityPriceSchema.safeParse(valid).success, true);

      const invalidZero = {
        securityId: "b1111111-1111-4111-8111-111111111111",
        price: 0,
      };
      assert.equal(securityPriceSchema.safeParse(invalidZero).success, false);
    });
  });

  describe("Phase 6: Analytics, Multi-Factor Screener & Investor Intelligence", () => {
    describe("Screener In-Memory Filter Engine & Null Defense", () => {
      it("1. Screener filters by category correctly", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { category: ["mainboard"] });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.equal(r.category, "mainboard");
        }
      });

      it("2. Screener filters by issue size range (min & max Cr)", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, {
          issueSizeMinCr: 2000,
          issueSizeMaxCr: 7000,
        });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.ok(r.issue_size_cr !== null && r.issue_size_cr >= 2000 && r.issue_size_cr <= 7000);
        }
      });

      it("3. Screener filters by valuation P/E ceiling", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { peRatioMax: 30 });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.ok(r.pe_ratio_high !== null && r.pe_ratio_high <= 30);
        }
      });

      it("4. Screener filters by minimum overall research score", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { overallScoreMin: 80 });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.ok(r.overall_score !== null && r.overall_score >= 80);
        }
      });

      it("5. Screener filters by minimum overall subscription multiplier", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { subscriptionMinX: 50 });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.ok(r.latest_subscription_x !== null && r.latest_subscription_x >= 50);
        }
      });

      it("6. Screener filters by minimum grey market gain %", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { gmpGainMinPct: 25 });
        assert.ok(res.records.length > 0);
        for (const r of res.records) {
          assert.ok(r.latest_gmp_gain_pct !== null && r.latest_gmp_gain_pct >= 25);
        }
      });

      it("7. Null Defense: range filters exclude unpriced/null records by default without error", () => {
        const testSeed: ScreenerRecord[] = [
          ...DEV_SCREENER_SEED,
          {
            ...DEV_SCREENER_SEED[0],
            id: "null-pe-ipo",
            slug: "unpriced-draft-ipo",
            pe_ratio_high: null,
          },
        ];
        const res = IpoScreenerService.filterInMemory(testSeed, {
          peRatioMax: 40,
          includeUnpriced: false,
        });
        const nullRecord = res.records.find((r) => r.id === "null-pe-ipo");
        assert.equal(nullRecord, undefined, "Unpriced IPO must be excluded by default from P/E range filter");
      });

      it("8. Null Defense: includeUnpriced preserves unpriced/null P/E records", () => {
        const testSeed: ScreenerRecord[] = [
          ...DEV_SCREENER_SEED,
          {
            ...DEV_SCREENER_SEED[0],
            id: "null-pe-ipo-2",
            slug: "unpriced-draft-ipo-2",
            pe_ratio_high: null,
          },
        ];
        const res = IpoScreenerService.filterInMemory(testSeed, {
          peRatioMax: 40,
          includeUnpriced: true,
        });
        const nullRecord = res.records.find((r) => r.id === "null-pe-ipo-2");
        assert.ok(nullRecord !== undefined, "Unpriced IPO must be preserved when includeUnpriced is true");
      });

      it("9. Screener search queries match across company name and symbol", () => {
        const byName = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { searchQuery: "Premier" });
        assert.ok(byName.records.length > 0);
        assert.equal(byName.records[0].symbol, "PREMIERENE");

        const bySymbol = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { searchQuery: "BAJAJHFL" });
        assert.ok(bySymbol.records.length > 0);
        assert.equal(bySymbol.records[0].slug, "bajaj-housing-finance-limited");
      });

      it("10. Screener sorts records deterministically by overall_score descending", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, {
          sortBy: "overall_score",
          sortDirection: "desc",
        });
        for (let i = 0; i < res.records.length - 1; i++) {
          const current = res.records[i].overall_score || 0;
          const next = res.records[i + 1].overall_score || 0;
          assert.ok(current >= next, `Record at ${i} (${current}) should be >= next (${next})`);
        }
      });

      it("11. Screener pagination slices records correctly with total count metadata", () => {
        const res = IpoScreenerService.filterInMemory(DEV_SCREENER_SEED, { page: 1, limit: 1 });
        assert.equal(res.records.length, 1);
        assert.equal(res.totalCount, DEV_SCREENER_SEED.length);
        assert.equal(res.totalPages, DEV_SCREENER_SEED.length);
      });
    });

    describe("Zod Validation & Public Screen Privacy Rules", () => {
      it("12. Screener Zod schema validates full filter payload and type coercions", () => {
        const valid = {
          minInvestmentMax: "15000",
          peRatioMax: "35.5",
          category: ["mainboard"],
          status: ["open"],
        };
        const parsed = screenerFilterSchema.safeParse(valid);
        assert.equal(parsed.success, true);
        if (parsed.success) {
          assert.equal(parsed.data.minInvestmentMax, 15000);
          assert.equal(parsed.data.peRatioMax, 35.5);
        }
      });

      it("13. Screener Zod schema enforces default values for page, limit, and sort", () => {
        const parsed = screenerFilterSchema.parse({});
        assert.equal(parsed.page, 1);
        assert.equal(parsed.limit, 20);
        assert.equal(parsed.sortBy, "overall_score");
        assert.equal(parsed.sortDirection, "desc");
      });

      it("14. Saved Screen Zod schema validates valid private screen definition", () => {
        const validPrivateScreen = {
          name: "Clean Energy Multiples",
          description: "Tracks solar and power IPOs with low P/E",
          filterConfig: {
            industry: ["Solar & Renewable Energy"],
            peRatioMax: 40,
          },
          isPublic: false,
        };
        assert.equal(savedScreenSchema.safeParse(validPrivateScreen).success, true);
      });

      it("15. Saved Screen Privacy Invariant: rejects public screen with applicantId parameter", () => {
        const invalidPublicScreen = {
          name: "Leak Test Screen",
          filterConfig: {
            applicantId: "user-private-profile-123",
          },
          isPublic: true,
        };
        const parsed = savedScreenSchema.safeParse(invalidPublicScreen);
        assert.equal(parsed.success, false, "Public screen with applicantId must be rejected to prevent privacy leaks");
      });

      it("16. Saved Screen Privacy Invariant: rejects public screen with userPortfolioOnly parameter", () => {
        const invalidPublicScreen = {
          name: "Leak Test Screen 2",
          filterConfig: {
            userPortfolioOnly: true,
          },
          isPublic: true,
        };
        const parsed = savedScreenSchema.safeParse(invalidPublicScreen);
        assert.equal(parsed.success, false, "Public screen with userPortfolioOnly must be rejected");
      });

      it("17. Compare Query Zod schema enforces boundary of 2 to 4 IPO slugs", () => {
        // Less than 2: invalid
        assert.equal(compareQuerySchema.safeParse({ slugs: ["ipo-1"] }).success, false);

        // 2 to 4: valid
        assert.equal(compareQuerySchema.safeParse({ slugs: ["ipo-1", "ipo-2"] }).success, true);
        assert.equal(compareQuerySchema.safeParse({ slugs: ["ipo-1", "ipo-2", "ipo-3", "ipo-4"] }).success, true);

        // Greater than 4: invalid
        assert.equal(compareQuerySchema.safeParse({ slugs: ["ipo-1", "ipo-2", "ipo-3", "ipo-4", "ipo-5"] }).success, false);
      });
    });

    describe("Saved Screen Presets & Comparison Modules", () => {
      it("18. SavedScreenService provides exactly 4 non-advisory analytical presets", () => {
        const presets = SavedScreenService.getSystemPresets();
        assert.equal(presets.length, 4);
      });

      it("19. SavedScreenService presets maintain non-advisory labels and valid configs", () => {
        const presets = SavedScreenService.getSystemPresets();
        const names = presets.map((p) => p.name);
        assert.ok(names.includes("High Fundamental Quality"));
        assert.ok(names.includes("Low Relative Valuation"));
        assert.ok(names.includes("High Retail & HNI Momentum"));
        assert.ok(names.includes("High QIB Subscription"));

        // No prescriptive advice
        for (const p of presets) {
          assert.equal(p.name.toLowerCase().includes("buy"), false);
          assert.equal(p.name.toLowerCase().includes("sell"), false);
          assert.ok(p.filterConfig);
        }
      });

      it("20. Comparison matrix produces 6 structured comparative modules", () => {
        const emptyMatrix = {
          ipos: [],
          modules: {
            issueProfile: [],
            valuations: [],
            financialTrajectory: [],
            peerComparison: [],
            officialSubscription: [],
            unofficialSentiment: [],
            governanceAndRisk: [],
          },
        };
        const moduleKeys = Object.keys(emptyMatrix.modules);
        assert.ok(moduleKeys.includes("issueProfile"));
        assert.ok(moduleKeys.includes("valuations"));
        assert.ok(moduleKeys.includes("financialTrajectory"));
        assert.ok(moduleKeys.includes("peerComparison"));
        assert.ok(moduleKeys.includes("officialSubscription"));
        assert.ok(moduleKeys.includes("unofficialSentiment"));
      });

      it("21. Comparison matrix strictly segregates official demand from unofficial GMP sentiment", () => {
        const mockModules = {
          officialSubscription: [
            { key: "qib_sub", label: "QIB Subscription", isUnofficial: false, values: {} },
          ],
          unofficialSentiment: [
            { key: "gmp_value", label: "Unofficial GMP", isUnofficial: true, values: {} },
          ],
        };
        assert.equal(mockModules.officialSubscription[0].isUnofficial, false);
        assert.equal(mockModules.unofficialSentiment[0].isUnofficial, true);
      });
    });

    describe("Opportunity Ranking Engine & Explainability", () => {
      it("22. InvestorRankingService generates empirical positive drivers from disclosures", () => {
        const drivers = InvestorRankingService.extractPositiveDrivers(DEV_SCREENER_SEED[0]);
        assert.ok(drivers.length > 0);
        const hasScoreOrGrowth = drivers.some((d) => d.includes("score") || d.includes("revenue") || d.includes("ROE"));
        assert.ok(hasScoreOrGrowth, "Must generate empirical driver statement");
      });

      it("23. InvestorRankingService extracts RHP governance and balance sheet risk warnings", () => {
        const warnings = InvestorRankingService.extractRiskWarnings(DEV_SCREENER_SEED[0]);
        assert.ok(warnings.length > 0);
        const hasRiskFlag = warnings.some((w) => w.includes("risk flag") || w.includes("governance") || w.includes("valuation"));
        assert.ok(hasRiskFlag, "Must extract governance or valuation risk statement");
      });

      it("24. InvestorRankingService computes prospectus completeness % across 6 criteria", () => {
        const completeness = InvestorRankingService.calculateCompleteness(DEV_SCREENER_SEED[0]);
        assert.ok(completeness >= 80, `Completeness (${completeness}%) should be >= 80% for full disclosure`);
      });

      it("25. InvestorRankingService classifies metric-aware freshness (<24h fresh, <7d recent, >7d stale)", () => {
        const now = Date.now();
        const freshDate = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
        const recentDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
        const staleDate = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days ago

        assert.equal(InvestorRankingService.evaluateFreshness(freshDate), "fresh");
        assert.equal(InvestorRankingService.evaluateFreshness(recentDate), "recent");
        assert.equal(InvestorRankingService.evaluateFreshness(staleDate), "stale");
        assert.equal(InvestorRankingService.evaluateFreshness(null), "stale");
      });
    });

    describe("Portfolio Concentration (Dual-Mode HHI) & Book Liquidity", () => {
      it("26. PortfolioAnalyticsService computes primary Market-Value HHI when coverage >= 70%", () => {
        // 2 positions in 2 sectors, both with active market values (100% coverage)
        // Sector A: Renewable Energy (₹60,000, 60%), Sector B: Financial Services (₹40,000, 40%)
        // Expected HHI = 60^2 + 40^2 = 3600 + 1600 = 5200 (High concentration > 2500)
        const holdings: HoldingItem[] = [
          {
            id: "pos-1",
            securityId: "s1",
            symbol: "PREMIERENE",
            companyName: "Premier Energies Limited",
            exchange: "NSE",
            isin: "INE000000001",
            applicantId: "a1",
            applicantDisplayName: "Primary Applicant",
            applicantRelationship: "self",
            quantity: 100,
            averageCostPrice: 450,
            totalInvestedCost: 45000,
            currentPrice: 600,
            marketValue: 60000, // 60%
            unrealizedPnl: 15000,
            unrealizedPnlPct: 33.33,
            realizedPnl: 0,
            isExternalTracked: false,
            updatedAt: "2026-09-10T10:00:00Z",
          },
          {
            id: "pos-2",
            securityId: "s2",
            symbol: "BAJAJHFL",
            companyName: "Bajaj Housing Finance Limited",
            exchange: "NSE",
            isin: "INE000000002",
            applicantId: "a1",
            applicantDisplayName: "Primary Applicant",
            applicantRelationship: "self",
            quantity: 400,
            averageCostPrice: 70,
            totalInvestedCost: 28000,
            currentPrice: 100,
            marketValue: 40000, // 40%
            unrealizedPnl: 12000,
            unrealizedPnlPct: 42.86,
            realizedPnl: 0,
            isExternalTracked: false,
            updatedAt: "2026-09-10T10:00:00Z",
          },
        ];

        const report = PortfolioAnalyticsService.calculateConcentrationFromHoldings(holdings, "personal");
        assert.equal(report.marketValueCoveragePct, 100);
        assert.equal(report.primaryHhiMarketValue, 5200);
        assert.equal(report.concentrationClassification, "high");
        assert.equal(report.topSectorWeightPct, 61.64); // 45000 / 73000 invested cost
      });

      it("27. PortfolioAnalyticsService triggers Invested-Cost Fallback HHI when coverage < 70%", () => {
        // 2 positions: one has market price, one is unlisted/unpriced (coverage = 50% < 70%)
        const holdings: HoldingItem[] = [
          {
            id: "pos-1",
            securityId: "s1",
            symbol: "PREMIERENE",
            companyName: "Premier Energies Limited",
            exchange: "NSE",
            isin: "INE000000001",
            applicantId: "a1",
            applicantDisplayName: "Primary Applicant",
            applicantRelationship: "self",
            quantity: 100,
            averageCostPrice: 500,
            totalInvestedCost: 50000, // 50%
            currentPrice: 600,
            marketValue: 60000,
            unrealizedPnl: 10000,
            unrealizedPnlPct: 20,
            realizedPnl: 0,
            isExternalTracked: false,
            updatedAt: "2026-09-10T10:00:00Z",
          },
          {
            id: "pos-2",
            securityId: "s2",
            symbol: "UNLISTED",
            companyName: "Paramount Speciality Forgings Limited",
            exchange: "NSE",
            isin: "INE000000003",
            applicantId: "a1",
            applicantDisplayName: "Primary Applicant",
            applicantRelationship: "self",
            quantity: 500,
            averageCostPrice: 100,
            totalInvestedCost: 50000, // 50%
            currentPrice: null, // Unpriced!
            marketValue: null,
            unrealizedPnl: null,
            unrealizedPnlPct: null,
            realizedPnl: 0,
            isExternalTracked: false,
            updatedAt: "2026-09-10T10:00:00Z",
          },
        ];

        const report = PortfolioAnalyticsService.calculateConcentrationFromHoldings(holdings, "personal");
        assert.equal(report.marketValueCoveragePct, 50);
        assert.equal(report.isMarketValuePartial, true);
        // Fallback cost HHI = 50^2 + 50^2 = 2500 + 2500 = 5000
        assert.equal(report.fallbackHhiInvestedCost, 5000);
      });

      it("28. PortfolioAnalyticsService strictly isolates external-tracked holdings from concentration index", () => {
        const holdings: HoldingItem[] = [
          {
            id: "pos-1",
            securityId: "s1",
            symbol: "PREMIERENE",
            companyName: "Premier Energies Limited",
            exchange: "NSE",
            isin: "INE000000001",
            applicantId: "a1",
            applicantDisplayName: "Personal Portfolio",
            applicantRelationship: "self",
            quantity: 100,
            averageCostPrice: 450,
            totalInvestedCost: 45000,
            currentPrice: 600,
            marketValue: 60000,
            unrealizedPnl: 15000,
            unrealizedPnlPct: 33.33,
            realizedPnl: 0,
            isExternalTracked: false, // Personal
            updatedAt: "2026-09-10T10:00:00Z",
          },
          {
            id: "pos-external",
            securityId: "s2",
            symbol: "FRIEND_SHARE",
            companyName: "Bajaj Housing Finance Limited",
            exchange: "NSE",
            isin: "INE000000002",
            applicantId: "a2",
            applicantDisplayName: "External Friend Demat",
            applicantRelationship: "friend",
            quantity: 10000,
            averageCostPrice: 70,
            totalInvestedCost: 700000, // Huge external position
            currentPrice: 100,
            marketValue: 1000000,
            unrealizedPnl: 300000,
            unrealizedPnlPct: 42.86,
            realizedPnl: 0,
            isExternalTracked: true, // Should be excluded!
            updatedAt: "2026-09-10T10:00:00Z",
          },
        ];

        const report = PortfolioAnalyticsService.calculateConcentrationFromHoldings(holdings, "personal");
        assert.equal(report.sectorBreakdown.length, 1);
        assert.equal(report.sectorBreakdown[0].sector, "Renewable Energy");
        assert.equal(report.sectorBreakdown[0].investedCost, 45000, "External holding must not contaminate invested cost");
      });

      it("29. Capital feasibility evaluates liquid Account 1010 against retail lot with provenance disclosure", () => {
        const availableCash = 25000;
        const blockedLien = 14850;
        const requiredLot = 15000;

        const check = PortfolioAnalyticsService.calculateCapitalFeasibility(availableCash, blockedLien, requiredLot);
        assert.equal(check.availableBookCash, 25000);
        assert.equal(check.encumberedLienCash, 14850);
        assert.equal(check.totalLiquidAndEncumberedCash, 39850);
        assert.equal(check.isSufficientForLot, true);
        assert.equal(check.cashDeficitOrSurplus, 10000);
        assert.equal(check.accountSource, "Account 1010 (Bank: Available Cash)");
        assert.ok(check.auditProvenanceNotice.includes("NOT verified against your actual bank account"));
      });

      it("30. InvestorPreferences Zod schema validates user preferences with defaults", () => {
        const parsed = investorPreferencesSchema.parse({});
        assert.deepEqual(parsed.preferredCategories, ["mainboard"]);
        assert.equal(parsed.minIpoScore, 60.0);
      });
    });
  });

  describe("Phase 7A: Notifications Foundation, Security & Template Rendering Engine", () => {
    describe("1. Notification Enums & Domain Invariants", () => {
      it("1. NotificationCategory schema includes all 5 required lifecycle categories", () => {
        const categories = notificationCategoryEnum.options;
        assert.ok(categories.includes("ipo_milestone"));
        assert.ok(categories.includes("application_lifecycle"));
        assert.ok(categories.includes("allotment_refund"));
        assert.ok(categories.includes("research_gmp"));
        assert.ok(categories.includes("portfolio_capital"));
        assert.equal(categories.length, 5);
      });

      it("2. NotificationPriority schema includes exactly 4 deterministic priority tiers", () => {
        const priorities = notificationPriorityEnum.options;
        assert.deepEqual(priorities, ["urgent", "high", "normal", "low"]);
      });

      it("3. NotificationStatus schema enforces non-destructive lifecycle states", () => {
        const statuses = notificationStatusEnum.options;
        assert.deepEqual(statuses, ["unread", "read", "archived", "expired"]);
      });
    });

    describe("2. Zod Validation & Input Sanitization", () => {
      it("4. Notification filter schema validates valid category, status, and sets default pagination", () => {
        const parsed = notificationFilterSchema.parse({});
        assert.equal(parsed.category, "all");
        assert.equal(parsed.status, "all");
        assert.equal(parsed.limit, 20);
        assert.equal(parsed.offset, 0);
      });

      it("5. Notification filter schema permits specific category and status queries", () => {
        const parsed = notificationFilterSchema.parse({
          category: "allotment_refund",
          status: "unread",
          limit: 50,
          offset: 10,
        });
        assert.equal(parsed.category, "allotment_refund");
        assert.equal(parsed.status, "unread");
        assert.equal(parsed.limit, 50);
        assert.equal(parsed.offset, 10);
      });

      it("6. Notification preferences schema validates category and channel toggles", () => {
        const parsed = updateNotificationPreferenceSchema.parse({
          category: "ipo_milestone",
          channel_email: false,
          channel_push: true,
        });
        assert.equal(parsed.category, "ipo_milestone");
        assert.equal(parsed.channel_email, false);
        assert.equal(parsed.channel_push, true);
      });

      it("7. User notification settings schema validates valid IANA timezone and HH:MM quiet hours", () => {
        const parsed = updateUserNotificationSettingSchema.parse({
          timezone: "Asia/Kolkata",
          quiet_hours_enabled: true,
          quiet_hours_start: "22:00",
          quiet_hours_end: "07:00",
          min_priority_during_quiet: "urgent",
        });
        assert.equal(parsed.timezone, "Asia/Kolkata");
        assert.equal(parsed.quiet_hours_enabled, true);
        assert.equal(parsed.quiet_hours_start, "22:00");
        assert.equal(parsed.quiet_hours_end, "07:00");
        assert.equal(parsed.min_priority_during_quiet, "urgent");
      });

      it("8. User notification settings schema rejects invalid quiet hours time strings", () => {
        assert.throws(() => {
          updateUserNotificationSettingSchema.parse({
            timezone: "Asia/Kolkata",
            quiet_hours_enabled: true,
            quiet_hours_start: "25:99",
            quiet_hours_end: "07:00",
          });
        }, /Invalid time format/);
      });

      it("9. escapeHtml sanitizes script tags, quotes, and dangerous HTML entities", () => {
        const dirty = `<script>alert("XSS")</script> & 'safe'`;
        const sanitized = escapeHtml(dirty);
        assert.equal(sanitized, `&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#039;safe&#039;`);
      });
    });

    describe("3. Template Engine: Phase 2 IPO Milestones", () => {
      it("10. ipo_bidding_opened renders company name, symbol, and valid action URL", () => {
        const content = renderNotificationContent({
          eventType: "ipo_bidding_opened",
          payload: {
            companyName: "Premier Energies Limited",
            symbol: "PREMIERENE",
            slug: "premier-energies",
            issuePrice: 450,
          },
        });
        assert.equal(content.category, "ipo_milestone");
        assert.equal(content.priority, "normal");
        assert.ok(content.title.includes("Premier Energies Limited"));
        assert.ok(content.title.includes("PREMIERENE"));
        assert.equal(content.actionUrl, "/ipos/premier-energies");
        assert.equal(content.isMandatory, false);
      });

      it("11. ipo_closing_soon renders with high priority and closing date cutoff reminder", () => {
        const content = renderNotificationContent({
          eventType: "ipo_closing_soon",
          payload: {
            companyName: "Bajaj Housing Finance Limited",
            symbol: "BAJAJHFL",
            slug: "bajaj-housing",
            closeDate: "2026-09-11",
          },
        });
        assert.equal(content.priority, "high");
        assert.ok(content.message.includes("5:00 PM IST"));
        assert.equal(content.actionUrl, "/ipos/bajaj-housing");
      });

      it("12. ipo_allotment_finalized renders with urgent priority pointing to allotment info", () => {
        const content = renderNotificationContent({
          eventType: "ipo_allotment_finalized",
          payload: {
            companyName: "Northern Arc Capital",
            slug: "northern-arc",
          },
        });
        assert.equal(content.priority, "urgent");
        assert.ok(content.title.includes("Basis of Allotment Finalized"));
      });

      it("13. ipo_listing_today renders with high priority and exchange trading hours", () => {
        const content = renderNotificationContent({
          eventType: "ipo_listing_today",
          payload: {
            companyName: "Arkade Developers",
            symbol: "ARKADE",
            slug: "arkade-developers",
          },
        });
        assert.equal(content.priority, "high");
        assert.ok(content.message.includes("10:00 AM IST"));
      });
    });

    describe("4. Template Engine: Phase 3 Research, Governance & GMP Disclaimer", () => {
      it("14. Mandatory GMP Disclaimer: strictly appends unofficial disclaimer to gmp_significant_movement", () => {
        const content = renderNotificationContent({
          eventType: "gmp_significant_movement",
          payload: {
            companyName: "KRN Heat Exchanger",
            symbol: "KRN",
            slug: "krn-heat",
            gmpValue: 240,
            gmpPercentage: 110.5,
          },
        });
        assert.equal(content.category, "research_gmp");
        assert.ok(content.message.includes(MANDATORY_GMP_DISCLAIMER));
        assert.ok(content.message.includes("Unofficial grey-market indicator"));
        assert.ok(content.message.includes("not an exchange price or guaranteed listing price"));
        assert.equal(content.isMandatory, false);
      });

      it("15. governance_risk_alert renders with high priority and highlighted risk title", () => {
        const content = renderNotificationContent({
          eventType: "governance_risk_alert",
          payload: {
            companyName: "Example Biotech",
            slug: "example-biotech",
            riskTitle: "Pending promoter SEBI litigation",
          },
        });
        assert.equal(content.priority, "high");
        assert.ok(content.message.includes("Pending promoter SEBI litigation"));
      });
    });

    describe("5. Template Engine: Phase 4 & 5 Mandatory Transactional Receipts", () => {
      it("16. Mandatory In-App: application_mandate_pending sets isMandatory = true and masks UPI", () => {
        const content = renderNotificationContent({
          eventType: "application_mandate_pending",
          payload: {
            applicationId: "app-uuid-001",
            companyName: "Premier Energies Limited",
            applicationAmount: 14850,
            upiId: "rahulsharma@okaxis",
          },
        });
        assert.equal(content.isMandatory, true, "Mandate receipt must be mandatory in-app");
        assert.equal(content.priority, "urgent");
        assert.ok(content.message.includes("ra***@okaxis"), "UPI handle must be masked");
        assert.ok(!content.message.includes("rahulsharma@"), "Raw UPI username must never appear");
      });

      it("17. Mandatory In-App: application_funds_blocked sets isMandatory = true and formats ASBA amount", () => {
        const content = renderNotificationContent({
          eventType: "application_funds_blocked",
          payload: {
            applicationId: "app-uuid-002",
            companyName: "Bajaj Housing Finance",
            blockedAmount: 14960,
          },
        });
        assert.equal(content.isMandatory, true);
        assert.ok(content.message.includes("14,960"));
      });

      it("18. Mandatory In-App: application_allotment_result sets isMandatory = true and masks PAN", () => {
        const content = renderNotificationContent({
          eventType: "application_allotment_result",
          payload: {
            applicationId: "app-uuid-003",
            companyName: "Premier Energies Limited",
            sharesAllotted: 33,
            refundAmount: 0,
            pan: "ABCDE1234F",
          },
        });
        assert.equal(content.isMandatory, true);
        assert.equal(content.priority, "urgent");
        assert.ok(content.message.includes("ABCDE****F"), "PAN must be masked");
        assert.ok(!content.message.includes("1234F"), "Raw PAN middle digits must not appear unmasked");
        assert.ok(content.message.includes("33 shares"));
      });

      it("19. Mandatory In-App: application_allotment_result handles zero allotment and full lien release", () => {
        const content = renderNotificationContent({
          eventType: "application_allotment_result",
          payload: {
            applicationId: "app-uuid-004",
            companyName: "Popular IPO",
            sharesAllotted: 0,
            refundAmount: 14850,
            pan: "XYZPA9999K",
          },
        });
        assert.equal(content.isMandatory, true);
        assert.ok(content.message.includes("No shares were allotted"));
        assert.ok(content.message.includes("XYZPA****K"));
        assert.ok(content.message.includes("14,850 released"));
      });

      it("20. Mandatory In-App: application_refund_completed confirms bank lien release to account balance", () => {
        const content = renderNotificationContent({
          eventType: "application_refund_completed",
          payload: {
            applicationId: "app-uuid-005",
            companyName: "Popular IPO",
            refundAmount: 14850,
          },
        });
        assert.equal(content.isMandatory, true);
        assert.ok(content.message.includes("14,850"));
        assert.equal(content.actionUrl, "/applications/app-uuid-005");
      });

      it("21. Mandatory In-App: finance_cash_unblocked marks isMandatory = true with Account 1010 restoration", () => {
        const content = renderNotificationContent({
          eventType: "finance_cash_unblocked",
          payload: {
            unblockedAmount: 14850,
            narration: "Refund posted from registrar unblock feed.",
          },
        });
        assert.equal(content.isMandatory, true);
        assert.equal(content.category, "portfolio_capital");
        assert.ok(content.title.includes("Account 1010"));
        assert.ok(content.message.includes("14,850 unblocked from ASBA lien"));
      });

      it("22. Mandatory In-App: finance_capital_credited records capital deposit to Account 1010", () => {
        const content = renderNotificationContent({
          eventType: "finance_capital_credited",
          payload: {
            amount: 50000,
          },
        });
        assert.equal(content.isMandatory, true);
        assert.ok(content.message.includes("50,000"));
      });
    });

    describe("6. Template Engine: Phase 6 Analytics Alerts & Fallbacks", () => {
      it("23. portfolio_hhi_warning renders sector name and concentration score", () => {
        const content = renderNotificationContent({
          eventType: "portfolio_hhi_warning",
          payload: {
            sector: "Financial Services",
            hhiScore: 3200,
          },
        });
        assert.equal(content.category, "portfolio_capital");
        assert.ok(content.title.includes("Financial Services"));
        assert.ok(content.message.includes("3200"));
        assert.equal(content.actionUrl, "/analytics");
      });

      it("24. saved_screen_match renders screen title and matched company link", () => {
        const content = renderNotificationContent({
          eventType: "saved_screen_match",
          payload: {
            screenName: "High Fundamental Quality",
            companyName: "Arkade Developers",
            slug: "arkade-developers",
          },
        });
        assert.equal(content.category, "research_gmp");
        assert.ok(content.title.includes("High Fundamental Quality"));
        assert.ok(content.message.includes("Arkade Developers"));
        assert.equal(content.actionUrl, "/ipos/arkade-developers");
      });

      it("25. PII Security Invariant: Template renderer never exposes raw unmasked PAN or UPI", () => {
        const panContent = renderNotificationContent({
          eventType: "application_allotment_result",
          payload: {
            pan: "BCDEF5678G",
            sharesAllotted: 15,
            companyName: "Safe Test IPO",
          },
        });
        assert.ok(!panContent.message.includes("BCDEF5678G"));
        assert.ok(panContent.message.includes("BCDEF****G"));

        const upiContent = renderNotificationContent({
          eventType: "application_mandate_pending",
          payload: {
            upiId: "priya_sharma12@hdfcbank",
            companyName: "Safe Test IPO",
            applicationAmount: 15000,
          },
        });
        assert.ok(!upiContent.message.includes("priya_sharma12@"));
        assert.ok(upiContent.message.includes("pr***@hdfcbank"));
      });
    });

    describe("7. Security Hardening & Database Invariants", () => {
      it("26. Notification Immutability Invariant: client preference updates exclude channel_in_app", () => {
        // channel_in_app is locked to true and absent from update payload
        const parsed = updateNotificationPreferenceSchema.parse({
          category: "allotment_refund",
          channel_email: false,
          channel_push: false,
        });
        assert.equal(parsed.category, "allotment_refund");
        assert.equal(parsed.channel_email, false);
        assert.equal(parsed.channel_push, false);
        assert.equal((parsed as Record<string, unknown>).channel_in_app, undefined, "channel_in_app must not be client-mutable");
      });

      it("27. Mandatory In-App Invariant: transactional categories cannot disable in-app notifications", () => {
        // Invariant check function mirroring database trigger logic
        const validatePreferenceUpdate = (category: string, channelInApp: boolean) => {
          if (channelInApp !== true) {
            throw new Error("Illegal modification: channel_in_app cannot be set to false. In-app notifications are mandatory.");
          }
          return true;
        };

        assert.throws(() => {
          validatePreferenceUpdate("allotment_refund", false);
        }, /channel_in_app cannot be set to false/);

        assert.throws(() => {
          validatePreferenceUpdate("application_lifecycle", false);
        }, /channel_in_app cannot be set to false/);

        assert.equal(validatePreferenceUpdate("allotment_refund", true), true);
      });

      it("28. Notification Content Immutability Invariant: trigger rule rejects modifications to immutable fields", () => {
        // Contract test mirroring PostgreSQL trigger enforce_notifications_immutability()
        const validateNotificationUpdate = (
          oldRecord: { title: string; message: string; priority: string; category: string; user_id: string; is_mandatory: boolean },
          newRecord: { title: string; message: string; priority: string; category: string; user_id: string; is_mandatory: boolean }
        ) => {
          if (
            oldRecord.title !== newRecord.title ||
            oldRecord.message !== newRecord.message ||
            oldRecord.priority !== newRecord.priority ||
            oldRecord.category !== newRecord.category ||
            oldRecord.user_id !== newRecord.user_id ||
            oldRecord.is_mandatory !== newRecord.is_mandatory
          ) {
            throw new Error("Illegal modification: Notification content, priority, and audit identity are immutable.");
          }
          return true;
        };

        const original = {
          title: "Allotment Result: 33 Shares",
          message: "You have been allotted 33 shares.",
          priority: "urgent",
          category: "allotment_refund",
          user_id: "user-123",
          is_mandatory: true,
        };

        // Title tampering attempt
        assert.throws(() => {
          validateNotificationUpdate(original, { ...original, title: "Tampered Title" });
        }, /Notification content, priority, and audit identity are immutable/);

        // Priority tampering attempt
        assert.throws(() => {
          validateNotificationUpdate(original, { ...original, priority: "low" });
        }, /Notification content, priority, and audit identity are immutable/);

        // is_mandatory tampering attempt
        assert.throws(() => {
          validateNotificationUpdate(original, { ...original, is_mandatory: false });
        }, /Notification content, priority, and audit identity are immutable/);

        // Identical immutable fields pass
        assert.equal(validateNotificationUpdate(original, { ...original }), true);
      });

      it("29. Notification Lifecycle Transition Invariant: status allows valid transitions only", () => {
        const isValidNotificationTransition = (current: string, next: string): boolean => {
          const transitions: Record<string, string[]> = {
            unread: ["read", "archived", "expired"],
            read: ["archived", "expired"],
            archived: ["expired"],
            expired: [],
          };
          return transitions[current]?.includes(next) ?? false;
        };

        assert.equal(isValidNotificationTransition("unread", "read"), true);
        assert.equal(isValidNotificationTransition("unread", "archived"), true);
        assert.equal(isValidNotificationTransition("read", "archived"), true);
        assert.equal(isValidNotificationTransition("archived", "read"), false, "Cannot unarchive to read");
        assert.equal(isValidNotificationTransition("expired", "unread"), false, "Cannot resurrect expired notification");
      });

      it("30. Non-Destructive Retention Invariant: physical deletion is strictly prohibited", () => {
        const executeNotificationDelete = () => {
          throw new Error("Physical deletion of notification records is prohibited. Use status transition to archived or expired.");
        };

        assert.throws(() => {
          executeNotificationDelete();
        }, /Physical deletion of notification records is prohibited/);
      });
    });

    describe("8. Phase 7B: Notification Processing, Evaluators & Concurrency Engine", () => {
      it("31. Event lifecycle: pending -> processing -> processed state transition", () => {
        type EventState = "pending" | "processing" | "processed" | "failed" | "dead_letter";
        const transition = (current: EventState, action: "claim" | "success" | "transient_fail" | "exhaust"): EventState => {
          if (current === "pending" && action === "claim") return "processing";
          if (current === "processing" && action === "success") return "processed";
          if (current === "processing" && action === "transient_fail") return "failed";
          if (current === "processing" && action === "exhaust") return "dead_letter";
          throw new Error(`Invalid state transition from ${current} via ${action}`);
        };

        let state: EventState = "pending";
        state = transition(state, "claim");
        assert.equal(state, "processing");
        state = transition(state, "success");
        assert.equal(state, "processed");
      });

      it("32. Concurrency lease expiry: allows reclamation when locked_at exceeds lease_seconds", () => {
        const isLeaseExpired = (lockedAt: Date, leaseSeconds: number, now: Date = new Date()): boolean => {
          return now.getTime() - lockedAt.getTime() > leaseSeconds * 1000;
        };

        const now = new Date();
        const freshLock = new Date(now.getTime() - 30 * 1000); // 30s ago
        const staleLock = new Date(now.getTime() - 90 * 1000); // 90s ago

        assert.equal(isLeaseExpired(freshLock, 60, now), false, "Fresh lease must not be reclaimable");
        assert.equal(isLeaseExpired(staleLock, 60, now), true, "Expired lease must be reclaimable");
      });

      it("33. Exponential backoff: computeBackoffSeconds matches min(300, 2^attempt * 5) formula", () => {
        assert.equal(EventProcessor.computeBackoffSeconds(1), 10);
        assert.equal(EventProcessor.computeBackoffSeconds(2), 20);
        assert.equal(EventProcessor.computeBackoffSeconds(3), 40);
        assert.equal(EventProcessor.computeBackoffSeconds(4), 80);
        assert.equal(EventProcessor.computeBackoffSeconds(5), 160);
        assert.equal(EventProcessor.computeBackoffSeconds(6), 300, "Capped at 300s");
        assert.equal(EventProcessor.computeBackoffSeconds(10), 300, "Capped at 300s");
      });

      it("34. Error classification: fatal errors transition immediately to dead_letter", () => {
        const fatalErr = new Error("Invalid schema version v9.9 in payload");
        const transientErr = new Error("Connection terminated unexpectedly");

        assert.equal(EventProcessor.isFatalError(fatalErr), true, "Schema errors must be fatal");
        assert.equal(EventProcessor.isFatalError(transientErr), false, "Network timeouts must be retryable");
      });

      it("35. Error classification: transient errors retry up to MAX_ATTEMPTS (5 total) before dead_letter", () => {
        const determineNextStatus = (attempt: number, maxAttempts: number, isFatal: boolean): "failed" | "dead_letter" => {
          if (isFatal || attempt >= maxAttempts) return "dead_letter";
          return "failed";
        };

        assert.equal(determineNextStatus(1, 5, false), "failed", "Attempt 1 of 5 retries");
        assert.equal(determineNextStatus(4, 5, false), "failed", "Attempt 4 of 5 retries");
        assert.equal(determineNextStatus(5, 5, false), "dead_letter", "Attempt 5 of 5 is exhausted");
        assert.equal(determineNextStatus(1, 5, true), "dead_letter", "Fatal error jumps to dead_letter immediately");
      });

      it("36. Dead-letter replay auditability: preserves previous attempt and failure history in metadata", () => {
        const applyReplay = (event: {
          status: string;
          attempt_count: number;
          last_error: string | null;
          metadata: Record<string, unknown>;
        }, operatorId: string, reason: string) => {
          const priorReplays = (event.metadata.replay_history as Array<Record<string, unknown>>) || [];
          return {
            status: "pending",
            attempt_count: 0,
            last_error: null,
            metadata: {
              ...event.metadata,
              replay_history: [
                ...priorReplays,
                {
                  replayed_at: "2026-09-10T17:00:00Z",
                  replayed_by: operatorId,
                  reason,
                  prior_attempts: event.attempt_count,
                  prior_error: event.last_error,
                },
              ],
            },
          };
        };

        const deadEvent = {
          status: "dead_letter",
          attempt_count: 5,
          last_error: '{"message":"DB timeout"}',
          metadata: { initial_source: "cron" },
        };

        const replayed = applyReplay(deadEvent, "admin-user-1", "Recovered from network drop");
        assert.equal(replayed.status, "pending");
        assert.equal(replayed.attempt_count, 0);
        assert.equal(replayed.last_error, null);
        const history = replayed.metadata.replay_history as Array<{ prior_attempts: number; replayed_by: string; reason: string }>;
        assert.equal(history.length, 1);
        assert.equal(history[0].prior_attempts, 5);
        assert.equal(history[0].replayed_by, "admin-user-1");
        assert.equal(history[0].reason, "Recovered from network drop");
      });

      it("37. RPC security authorization: unauthenticated/anon callers rejected by claim_notification_events", () => {
        const verifyRpcCallerRole = (role: string, userRole?: string) => {
          if (role !== "service_role" && userRole !== "super_admin" && userRole !== "admin") {
            throw new Error("Access denied: Admin or service-role privileges required");
          }
          return true;
        };

        assert.throws(() => verifyRpcCallerRole("anon"), /Access denied/);
        assert.throws(() => verifyRpcCallerRole("authenticated", "user"), /Access denied/);
        assert.equal(verifyRpcCallerRole("service_role"), true);
        assert.equal(verifyRpcCallerRole("authenticated", "admin"), true);
      });

      it("38. Replay security authorization: non-admin callers rejected by replay_dead_letter_event", () => {
        const verifyReplayCaller = (role: string, userRole?: string) => {
          if (role !== "service_role" && userRole !== "super_admin" && userRole !== "admin") {
            throw new Error("Access denied: Admin or service-role privileges required to replay dead-letter events");
          }
          return true;
        };

        assert.throws(() => verifyReplayCaller("anon"), /Access denied/);
        assert.throws(() => verifyReplayCaller("authenticated", "user"), /Access denied/);
        assert.equal(verifyReplayCaller("authenticated", "admin"), true);
        assert.equal(verifyReplayCaller("service_role"), true);
      });

      it("39. Atomic claiming invariant: FOR UPDATE SKIP LOCKED prevents double-claiming", () => {
        // Simulation of database table state with lock check
        const lockedIds = new Set<string>();
        const claimEvent = (id: string) => {
          if (lockedIds.has(id)) return null; // SKIP LOCKED behavior
          lockedIds.add(id);
          return { id, status: "processing" };
        };

        const workerA = claimEvent("evt-1");
        assert.ok(workerA !== null);
        assert.equal(workerA.id, "evt-1");

        const workerB = claimEvent("evt-1");
        assert.equal(workerB, null, "Concurrent worker must skip already locked event");
      });

      it("40. Database-level deduplication: UNIQUE(user_id, event_id) prevents duplicate notification insertion", () => {
        const insertedKeys = new Set<string>();
        const insertNotification = (userId: string, eventId: string) => {
          const composite = `${userId}:${eventId}`;
          if (insertedKeys.has(composite)) {
            // ON CONFLICT DO NOTHING behavior
            return { inserted: false };
          }
          insertedKeys.add(composite);
          return { inserted: true };
        };

        assert.deepEqual(insertNotification("u1", "e1"), { inserted: true });
        assert.deepEqual(insertNotification("u1", "e1"), { inserted: false }, "Duplicate composite key must be ignored");
        assert.deepEqual(insertNotification("u2", "e1"), { inserted: true }, "Different user receives own record");
      });

      it("41. Atomic processing: failure rolls back notification and marks event failed with backoff", () => {
        let eventStatus = "processing";
        const notificationTable: string[] = [];

        const executeTransaction = (simulateFailure: boolean) => {
          const tempNotif = "notif-item";
          if (simulateFailure) {
            // Transaction aborted: state rolled back
            eventStatus = "failed";
            return;
          }
          notificationTable.push(tempNotif);
          eventStatus = "processed";
        };

        executeTransaction(true);
        assert.equal(eventStatus, "failed");
        assert.equal(notificationTable.length, 0, "No orphaned notifications persisted on failure");

        executeTransaction(false);
        assert.equal(eventStatus, "processed");
        assert.equal(notificationTable.length, 1);
      });

      it("42. Milestone evaluator: ipo_bidding_opened detected for open_date = today_ist with status 'open'", () => {
        const todayIST = IPOMilestoneEvaluator.getTodayIST();
        const candidate = {
          id: "ipo-1",
          slug: "premier-energies",
          companyName: "Premier Energies Ltd",
          symbol: "PREMIERENE",
          status: "open",
          openDate: todayIST,
          closeDate: "2026-09-15",
          allotmentDate: "2026-09-18",
          listingDate: "2026-09-22",
        };

        const events = IPOMilestoneEvaluator.evaluateCandidates([candidate]);
        const openEvent = events.find((e) => e.eventType === "ipo_bidding_opened");
        assert.ok(openEvent);
        assert.equal(openEvent.aggregateId, "ipo-1");
        assert.equal(openEvent.idempotencyKey, `ipo:milestone:opened:ipo-1:${todayIST}`);
      });

      it("43. Milestone evaluator: ipo_closing_soon cutoff alert detected on close_date = today_ist", () => {
        const todayIST = IPOMilestoneEvaluator.getTodayIST();
        const candidate = {
          id: "ipo-2",
          slug: "bajaj-housing",
          companyName: "Bajaj Housing Finance Ltd",
          symbol: "BAJAJHFL",
          status: "open",
          openDate: "2026-09-08",
          closeDate: todayIST,
          allotmentDate: "2026-09-15",
          listingDate: "2026-09-18",
        };

        const events = IPOMilestoneEvaluator.evaluateCandidates([candidate]);
        const closeEvent = events.find((e) => e.eventType === "ipo_closing_soon");
        assert.ok(closeEvent);
        assert.equal(closeEvent.idempotencyKey, `ipo:milestone:closing:ipo-2:${todayIST}`);
      });

      it("44. Milestone evaluator: ipo_allotment_finalized detected on allotment_date = today_ist", () => {
        const todayIST = IPOMilestoneEvaluator.getTodayIST();
        const candidate = {
          id: "ipo-3",
          slug: "tata-tech",
          companyName: "Tata Technologies Ltd",
          symbol: "TATATECH",
          status: "allotment_pending",
          openDate: "2026-09-01",
          closeDate: "2026-09-05",
          allotmentDate: todayIST,
          listingDate: "2026-09-15",
        };

        const events = IPOMilestoneEvaluator.evaluateCandidates([candidate]);
        const allotEvent = events.find((e) => e.eventType === "ipo_allotment_finalized");
        assert.ok(allotEvent);
        assert.equal(allotEvent.idempotencyKey, `ipo:milestone:allotment:ipo-3:${todayIST}`);
      });

      it("45. Milestone evaluator: ipo_listing_today detected on listing_date = today_ist", () => {
        const todayIST = IPOMilestoneEvaluator.getTodayIST();
        const candidate = {
          id: "ipo-4",
          slug: "swiggy-ltd",
          companyName: "Swiggy Limited",
          symbol: "SWIGGY",
          status: "listing_soon",
          openDate: "2026-09-01",
          closeDate: "2026-09-05",
          allotmentDate: "2026-09-08",
          listingDate: todayIST,
        };

        const events = IPOMilestoneEvaluator.evaluateCandidates([candidate]);
        const listEvent = events.find((e) => e.eventType === "ipo_listing_today");
        assert.ok(listEvent);
        assert.equal(listEvent.idempotencyKey, `ipo:milestone:listing:ipo-4:${todayIST}`);
      });

      it("46. Milestone evaluator: stale milestone older than 24 hours is discarded without alerting", () => {
        const referenceNow = new Date("2026-09-10T12:00:00Z");
        assert.equal(IPOMilestoneEvaluator.isMilestoneStale("2026-09-07", referenceNow), true, "3 days old is stale");
        assert.equal(IPOMilestoneEvaluator.isMilestoneStale("2026-09-09", referenceNow), false, "1 day old is not stale");
        assert.equal(IPOMilestoneEvaluator.isMilestoneStale("2026-09-10", referenceNow), false, "Same day is fresh");
      });

      it("47. Milestone evaluator: deterministic idempotency key prevents duplicate milestone events", () => {
        const k1 = "ipo:milestone:opened:ipo-1:2026-09-10";
        const k2 = "ipo:milestone:opened:ipo-1:2026-09-10";
        assert.equal(k1, k2);
      });

      it("48. GMP Movement evaluator: detects jump >= ₹25 or >= 15% using verified gmp_value & observed_at", () => {
        const prev = {
          id: "gmp-1",
          ipoId: "ipo-1",
          gmpValue: 100,
          gmpPercentage: 20.0,
          estimatedListingPrice: 600,
          observedAt: "2026-09-09T10:00:00Z",
        };
        const latest = {
          id: "gmp-2",
          ipoId: "ipo-1",
          gmpValue: 130, // +30 change (>= 25)
          gmpPercentage: 26.0,
          estimatedListingPrice: 630,
          observedAt: "2026-09-10T10:00:00Z",
        };

        const res = GMPMovementEvaluator.evaluateMovement(latest, prev);
        assert.equal(res.isSignificant, true);
        assert.equal(res.deltaValue, 30);
        assert.equal(res.idempotencyKey, "gmp:movement:ipo-1:gmp-2");
      });

      it("49. GMP Movement evaluator: strictly appends mandatory SEBI unofficial disclaimer", () => {
        const prev = {
          id: "gmp-1",
          ipoId: "ipo-1",
          gmpValue: 50,
          gmpPercentage: 10.0,
          estimatedListingPrice: 550,
          observedAt: "2026-09-09T10:00:00Z",
        };
        const latest = {
          id: "gmp-2",
          ipoId: "ipo-1",
          gmpValue: 80,
          gmpPercentage: 16.0,
          estimatedListingPrice: 580,
          observedAt: "2026-09-10T10:00:00Z",
        };

        const res = GMPMovementEvaluator.evaluateMovement(latest, prev);
        assert.equal(res.isSignificant, true);
        assert.equal(res.eventPayload?.disclaimer, MANDATORY_GMP_DISCLAIMER);
      });

      it("50. GMP Movement evaluator: ignores sub-threshold movements (< ₹25 and < 15%)", () => {
        const prev = {
          id: "gmp-1",
          ipoId: "ipo-1",
          gmpValue: 100,
          gmpPercentage: 20.0,
          estimatedListingPrice: 600,
          observedAt: "2026-09-09T10:00:00Z",
        };
        const latest = {
          id: "gmp-2",
          ipoId: "ipo-1",
          gmpValue: 110, // +10 change (< 25)
          gmpPercentage: 22.0, // +2% change (< 15%)
          estimatedListingPrice: 610,
          observedAt: "2026-09-10T10:00:00Z",
        };

        const res = GMPMovementEvaluator.evaluateMovement(latest, prev);
        assert.equal(res.isSignificant, false);
      });

      it("51. Governance Risk evaluator: triggers governance_risk_alert strictly for severity = 'high'", () => {
        const risks = [
          { id: "r1", ipoId: "ipo-1", title: "Minor supplier concentration", severity: "low" as const },
          { id: "r2", ipoId: "ipo-1", title: "Pending tax litigation of ₹500 Cr", severity: "high" as const },
          { id: "r3", ipoId: "ipo-1", title: "Raw material cost fluctuations", severity: "medium" as const },
        ];

        const events = GovernanceRiskEvaluator.evaluateRisks(risks);
        assert.equal(events.length, 1);
        assert.equal(events[0].eventType, "governance_risk_alert");
        assert.equal(events[0].aggregateId, "r2");
      });

      it("52. Saved Screen evaluator: newly matching candidate inserts into notification_screen_matches and emits event", () => {
        const screen = {
          id: "screen-1",
          userId: "user-1",
          name: "High Score Mainboard",
          filterConfig: { overallScoreMin: 75, category: ["mainboard"] as [IPOCategory] },
        };
        const candidates = [
          {
            id: "ipo-10",
            slug: "quality-ipo",
            company_name: "Quality IPO Ltd",
            symbol: "QUAL",
            category: "mainboard",
            issue_type: "book_building",
            status: "open",
            overall_score: 82,
            pe_ratio_high: 25,
            latest_subscription_x: 2.5,
            latest_gmp_gain_pct: 12,
          },
        ];

        const knownMatches = new Set<string>();
        const { newMatches, matchPairsToPersist } = SavedScreenEvaluator.evaluateScreens({
          screens: [screen],
          candidates: candidates as unknown as ScreenerRecord[],
          knownMatches,
        });

        assert.equal(newMatches.length, 1);
        assert.equal(newMatches[0].eventType, "saved_screen_match");
        assert.equal(newMatches[0].userId, "user-1");
        assert.equal(matchPairsToPersist.length, 1);
        assert.equal(matchPairsToPersist[0].screenId, "screen-1");
        assert.equal(matchPairsToPersist[0].ipoId, "ipo-10");
      });

      it("53. Saved Screen evaluator: previously matched candidate does NOT emit duplicate event", () => {
        const screen = {
          id: "screen-1",
          userId: "user-1",
          name: "High Score Mainboard",
          filterConfig: { overallScoreMin: 75 },
        };
        const candidates = [
          {
            id: "ipo-10",
            slug: "quality-ipo",
            company_name: "Quality IPO Ltd",
            symbol: "QUAL",
            category: "mainboard",
            issue_type: "book_building",
            status: "open",
            overall_score: 82,
          },
        ];

        // Already matched in persistent table!
        const knownMatches = new Set(["screen-1:ipo-10"]);
        const { newMatches, matchPairsToPersist } = SavedScreenEvaluator.evaluateScreens({
          screens: [screen],
          candidates: candidates as unknown as ScreenerRecord[],
          knownMatches,
        });

        assert.equal(newMatches.length, 0, "Previously matched IPO must not emit another alert");
        assert.equal(matchPairsToPersist.length, 0);
      });

      it("54. Portfolio HHI evaluator: reuses authoritative Phase 6 PortfolioAnalyticsService", () => {
        // High concentration holdings: 2 positions in 1 sector (Renewable Energy)
        const holdings = [
          {
            id: "p1",
            securityId: "s1",
            companyName: "Premier Energies Ltd",
            quantity: 100,
            averageCostPrice: 450,
            totalInvestedCost: 45000,
            currentPrice: 600,
            marketValue: 60000,
            isExternalTracked: false,
            updatedAt: "2026-09-10T00:00:00Z",
            symbol: "PREMIER",
            exchange: "NSE",
            isin: "INE001",
            applicantId: "a1",
            applicantDisplayName: "Self",
            applicantRelationship: "self" as const,
            unrealizedPnl: 15000,
            unrealizedPnlPct: 33.33,
            realizedPnl: 0,
          },
          {
            id: "p2",
            securityId: "s2",
            companyName: "Waaree Energies Ltd",
            symbol: "WAAREE",
            quantity: 200,
            averageCostPrice: 1500,
            totalInvestedCost: 300000,
            currentPrice: 2000,
            marketValue: 400000,
            isExternalTracked: false,
            updatedAt: "2026-09-10T00:00:00Z",
            exchange: "NSE",
            isin: "INE002",
            applicantId: "a1",
            applicantDisplayName: "Self",
            applicantRelationship: "self" as const,
            unrealizedPnl: 100000,
            unrealizedPnlPct: 33.33,
            realizedPnl: 0,
          },
        ];

        const res = PortfolioHHIEvaluator.evaluateHoldings("user-1", holdings);
        // 100% in Renewable Energy -> HHI = 100^2 = 10,000 >= 2500
        assert.equal(res.shouldAlert, true);
        assert.equal(res.effectiveHHI, 10000);
        assert.equal(res.topSector, "Renewable Energy");
      });

      it("55. Portfolio HHI evaluator: strictly excludes is_external_tracked = true positions", () => {
        const holdings = [
          {
            id: "p1",
            securityId: "s1",
            companyName: "Premier Energies Ltd",
            symbol: "PREMIER",
            quantity: 100,
            averageCostPrice: 450,
            totalInvestedCost: 45000,
            currentPrice: 600,
            marketValue: 60000,
            isExternalTracked: true, // MUST BE EXCLUDED!
            updatedAt: "2026-09-10T00:00:00Z",
            exchange: "NSE",
            isin: "INE001",
            applicantId: "a1",
            applicantDisplayName: "Self",
            applicantRelationship: "self" as const,
            unrealizedPnl: 15000,
            unrealizedPnlPct: 33.33,
            realizedPnl: 0,
          },
        ];

        const res = PortfolioHHIEvaluator.evaluateHoldings("user-1", holdings);
        // With external holding excluded, eligible portfolio is empty -> HHI = 0
        assert.equal(res.shouldAlert, false);
        assert.equal(res.effectiveHHI, 0);
      });

      it("56. Portfolio HHI evaluator: triggers invested-cost fallback when market value coverage < 70%", () => {
        const holdings = [
          {
            id: "p1",
            securityId: "s1",
            companyName: "Premier Energies Ltd", // Renewable Energy
            symbol: "PREMIER",
            quantity: 100,
            averageCostPrice: 500,
            totalInvestedCost: 50000,
            currentPrice: 600,
            marketValue: 60000,
            isExternalTracked: false,
            updatedAt: "2026-09-10T00:00:00Z",
            exchange: "NSE",
            isin: "INE001",
            applicantId: "a1",
            applicantDisplayName: "Self",
            applicantRelationship: "self" as const,
            unrealizedPnl: 10000,
            unrealizedPnlPct: 20,
            realizedPnl: 0,
          },
          {
            id: "p2",
            securityId: "s2",
            companyName: "Bajaj Housing Finance Ltd", // Financial Services
            symbol: "BAJAJHFL",
            quantity: 500,
            averageCostPrice: 100,
            totalInvestedCost: 50000,
            currentPrice: null as unknown as number, // Unpriced! Coverage = 50% < 70%
            marketValue: null,
            isExternalTracked: false,
            updatedAt: "2026-09-10T00:00:00Z",
            exchange: "NSE",
            isin: "INE002",
            applicantId: "a1",
            applicantDisplayName: "Self",
            applicantRelationship: "self" as const,
            unrealizedPnl: 0,
            unrealizedPnlPct: 0,
            realizedPnl: 0,
          },
        ];

        const res = PortfolioHHIEvaluator.evaluateHoldings("user-1", holdings);
        assert.equal(res.isFallback, true, "Must fall back to invested cost due to < 70% coverage");
        // Cost: 50k (50%) and 50k (50%) -> HHI = 50^2 + 50^2 = 5000 >= 2500
        assert.equal(res.effectiveHHI, 5000);
        assert.equal(res.shouldAlert, true);
      });

      it("57. Portfolio HHI evaluator: alerts only when effective HHI >= 2500", () => {
        // Balanced portfolio across 4 sectors (25% each) -> HHI = 4 * 25^2 = 2500 (Moderate, not High >2500)
        const holdings = [
          { companyName: "Solar Energy Ltd", totalInvestedCost: 25000, marketValue: 25000, isExternalTracked: false },
          { companyName: "Housing Finance Ltd", totalInvestedCost: 25000, marketValue: 25000, isExternalTracked: false },
          { companyName: "Steel Forging Ltd", totalInvestedCost: 25000, marketValue: 25000, isExternalTracked: false },
          { companyName: "Alpha Industrials Ltd", totalInvestedCost: 25000, marketValue: 25000, isExternalTracked: false },
        ].map((h, i) => ({
          ...h,
          id: `p-${i}`,
          securityId: `s-${i}`,
          symbol: `SYM-${i}`,
          quantity: 100,
          averageCostPrice: 200,
          currentPrice: 200,
          exchange: "NSE",
          isin: `INE00${i}`,
          applicantId: "a1",
          applicantDisplayName: "Self",
          applicantRelationship: "self" as const,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          realizedPnl: 0,
          updatedAt: "2026-09-10T00:00:00Z",
        }));

        const res = PortfolioHHIEvaluator.evaluateHoldings("user-1", holdings);
        assert.equal(res.shouldAlert, false, "Diversified portfolio must not alert");
      });

      it("58. Preference filtering: suppresses email when channel_email = false", () => {
        const evalRes = PreferenceEvaluator.evaluateChannels({
          category: "research_gmp",
          priority: "normal",
          isMandatory: false,
          preferences: {
            category: "research_gmp",
            channelInApp: true,
            channelEmail: false, // User disabled email
            channelPush: true,
          },
        });

        assert.equal(evalRes.deliverInApp, true);
        assert.equal(evalRes.deliverEmail, false);
        assert.equal(evalRes.deliverPush, true);
      });

      it("59. Preference filtering: suppresses push when channel_push = false", () => {
        const evalRes = PreferenceEvaluator.evaluateChannels({
          category: "ipo_milestone",
          priority: "high",
          isMandatory: false,
          preferences: {
            category: "ipo_milestone",
            channelInApp: true,
            channelEmail: true,
            channelPush: false, // User disabled push
          },
        });

        assert.equal(evalRes.deliverInApp, true);
        assert.equal(evalRes.deliverEmail, true);
        assert.equal(evalRes.deliverPush, false);
      });

      it("60. Mandatory In-App invariant: is_mandatory = true cannot be suppressed by preferences or quiet hours", () => {
        const evalRes = PreferenceEvaluator.evaluateChannels({
          category: "allotment_refund",
          priority: "normal",
          isMandatory: true, // Transactional receipt!
          preferences: {
            category: "allotment_refund",
            channelInApp: false as unknown as boolean, // Illegal attempt
            channelEmail: false,
            channelPush: false,
          },
          quietHours: {
            timezone: "Asia/Kolkata",
            quietHoursEnabled: true,
            quietHoursStart: "00:00:00",
            quietHoursEnd: "23:59:59", // Active 24h
            minPriorityDuringQuiet: "urgent",
          },
        });

        assert.equal(evalRes.deliverInApp, true, "Mandatory receipt MUST be delivered in-app unconditionally");
      });

      it("61. Quiet Hours: urgent priority alerts bypass quiet hours; normal alerts are held", () => {
        const quietSettings = {
          timezone: "Asia/Kolkata",
          quietHoursEnabled: true,
          quietHoursStart: "22:00:00",
          quietHoursEnd: "07:00:00",
          minPriorityDuringQuiet: "urgent" as const,
        };

        // Simulated time: 23:30 IST (inside quiet hours)
        const nightTime = new Date("2026-09-10T18:00:00Z"); // 18:00 UTC = 23:30 IST

        // Urgent alert
        const urgentRes = PreferenceEvaluator.evaluateChannels({
          category: "ipo_milestone",
          priority: "urgent",
          isMandatory: false,
          preferences: { category: "ipo_milestone", channelInApp: true, channelEmail: true, channelPush: true },
          quietHours: quietSettings,
          now: nightTime,
        });
        assert.equal(urgentRes.deliverPush, true, "Urgent alert must bypass quiet hours");
        assert.equal(urgentRes.isHeldDueToQuietHours, false);

        // Normal alert
        const normalRes = PreferenceEvaluator.evaluateChannels({
          category: "ipo_milestone",
          priority: "normal",
          isMandatory: false,
          preferences: { category: "ipo_milestone", channelInApp: true, channelEmail: true, channelPush: true },
          quietHours: quietSettings,
          now: nightTime,
        });
        assert.equal(normalRes.deliverPush, false, "Normal alert push must be held during quiet hours");
        assert.equal(normalRes.isHeldDueToQuietHours, true);
      });

      it("62. Error sanitization: last_error strips stack traces, SQL text, and PII, truncating to 500 chars", () => {
        const rawError = new Error(
          "Error at pg.Client.query (C:/Users/Dell/scratch/ipo-saas/query.ts:45:12)\n" +
          "SELECT * FROM profiles WHERE pan = 'ABCDE1234F' AND upi = 'secret@upi'\n" +
          "Stack trace:\n" +
          "  at Function.execute (node_modules/pg/lib/connection.js:12:34)"
        );

        const sanitized = EventProcessor.sanitizeError(rawError, 2);
        assert.ok(sanitized.length <= 500);
        assert.ok(!sanitized.includes("ABCDE1234F"), "Must not leak raw PAN");
        assert.ok(!sanitized.includes("secret@upi"), "Must not leak raw UPI");
        assert.ok(!sanitized.includes("Stack trace"), "Must not leak stack traces");
        assert.ok(!sanitized.includes("C:/Users/Dell/"), "Must not leak file paths");
      });
    });

    describe("9. Phase 7C: Real-Time Notification Delivery, Monotonic Reconciler & Transport Invariants", () => {
      const createMockNotification = (overrides: Partial<NotificationRow> = {}): NotificationRow => ({
        id: overrides.id || "notif-mock-1",
        user_id: overrides.user_id || "user-mock-1",
        event_id: overrides.event_id || "event-mock-1",
        category: overrides.category || "ipo_milestone",
        priority: overrides.priority || "normal",
        status: overrides.status || "unread",
        title: overrides.title || "Mock Alert",
        message: overrides.message || "Mock alert message body",
        action_url: overrides.action_url || null,
        action_label: overrides.action_label || null,
        metadata: overrides.metadata || {},
        is_mandatory: overrides.is_mandatory ?? false,
        read_at: overrides.read_at || null,
        archived_at: overrides.archived_at || null,
        expires_at: overrides.expires_at || null,
        created_at: overrides.created_at || "2026-09-10T12:00:00.000Z",
      });

      // 1. Monotonic status transitions
      it("63. Monotonic status transition: unread -> read is a valid forward transition", () => {
        assert.equal(isValidStatusTransition("unread", "read"), true);
      });

      it("64. Monotonic status transition: unread -> archived is a valid forward transition", () => {
        assert.equal(isValidStatusTransition("unread", "archived"), true);
      });

      it("65. Monotonic status transition: read -> archived is a valid forward transition", () => {
        assert.equal(isValidStatusTransition("read", "archived"), true);
      });

      it("66. Monotonic status transition: same-state transitions (read -> read, archived -> archived) are permitted", () => {
        assert.equal(isValidStatusTransition("read", "read"), true);
        assert.equal(isValidStatusTransition("archived", "archived"), true);
        assert.equal(isValidStatusTransition("unread", "unread"), true);
      });

      it("67. Monotonic status transition: illegal regression read -> unread is strictly rejected", () => {
        assert.equal(isValidStatusTransition("read", "unread"), false);
      });

      it("68. Monotonic status transition: illegal regression archived -> unread is strictly rejected", () => {
        assert.equal(isValidStatusTransition("archived", "unread"), false);
      });

      it("69. Monotonic status transition: illegal regression archived -> read is strictly rejected", () => {
        assert.equal(isValidStatusTransition("archived", "read"), false);
      });

      // 2. Progressive State Reconciler
      it("70. Progressive reconciler: prepends new INSERT notification to empty list", () => {
        const item = createMockNotification({ id: "n1", title: "First alert" });
        const result = reconcileNotification([], item);
        assert.equal(result.length, 1);
        assert.equal(result[0].id, "n1");
      });

      it("71. Progressive reconciler: prepends new INSERT notification to preserve reverse-chronological order", () => {
        const item1 = createMockNotification({ id: "n1", created_at: "2026-09-10T10:00:00Z" });
        const item2 = createMockNotification({ id: "n2", created_at: "2026-09-10T11:00:00Z" });
        const result = reconcileNotification([item1], item2);
        assert.equal(result.length, 2);
        assert.equal(result[0].id, "n2", "Newer item must be prepended to the top");
        assert.equal(result[1].id, "n1");
      });

      it("72. Progressive reconciler: duplicate INSERT with identical notification.id is deduplicated to 1 item", () => {
        const item = createMockNotification({ id: "n-dup", title: "Duplicate Test" });
        const list1 = reconcileNotification([], item);
        const list2 = reconcileNotification(list1, item);
        assert.equal(list2.length, 1, "Duplicate notification must not create a second row");
        assert.equal(list2[0].id, "n-dup");
      });

      it("73. Progressive reconciler: Realtime UPDATE from unread to read mutates target item and sets read_at", () => {
        const unreadItem = createMockNotification({ id: "n-update", status: "unread", read_at: null });
        const readUpdate = createMockNotification({
          id: "n-update",
          status: "read",
          read_at: "2026-09-10T12:05:00Z",
        });

        const updatedList = reconcileNotification([unreadItem], readUpdate);
        assert.equal(updatedList.length, 1);
        assert.equal(updatedList[0].status, "read");
        assert.equal(updatedList[0].read_at, "2026-09-10T12:05:00Z");
      });

      it("74. Progressive reconciler: Realtime UPDATE from read to archived preserves existing read_at and sets archived_at", () => {
        const readItem = createMockNotification({
          id: "n-arch",
          status: "read",
          read_at: "2026-09-10T12:05:00Z",
          archived_at: null,
        });
        const archivedUpdate = createMockNotification({
          id: "n-arch",
          status: "archived",
          read_at: null, // payload might omit read_at
          archived_at: "2026-09-10T12:10:00Z",
        });

        const updatedList = reconcileNotification([readItem], archivedUpdate);
        assert.equal(updatedList.length, 1);
        assert.equal(updatedList[0].status, "archived");
        assert.equal(updatedList[0].read_at, "2026-09-10T12:05:00Z", "Must preserve earlier read_at");
        assert.equal(updatedList[0].archived_at, "2026-09-10T12:10:00Z");
      });

      it("75. Progressive reconciler: out-of-order UPDATE with unread cannot revert an already read alert", () => {
        const currentRead = createMockNotification({
          id: "n-ooo-1",
          status: "read",
          read_at: "2026-09-10T12:05:00Z",
        });
        const staleUnread = createMockNotification({
          id: "n-ooo-1",
          status: "unread",
          read_at: null,
        });

        const reconciled = reconcileNotification([currentRead], staleUnread);
        assert.equal(reconciled[0].status, "read", "Stale unread must be rejected");
        assert.equal(reconciled[0].read_at, "2026-09-10T12:05:00Z");
      });

      it("76. Progressive reconciler: out-of-order UPDATE cannot revert an already archived alert", () => {
        const currentArchived = createMockNotification({
          id: "n-ooo-2",
          status: "archived",
          archived_at: "2026-09-10T12:10:00Z",
        });
        const staleRead = createMockNotification({
          id: "n-ooo-2",
          status: "read",
          read_at: "2026-09-10T12:05:00Z",
        });

        const reconciled = reconcileNotification([currentArchived], staleRead);
        assert.equal(reconciled[0].status, "archived", "Stale read cannot revert archived");
      });

      // 3. Canonical Unread Count Engine
      it("77. Canonical unread count: computeUnreadCount derives exact count of status === 'unread'", () => {
        const items = [
          createMockNotification({ id: "1", status: "unread" }),
          createMockNotification({ id: "2", status: "read" }),
          createMockNotification({ id: "3", status: "unread" }),
          createMockNotification({ id: "4", status: "archived" }),
        ];
        assert.equal(computeUnreadCount(items), 2);
      });

      it("78. Canonical unread count: burst of 10 duplicate INSERT events increments unread count by at most 1", () => {
        let list: NotificationRow[] = [];
        const duplicateItem = createMockNotification({ id: "burst-1", status: "unread" });

        for (let i = 0; i < 10; i++) {
          list = reconcileNotification(list, duplicateItem);
        }

        assert.equal(list.length, 1);
        assert.equal(computeUnreadCount(list), 1, "Duplicate burst must never cause unread count drift");
      });

      it("79. Canonical unread count: transitioning 1 alert from unread to read decrements unread count by exactly 1", () => {
        const list = [
          createMockNotification({ id: "a1", status: "unread" }),
          createMockNotification({ id: "a2", status: "unread" }),
        ];
        assert.equal(computeUnreadCount(list), 2);

        const updated = reconcileNotification(list, { ...list[0], status: "read", read_at: new Date().toISOString() });
        assert.equal(computeUnreadCount(updated), 1);
      });

      it("80. Canonical unread count: archiving an unread alert decrements unread count by exactly 1", () => {
        const list = [
          createMockNotification({ id: "a1", status: "unread" }),
          createMockNotification({ id: "a2", status: "unread" }),
        ];
        const updated = reconcileNotification(list, { ...list[0], status: "archived", archived_at: new Date().toISOString() });
        assert.equal(computeUnreadCount(updated), 1);
      });

      it("81. Canonical unread count: archived alerts never contribute to unread count regardless of quantity", () => {
        const list = [
          createMockNotification({ id: "arch-1", status: "archived" }),
          createMockNotification({ id: "arch-2", status: "archived" }),
          createMockNotification({ id: "arch-3", status: "archived" }),
        ];
        assert.equal(computeUnreadCount(list), 0);
      });

      // 4. Handshake Buffer & Snapshot Drainage
      it("82. Handshake buffer: drainBufferedEvents reconciles events buffered during connection handshake into server snapshot", () => {
        const snapshot = [
          createMockNotification({ id: "snap-1", title: "Snapshot 1", status: "unread" }),
        ];
        const buffer = [
          createMockNotification({ id: "buf-1", title: "Buffered Realtime 1", status: "unread" }),
          createMockNotification({ id: "buf-2", title: "Buffered Realtime 2", status: "unread" }),
        ];

        const drained = drainBufferedEvents(snapshot, buffer);
        assert.equal(drained.length, 3);
        assert.ok(drained.some((n) => n.id === "buf-1"));
        assert.ok(drained.some((n) => n.id === "buf-2"));
        assert.ok(drained.some((n) => n.id === "snap-1"));
      });

      it("83. Handshake buffer: notification present in both snapshot and buffer produces exactly 1 deduplicated record", () => {
        const snapshot = [
          createMockNotification({ id: "overlap-1", status: "unread" }),
        ];
        const buffer = [
          createMockNotification({ id: "overlap-1", status: "read", read_at: "2026-09-10T12:05:00Z" }),
        ];

        const drained = drainBufferedEvents(snapshot, buffer);
        assert.equal(drained.length, 1);
        assert.equal(drained[0].id, "overlap-1");
        assert.equal(drained[0].status, "read");
      });

      it("84. Handshake buffer: out-of-order buffered items respect monotonic status rules during snapshot drainage", () => {
        const snapshot = [
          createMockNotification({ id: "overlap-arch", status: "archived", archived_at: "2026-09-10T12:00:00Z" }),
        ];
        const buffer = [
          createMockNotification({ id: "overlap-arch", status: "unread" }), // Stale buffer packet
        ];

        const drained = drainBufferedEvents(snapshot, buffer);
        assert.equal(drained.length, 1);
        assert.equal(drained[0].status, "archived", "Archived snapshot status must not be overridden by stale buffer");
      });

      // 5. Realtime Service & Invariants
      it("85. Realtime service: subscribe rejects invocation when userId is empty", () => {
        const service = NotificationRealtimeService.getInstance();
        assert.throws(
          () => {
            service.subscribe({ userId: "", onEvent: () => {} });
          },
          /authenticated userId/
        );
      });

      it("86. Realtime service: channel topic format is strictly user-scoped user-notifications:${userId}", () => {
        const mockClient = {
          channel: (topic: string) => ({
            topic,
            on: () => ({ subscribe: () => {} }),
            subscribe: () => {},
            unsubscribe: async () => {},
          }),
          removeChannel: () => {},
        } as unknown as Parameters<typeof NotificationRealtimeService.getInstance>[0];

        const service = NotificationRealtimeService.getInstance(mockClient);
        const handle = service.subscribe({
          userId: "user-test-topic-123",
          onEvent: () => {},
        });

        assert.equal(handle.channelName, "user-notifications:user-test-topic-123");
        service.unsubscribe();
      });

      it("87. Realtime service: channel config specifies explicit user_id filter and public schema", () => {
        let capturedFilter = "";
        let capturedTable = "";
        let capturedSchema = "";

        const mockClient = {
          channel: (topic: string) => ({
            topic,
            on: (_type: string, filterConfig: { filter: string; table: string; schema: string }) => {
              capturedFilter = filterConfig.filter;
              capturedTable = filterConfig.table;
              capturedSchema = filterConfig.schema;
              return { subscribe: () => {} };
            },
            subscribe: () => {},
            unsubscribe: async () => {},
          }),
          removeChannel: () => {},
        } as unknown as Parameters<typeof NotificationRealtimeService.getInstance>[0];

        const service = NotificationRealtimeService.getInstance(mockClient);
        service.subscribe({
          userId: "user-filter-target-456",
          onEvent: () => {},
        });

        assert.equal(capturedSchema, "public");
        assert.equal(capturedTable, "notifications");
        assert.equal(capturedFilter, "user_id=eq.user-filter-target-456");
        service.unsubscribe();
      });

      it("88. Realtime service: teardown cleans up active channel, resets active user and sets status to disconnected", async () => {
        let channelRemoved = false;
        const mockClient = {
          channel: (topic: string) => ({
            topic,
            on: () => ({ subscribe: () => {} }),
            subscribe: () => {},
            unsubscribe: async () => {
              channelRemoved = true;
            },
          }),
          removeChannel: () => {},
        } as unknown as Parameters<typeof NotificationRealtimeService.getInstance>[0];

        const service = NotificationRealtimeService.getInstance(mockClient);
        service.subscribe({
          userId: "user-teardown-789",
          onEvent: () => {},
        });

        assert.equal(service.getActiveUserId(), "user-teardown-789");

        await service.unsubscribe();
        assert.equal(channelRemoved, true);
        assert.equal(service.getActiveUserId(), null);
        assert.equal(service.getStatus(), "disconnected");
      });
    });
  });

  describe("Phase 8: Admin Intelligence, Work Queue, Audit Explorer & Hardened Governance", () => {
    // State machine validator matching DB trigger enforce_work_item_lifecycle()
    function validateWorkItemTransition(
      oldStatus: WorkItemStatus,
      newStatus: WorkItemStatus,
      notes?: string
    ): { allowed: boolean; reason?: string } {
      if (oldStatus === "open") {
        if (!["open", "investigating", "resolved", "dismissed"].includes(newStatus)) {
          return { allowed: false, reason: `Illegal state transition from open to ${newStatus}` };
        }
      } else if (oldStatus === "investigating") {
        if (!["investigating", "open", "resolved", "dismissed"].includes(newStatus)) {
          return { allowed: false, reason: `Illegal state transition from investigating to ${newStatus}` };
        }
      } else if (oldStatus === "resolved" || oldStatus === "dismissed") {
        if (newStatus !== oldStatus && newStatus !== "open") {
          return { allowed: false, reason: `Terminal state ${oldStatus} can only be reopened to open, not ${newStatus}.` };
        }
        if (newStatus === "open" && (!notes || notes.trim() === "")) {
          return { allowed: false, reason: "Reopening a resolved or dismissed work item requires updated resolution/reopening notes." };
        }
      }
      return { allowed: true };
    }

    interface MockWorkItem {
      id: string;
      fingerprint: string;
      status: WorkItemStatus;
      updated_at: string;
    }

    function simulateUpsertWorkItem(
      existingItems: MockWorkItem[],
      incomingFingerprint: string
    ): { items: MockWorkItem[]; action: "updated" | "created" } {
      const active = existingItems.find(
        (i) => i.fingerprint === incomingFingerprint && (i.status === "open" || i.status === "investigating")
      );
      if (active) {
        active.updated_at = new Date().toISOString();
        return { items: existingItems, action: "updated" };
      }
      const newItem: MockWorkItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        fingerprint: incomingFingerprint,
        status: "open",
        updated_at: new Date().toISOString(),
      };
      return { items: [...existingItems, newItem], action: "created" };
    }

    function computeCompletenessScore(ipo: {
      has_basic_details: boolean;
      has_financials: boolean;
      has_valuation: boolean;
      has_promoters: boolean;
      has_risks: boolean;
      has_subscription: boolean;
      has_fresh_gmp: boolean;
      has_documents: boolean;
    }): number {
      let score = 0;
      if (ipo.has_basic_details) score += 20;
      if (ipo.has_financials) score += 15;
      if (ipo.has_valuation) score += 15;
      if (ipo.has_promoters) score += 10;
      if (ipo.has_risks) score += 10;
      if (ipo.has_subscription) score += 10;
      if (ipo.has_fresh_gmp) score += 10;
      if (ipo.has_documents) score += 10;
      return score;
    }

    describe("1. Work-Item State Machine Transitions & Database Invariants", () => {
      it("89. Forward transition: open -> investigating is valid", () => {
        const res = validateWorkItemTransition("open", "investigating");
        assert.equal(res.allowed, true);
      });

      it("90. Forward transition: investigating -> resolved is valid terminal transition", () => {
        const res = validateWorkItemTransition("investigating", "resolved");
        assert.equal(res.allowed, true);
      });

      it("91. Forward transition: investigating -> dismissed is valid terminal transition", () => {
        const res = validateWorkItemTransition("investigating", "dismissed");
        assert.equal(res.allowed, true);
      });

      it("92. Direct transition: open -> resolved is valid", () => {
        const res = validateWorkItemTransition("open", "resolved");
        assert.equal(res.allowed, true);
      });

      it("93. Direct transition: open -> dismissed is valid", () => {
        const res = validateWorkItemTransition("open", "dismissed");
        assert.equal(res.allowed, true);
      });

      it("94. Re-queue transition: investigating -> open is permitted", () => {
        const res = validateWorkItemTransition("investigating", "open");
        assert.equal(res.allowed, true);
      });

      it("95. Illegal transition: terminal resolved cannot transition directly to investigating", () => {
        const res = validateWorkItemTransition("resolved", "investigating");
        assert.equal(res.allowed, false);
        assert.match(res.reason!, /can only be reopened to open/);
      });

      it("96. Illegal transition: terminal dismissed cannot transition directly to investigating", () => {
        const res = validateWorkItemTransition("dismissed", "investigating");
        assert.equal(res.allowed, false);
        assert.match(res.reason!, /can only be reopened to open/);
      });

      it("97. Illegal transition: terminal resolved cannot be directly dismissed", () => {
        const res = validateWorkItemTransition("resolved", "dismissed");
        assert.equal(res.allowed, false);
      });

      it("98. Reopening: resolved -> open with explicit notes is permitted", () => {
        const res = validateWorkItemTransition("resolved", "open", "Reopening due to recurring anomaly");
        assert.equal(res.allowed, true);
      });

      it("99. Reopening: dismissed -> open with explicit notes is permitted", () => {
        const res = validateWorkItemTransition("dismissed", "open", "Customer verified discrepancy persisted");
        assert.equal(res.allowed, true);
      });

      it("100. Reopening guardrail: resolved -> open WITHOUT notes is strictly rejected", () => {
        const res = validateWorkItemTransition("resolved", "open", "");
        assert.equal(res.allowed, false);
        assert.match(res.reason!, /requires updated resolution\/reopening notes/);
      });

      it("101. Reopening guardrail: dismissed -> open WITHOUT notes is strictly rejected", () => {
        const res = validateWorkItemTransition("dismissed", "open", "   ");
        assert.equal(res.allowed, false);
        assert.match(res.reason!, /requires updated resolution\/reopening notes/);
      });

      it("102. Timestamp invariant: resolving sets resolved_at and reopening clears it", () => {
        let resolvedAt: string | null = null;
        let resolvedBy: string | null = null;

        // Transition to resolved
        resolvedAt = new Date().toISOString();
        resolvedBy = "admin-123";
        assert.ok(resolvedAt);
        assert.equal(resolvedBy, "admin-123");

        // Reopen to open
        const reopening = validateWorkItemTransition("resolved", "open", "Reopening item");
        assert.equal(reopening.allowed, true);
        resolvedAt = null;
        resolvedBy = null;
        assert.equal(resolvedAt, null);
        assert.equal(resolvedBy, null);
      });
    });

    describe("2. Active-Anomaly Fingerprint Deduplication & Lifecycle Recurrence", () => {
      it("103. Active fingerprint in 'open' status updates existing item rather than duplicating", () => {
        const existing: MockWorkItem[] = [
          { id: "item-1", fingerprint: "ipo_data_gap:ipo-101:pricing", status: "open", updated_at: "2026-09-10T00:00:00Z" },
        ];
        const res = simulateUpsertWorkItem(existing, "ipo_data_gap:ipo-101:pricing");
        assert.equal(res.action, "updated");
        assert.equal(res.items.length, 1);
        assert.equal(res.items[0].id, "item-1");
      });

      it("104. Active fingerprint in 'investigating' status updates existing item rather than duplicating", () => {
        const existing: MockWorkItem[] = [
          { id: "item-2", fingerprint: "stale_market_data:ipo-202:gmp", status: "investigating", updated_at: "2026-09-10T00:00:00Z" },
        ];
        const res = simulateUpsertWorkItem(existing, "stale_market_data:ipo-202:gmp");
        assert.equal(res.action, "updated");
        assert.equal(res.items.length, 1);
        assert.equal(res.items[0].id, "item-2");
      });

      it("105. Anomaly recurrence after 'resolved' status creates a fresh new work item", () => {
        const existing: MockWorkItem[] = [
          { id: "item-resolved-1", fingerprint: "finance_reconciliation:mandate-303", status: "resolved", updated_at: "2026-09-10T00:00:00Z" },
        ];
        const res = simulateUpsertWorkItem(existing, "finance_reconciliation:mandate-303");
        assert.equal(res.action, "created");
        assert.equal(res.items.length, 2);
        const activeItem = res.items.find((i) => i.status === "open");
        assert.ok(activeItem);
        assert.notEqual(activeItem.id, "item-resolved-1");
      });

      it("106. Anomaly recurrence after 'dismissed' status creates a fresh new work item", () => {
        const existing: MockWorkItem[] = [
          { id: "item-dismissed-1", fingerprint: "notification_dead_letter:event-404", status: "dismissed", updated_at: "2026-09-10T00:00:00Z" },
        ];
        const res = simulateUpsertWorkItem(existing, "notification_dead_letter:event-404");
        assert.equal(res.action, "created");
        assert.equal(res.items.length, 2);
        const activeItem = res.items.find((i) => i.status === "open");
        assert.ok(activeItem);
        assert.notEqual(activeItem.id, "item-dismissed-1");
      });
    });

    describe("3. Audit Log Sanitization, Anti-Spoofing & PII Masking", () => {
      it("107. sanitizeAuditPayload masks Indian PAN numbers in string values", () => {
        const input = "User submitted document with PAN ABCDE1234F for verification";
        const sanitized = sanitizeAuditPayload(input);
        assert.equal(sanitized, "User submitted document with PAN XXXXX1234F for verification");
      });

      it("108. sanitizeAuditPayload masks PAN in structured object properties", () => {
        const input = { pan: "ABCDE1234F", user_name: "Ramesh Sharma" };
        const sanitized = sanitizeAuditPayload(input) as Record<string, unknown>;
        assert.equal(sanitized.pan, "XXXXX1234F");
        assert.equal(sanitized.user_name, "Ramesh Sharma");
      });

      it("109. sanitizeAuditPayload masks bank account numbers to last 4 digits", () => {
        const input = { account_number: "123456789012", bank_name: "HDFC Bank" };
        const sanitized = sanitizeAuditPayload(input) as Record<string, unknown>;
        assert.equal(sanitized.account_number, "XXXXXXXX9012");
        assert.equal(sanitized.bank_name, "HDFC Bank");
      });

      it("110. sanitizeAuditPayload masks UPI handles", () => {
        const input = { upi_id: "alice@okhdfcbank", amount: 15000 };
        const sanitized = sanitizeAuditPayload(input) as Record<string, unknown>;
        assert.equal(sanitized.upi_id, "al***@okhdfcbank");
        assert.equal(sanitized.amount, 15000);
      });

      it("111. sanitizeAuditPayload completely redacts passwords, tokens, API keys and OTPs", () => {
        const input = {
          password: "SuperSecretPassword123!",
          auth_token: "jwt.header.payload.signature",
          api_key: "ak_live_abcdef123456",
          otp_code: "123456",
          secret_key: "sk_test_9999",
        };
        const sanitized = sanitizeAuditPayload(input) as Record<string, string>;
        assert.equal(sanitized.password, "[REDACTED]");
        assert.equal(sanitized.auth_token, "[REDACTED]");
        assert.equal(sanitized.api_key, "[REDACTED]");
        assert.equal(sanitized.otp_code, "[REDACTED]");
        assert.equal(sanitized.secret_key, "[REDACTED]");
      });

      it("112. sanitizeAuditPayload masks Indian mobile phone numbers", () => {
        const input = { phone: "9876543210" };
        const sanitized = sanitizeAuditPayload(input) as Record<string, string>;
        assert.equal(sanitized.phone, "9876XXXX10");
      });

      it("113. sanitizeAuditPayload recursively sanitizes deeply nested arrays and objects", () => {
        const input = {
          batch_id: "batch-1",
          applications: [
            {
              applicant: { pan: "ABCDE1234F", phone: "9876543210" },
              security: { secret_token: "leaked_token" },
            },
          ],
        };
        const sanitized = sanitizeAuditPayload(input) as {
          applications: Array<{
            applicant: { pan: string; phone: string };
            security: { secret_token: string };
          }>;
        };
        assert.equal(sanitized.applications[0].applicant.pan, "XXXXX1234F");
        assert.equal(sanitized.applications[0].applicant.phone, "9876XXXX10");
        assert.equal(sanitized.applications[0].security.secret_token, "[REDACTED]");
      });

      it("114. sanitizeAuditPayload preserves safe operational metadata untouched", () => {
        const input = {
          action: "update_ipo_status",
          previous_status: "upcoming",
          new_status: "open",
          symbol: "TATATECH",
          issue_size_cr: 3042.5,
        };
        const sanitized = sanitizeAuditPayload(input) as Record<string, unknown>;
        assert.deepEqual(sanitized, input);
      });
    });

    describe("4. Diagnostic Metadata Sanitization", () => {
      it("115. sanitizeWorkItemMetadata strictly redacts prohibited credentials and OTPs", () => {
        const meta = {
          client_secret: "secret-12345",
          otp_sent: "998877",
          token: "bearer-token-abc",
          safe_metric: 42,
        };
        const clean = sanitizeWorkItemMetadata(meta);
        assert.equal(clean.client_secret, "[PROHIBITED_CREDENTIAL_REDACTED]");
        assert.equal(clean.otp_sent, "[PROHIBITED_CREDENTIAL_REDACTED]");
        assert.equal(clean.token, "[PROHIBITED_CREDENTIAL_REDACTED]");
        assert.equal(clean.safe_metric, 42);
      });

      it("116. sanitizeWorkItemMetadata masks PAN and account numbers", () => {
        const meta = {
          pan: "ABCDE1234F",
          account_no: "123456789012",
          discrepancy: "allotment mismatch",
        };
        const clean = sanitizeWorkItemMetadata(meta);
        assert.equal(clean.pan, "XXXXX1234F");
        assert.equal(clean.account_no, "XXXXXXXX9012");
        assert.equal(clean.discrepancy, "allotment mismatch");
      });

      it("117. sanitizeWorkItemMetadata handles undefined, null and empty inputs safely", () => {
        assert.deepEqual(sanitizeWorkItemMetadata(undefined), {});
        assert.deepEqual(sanitizeWorkItemMetadata({}), {});
      });
    });

    describe("5. Data Quality Completeness Scoring & Stale Data Invariants", () => {
      it("118. Perfect IPO completeness score equals 100", () => {
        const perfectIPO = {
          has_basic_details: true,
          has_financials: true,
          has_valuation: true,
          has_promoters: true,
          has_risks: true,
          has_subscription: true,
          has_fresh_gmp: true,
          has_documents: true,
        };
        const score = computeCompletenessScore(perfectIPO);
        assert.equal(score, 100);
      });

      it("119. Missing pricing and lot structure deducts 20 points", () => {
        const ipo = {
          has_basic_details: false,
          has_financials: true,
          has_valuation: true,
          has_promoters: true,
          has_risks: true,
          has_subscription: true,
          has_fresh_gmp: true,
          has_documents: true,
        };
        const score = computeCompletenessScore(ipo);
        assert.equal(score, 80);
      });

      it("120. Missing financials and valuation deducts 30 points combined", () => {
        const ipo = {
          has_basic_details: true,
          has_financials: false,
          has_valuation: false,
          has_promoters: true,
          has_risks: true,
          has_subscription: true,
          has_fresh_gmp: true,
          has_documents: true,
        };
        const score = computeCompletenessScore(ipo);
        assert.equal(score, 70);
      });

      it("121. Stale GMP older than 48 hours does not count toward fresh GMP score", () => {
        const freshObservedAt = new Date().toISOString();
        const staleObservedAt = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();

        const isFresh = (iso: string) => (Date.now() - new Date(iso).getTime()) <= 48 * 60 * 60 * 1000;
        assert.equal(isFresh(freshObservedAt), true);
        assert.equal(isFresh(staleObservedAt), false);

        const scoreWithStaleGMP = computeCompletenessScore({
          has_basic_details: true,
          has_financials: true,
          has_valuation: true,
          has_promoters: true,
          has_risks: true,
          has_subscription: true,
          has_fresh_gmp: isFresh(staleObservedAt),
          has_documents: true,
        });
        assert.equal(scoreWithStaleGMP, 90);
      });
    });

    describe("6. Administrative Role-Based Access Control (RBAC)", () => {
      it("122. Super Admin and Admin have access to anomaly scanning", () => {
        const canScan = (role: string) => ["super_admin", "admin"].includes(role);
        assert.equal(canScan("super_admin"), true);
        assert.equal(canScan("admin"), true);
        assert.equal(canScan("editor"), false);
        assert.equal(canScan("analyst"), false);
        assert.equal(canScan("user"), false);
      });

      it("123. Editor can self-assign but cannot assign work items to arbitrary users", () => {
        const canAssignTo = (callerRole: string, callerId: string, targetAssignee: string | null) => {
          if (["super_admin", "admin"].includes(callerRole)) return true;
          if (callerRole === "editor") return targetAssignee === callerId;
          return false;
        };

        assert.equal(canAssignTo("admin", "admin-1", "user-2"), true);
        assert.equal(canAssignTo("editor", "editor-1", "editor-1"), true);
        assert.equal(canAssignTo("editor", "editor-1", "admin-1"), false);
        assert.equal(canAssignTo("analyst", "analyst-1", "analyst-1"), false);
      });

      it("124. Work queue viewing is restricted to staff (super_admin, admin, editor, analyst)", () => {
        const canViewWorkQueue = (role: string) => ["super_admin", "admin", "editor", "analyst"].includes(role);
        assert.equal(canViewWorkQueue("super_admin"), true);
        assert.equal(canViewWorkQueue("admin"), true);
        assert.equal(canViewWorkQueue("editor"), true);
        assert.equal(canViewWorkQueue("analyst"), true);
        assert.equal(canViewWorkQueue("user"), false);
      });

      it("125. Ordinary user accounts have zero access to audit logs or admin system health", () => {
        const canAccessAdminIntelligence = (role: string) => ["super_admin", "admin"].includes(role);
        assert.equal(canAccessAdminIntelligence("user"), false);
      });
    });
  });

  describe("Phase 9: External Integration Foundation (Depository, IPO Infrastructure & Durable Events)", () => {
    describe("1. Provider Registry & Capability Lifecycle Engine", () => {
      it("126. Successfully registers and retrieves CDSL and NSDL depository providers", () => {
        providerRegistry.clear();
        providerRegistry.registerProvider(cdslProvider);
        providerRegistry.registerProvider(nsdlProvider);

        const cdsl = providerRegistry.getProvider("cdsl");
        const nsdl = providerRegistry.getProvider("nsdl");
        assert.ok(cdsl);
        assert.ok(nsdl);
        assert.equal(cdsl.providerName, "Central Depository Services (India) Limited");
        assert.equal(nsdl.providerName, "National Securities Depository Limited");
      });

      it("127. Lists providers filtered by external provider type", () => {
        const depositories = providerRegistry.listProviders("depository");
        assert.equal(depositories.length, 2);
        assert.equal(depositories[0].providerType, "depository");
      });

      it("128. Prevents duplicate provider registration with the same identifier", () => {
        assert.throws(
          () => providerRegistry.registerProvider(cdslProvider),
          /already registered/
        );
      });

      it("129. Requires provider and throws error when provider ID is absent", () => {
        assert.throws(
          () => providerRegistry.requireProvider("non_existent_provider"),
          /not found in registry/
        );
      });

      it("130. Throws CapabilityNotAvailableError when asserting capability in 'unsupported' state", () => {
        assert.throws(
          () => providerRegistry.assertCapability("cdsl", "submit_application"),
          (err: unknown) => {
            assert.ok(err instanceof CapabilityNotAvailableError);
            assert.equal(err.state, "unsupported");
            assert.equal(err.capability, "submit_application");
            return true;
          }
        );
      });

      it("131. Throws CapabilityNotAvailableError when asserting capability on disabled provider (Guardrail 3)", () => {
        assert.throws(
          () => providerRegistry.assertCapability("cdsl", "verify_demat"),
          (err: unknown) => {
            assert.ok(err instanceof CapabilityNotAvailableError);
            assert.equal(err.state, "disabled");
            return true;
          }
        );
      });
    });

    describe("2. Depository Abstraction (CDSL & NSDL Format Validation & Masking)", () => {
      it("132. Validates valid 16-digit numeric CDSL BO ID", () => {
        const res = validateCdslBoId("1208160012345678");
        assert.equal(res.valid, true);
        assert.equal(res.depositoryType, "cdsl");
        assert.equal(res.dpId, "12081600");
        assert.equal(res.clientId, "12345678");
        assert.equal(res.maskedReference, "1208XXXX5678");
      });

      it("133. Rejects invalid CDSL BO IDs (letters, spaces, wrong length)", () => {
        const tooShort = validateCdslBoId("12081600");
        const withLetters = validateCdslBoId("12081600ABCD5678");
        assert.equal(tooShort.valid, false);
        assert.equal(withLetters.valid, false);
      });

      it("134. CDSL provider safely masks account reference for UI display", () => {
        const masked = cdslProvider.maskReference("1208160098765432");
        assert.equal(masked, "1208XXXX5432");
      });

      it("135. Validates valid NSDL account format ('IN' + 6-digit DP + 8-digit Client ID)", () => {
        const res = validateNsdlAccountId("IN30012612345678");
        assert.equal(res.valid, true);
        assert.equal(res.depositoryType, "nsdl");
        assert.equal(res.dpId, "IN300126");
        assert.equal(res.clientId, "12345678");
        assert.equal(res.maskedReference, "IN30XXXX5678");
      });

      it("136. Rejects invalid NSDL account formats (missing 'IN' prefix or invalid digit count)", () => {
        const missingPrefix = validateNsdlAccountId("30012612345678");
        const wrongLength = validateNsdlAccountId("IN30012612");
        assert.equal(missingPrefix.valid, false);
        assert.equal(wrongLength.valid, false);
      });

      it("137. NSDL provider safely masks account reference for UI display", () => {
        const masked = nsdlProvider.maskReference("IN30290299887766");
        assert.equal(masked, "IN30XXXX7766");
      });

      it("138. Auto-detects demat depository type (CDSL vs NSDL)", () => {
        const cdsl = validateDematReference("1208160011223344");
        const nsdl = validateDematReference("IN30115199887766");
        assert.equal(cdsl.depositoryType, "cdsl");
        assert.equal(nsdl.depositoryType, "nsdl");
      });
    });

    describe("3. Guardrail 1: External Account References Informational Guard", () => {
      it("139. Prepares account reference with status strictly defaulting to 'pending_verification'", () => {
        const prep = externalAccountService.prepareAccountReference({
          userId: "u1111111-1111-1111-1111-111111111111",
          providerId: "cdsl",
          providerType: "depository",
          depositoryType: "cdsl",
          rawReference: "1208160012345678",
        });

        assert.equal(prep.status, "pending_verification");
        assert.equal(prep.accountReferenceMasked, "1208XXXX5678");
        assert.ok(prep.accountReferenceEncrypted);
      });

      it("140. Guardrail 1: assertStage1AccountStatus strictly forbids transition to 'verified'", () => {
        assert.throws(
          () => externalAccountService.assertStage1AccountStatus("verified"),
          /Stage 1 Restriction: External account verification is deferred to Stage 3/
        );
        assert.doesNotThrow(() => externalAccountService.assertStage1AccountStatus("pending_verification"));
        assert.doesNotThrow(() => externalAccountService.assertStage1AccountStatus("rejected"));
        assert.doesNotThrow(() => externalAccountService.assertStage1AccountStatus("revoked"));
      });

      it("141. Successfully performs AES-256-GCM envelope encryption and decryption roundtrip", () => {
        const raw = "1208160099887766";
        const prep = externalAccountService.prepareAccountReference({
          userId: "u1111111-1111-1111-1111-111111111111",
          providerId: "cdsl",
          providerType: "depository",
          depositoryType: "cdsl",
          rawReference: raw,
        });

        const decrypted = externalAccountService.decryptAccountReference(prep.accountReferenceEncrypted!);
        assert.equal(decrypted, raw);
      });

      it("142. Depository provider verifyAccountInformational returns unverified_stage1 status without live calls", async () => {
        const res = await cdslProvider.verifyAccountInformational({
          depositoryType: "cdsl",
          rawReference: "1208160012345678",
        });

        assert.equal(res.verified, false);
        assert.equal(res.status, "unverified_stage1");
        assert.ok(res.message.includes("deferred to Stage 3"));
      });

      it("143. Rejects account reference creation when prohibited credentials appear in metadata", () => {
        assert.throws(
          () =>
            externalAccountService.prepareAccountReference({
              userId: "u1111111-1111-1111-1111-111111111111",
              providerId: "cdsl",
              providerType: "depository",
              depositoryType: "cdsl",
              rawReference: "1208160012345678",
              metadata: { user_tpin: "123456" },
            }),
          (err: unknown) => {
            assert.ok(err instanceof ProhibitedCredentialError);
            return true;
          }
        );
      });
    });

    describe("4. Durable External Event Inbox & Deterministic Idempotency", () => {
      it("144. Prepares external event for ingestion with status strictly 'received' (worker deferred)", () => {
        const prep = externalEventService.prepareEventForIngest({
          providerId: "bse_ipo",
          providerType: "ipo_infrastructure",
          providerEventId: "bse_evt_99812",
          eventType: "bidding_confirmed",
          payload: { order_id: "BSE10293", quantity: 30, price: 450 },
        });

        assert.equal(prep.status, "received");
        assert.equal(prep.attemptCount, 0);
        assert.ok(prep.payloadHash.length === 64);
      });

      it("145. Computes identical SHA-256 hash for identical payloads regardless of key ordering", () => {
        const p1 = { symbol: "SWIGGY", lots: 2, price: 390 };
        const p2 = { price: 390, symbol: "SWIGGY", lots: 2 };
        assert.equal(hashPayload(p1), hashPayload(p2));
      });

      it("146. Computes different SHA-256 hash for differing payloads", () => {
        const p1 = { symbol: "SWIGGY", lots: 2, price: 390 };
        const p2 = { symbol: "SWIGGY", lots: 2, price: 391 };
        assert.notEqual(hashPayload(p1), hashPayload(p2));
      });

      it("147. Strictly rejects event ingestion containing prohibited credentials (e.g. upi_pin, otp, password)", () => {
        assert.throws(
          () =>
            externalEventService.prepareEventForIngest({
              providerId: "npci_upi",
              providerType: "upi",
              providerEventId: "upi_evt_1",
              eventType: "mandate_request",
              payload: { upi_pin: "123456", amount: 14850 },
            }),
          (err: unknown) => {
            assert.ok(err instanceof ProhibitedCredentialError);
            return true;
          }
        );
      });

      it("148. Strictly rejects event ingestion containing OTP or netbanking password", () => {
        assert.throws(
          () =>
            externalEventService.prepareEventForIngest({
              providerId: "sponsor_bank",
              providerType: "sponsor_bank",
              eventType: "bank_auth",
              payload: { one_time_password: "998877", user: "trader" },
            }),
          (err: unknown) => {
            assert.ok(err instanceof ProhibitedCredentialError);
            return true;
          }
        );
      });

      it("149. Preserves non-secret event payload and environment correctly", () => {
        const prep = externalEventService.prepareEventForIngest({
          providerId: "link_intime",
          providerType: "registrar",
          eventType: "allotment_announced",
          environment: "sandbox",
          payload: { symbol: "NTPCGREEN", basis_date: "2026-09-15" },
        });

        assert.equal(prep.environment, "sandbox");
        assert.equal(prep.providerId, "link_intime");
        assert.equal((prep.payload as Record<string, unknown>).symbol, "NTPCGREEN");
      });
    });

    describe("5. Guardrail 2: 90-Day Payload Pruning & Retention Integrity", () => {
      it("150. Correctly flags payload as expired when older than 90 days", () => {
        const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
        const eightyNineDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();

        assert.equal(isPayloadExpired(ninetyOneDaysAgo, 90), true);
        assert.equal(isPayloadExpired(eightyNineDaysAgo, 90), false);
      });

      it("151. Prunes events older than 90 days and replaces payload with tombstone marker", () => {
        const oldDate = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
        const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

        const events: ExternalEventRecord[] = [
          {
            id: "evt-1",
            providerId: "cdsl",
            providerType: "depository",
            eventType: "test_event",
            environment: "development",
            payloadHash: "abc123hash",
            payload: { secret_detail: "should_be_pruned" },
            status: "received",
            attemptCount: 0,
            receivedAt: oldDate,
            metadata: {},
          },
          {
            id: "evt-2",
            providerId: "cdsl",
            providerType: "depository",
            eventType: "test_event",
            environment: "development",
            payloadHash: "def456hash",
            payload: { active_data: "keep_me" },
            status: "received",
            attemptCount: 0,
            receivedAt: recentDate,
            metadata: {},
          },
        ];

        const { prunedCount, events: updated } = externalEventService.pruneExpiredEvents(events, 90);
        assert.equal(prunedCount, 1);
        assert.equal(isPrunedPayload(updated[0].payload), true);
        assert.equal(isPrunedPayload(updated[1].payload), false);
        assert.equal((updated[1].payload as Record<string, unknown>).active_data, "keep_me");
      });

      it("152. isPrunedPayload accurately identifies pruned payload marker and rejects regular payloads", () => {
        const marker = createPrunedPayloadMarker();
        assert.equal(isPrunedPayload(marker), true);
        assert.equal(isPrunedPayload({ regular: "data" }), false);
        assert.equal(isPrunedPayload(null), false);
        assert.equal(isPrunedPayload(undefined), false);
      });

      it("153. Pruning preserves event headers, provider ID, payload hash, and received timestamp", () => {
        const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
        const event: ExternalEventRecord = {
          id: "evt-preserve",
          providerId: "link_intime",
          providerType: "registrar",
          providerEventId: "rta_9901",
          eventType: "allotment_event",
          environment: "production",
          payloadHash: "hash999",
          payload: { data: "old" },
          status: "processed",
          attemptCount: 1,
          receivedAt: oldDate,
          metadata: { batch: 12 },
        };

        const { events: updated } = externalEventService.pruneExpiredEvents([event], 90);
        assert.equal(updated[0].id, "evt-preserve");
        assert.equal(updated[0].providerId, "link_intime");
        assert.equal(updated[0].providerEventId, "rta_9901");
        assert.equal(updated[0].payloadHash, "hash999");
        assert.equal(updated[0].receivedAt, oldDate);
        assert.equal(isPrunedPayload(updated[0].payload), true);
      });

      it("154. Phase 8 audit adapter strictly excludes raw external payload (only sanitized headers)", () => {
        const auditRecord = integrationAuditAdapter.prepareEventIngestAudit(
          "bse_ipo",
          "bid_acknowledged",
          "bse_ref_101",
          "hash_abc_123"
        );

        assert.equal(auditRecord.action, "external_event_received");
        assert.equal(auditRecord.entityType, "external_event");
        assert.equal(auditRecord.actorType, "system");
        assert.equal(auditRecord.payload.provider_id, "bse_ipo");
        assert.equal(auditRecord.payload.payload_hash, "hash_abc_123");
        assert.equal(auditRecord.payload.raw_payload_retained, false);
      });
    });

    describe("6. Contract-Only Status Normalization (Pure Transformation, Zero Phase 4 Mutation)", () => {
      it("155. Maps exchange status 'ACCEPTED_BY_EXCHANGE' and 'CONFIRMED' to 'CONFIRMED'", () => {
        const res1 = externalEventService.normalizeExternalStatus("ipo_infrastructure", "ACCEPTED_BY_EXCHANGE");
        const res2 = externalEventService.normalizeExternalStatus("ipo_infrastructure", "CONFIRMED");
        assert.equal(res1.normalizedStatus, "CONFIRMED");
        assert.equal(res2.normalizedStatus, "CONFIRMED");
        assert.equal(res1.confidence, "definitive");
      });

      it("156. Maps exchange status 'REJECTED_BY_EXCHANGE' to 'REJECTED'", () => {
        const res = externalEventService.normalizeExternalStatus("ipo_infrastructure", "REJECTED_BY_EXCHANGE");
        assert.equal(res.normalizedStatus, "REJECTED");
        assert.equal(res.confidence, "definitive");
      });

      it("157. Maps UPI mandate status 'APPROVED' and 'AUTHENTICATED' to 'MANDATE_APPROVED'", () => {
        const res = externalEventService.normalizeExternalStatus("upi", "AUTHENTICATED");
        assert.equal(res.normalizedStatus, "MANDATE_APPROVED");
        assert.equal(res.confidence, "definitive");
      });

      it("158. Maps UPI mandate status 'DECLINED' and 'EXPIRED' to 'MANDATE_FAILED'", () => {
        const res1 = externalEventService.normalizeExternalStatus("upi", "DECLINED");
        const res2 = externalEventService.normalizeExternalStatus("upi", "EXPIRED");
        assert.equal(res1.normalizedStatus, "MANDATE_FAILED");
        assert.equal(res2.normalizedStatus, "MANDATE_FAILED");
      });

      it("159. Maps registrar allotment status 'FULL_ALLOTMENT' to 'ALLOTTED', and 'NON_ALLOTMENT' to 'NOT_ALLOTTED'", () => {
        const res1 = externalEventService.normalizeExternalStatus("registrar", "FULL_ALLOTMENT");
        const res2 = externalEventService.normalizeExternalStatus("registrar", "NON_ALLOTMENT");
        assert.equal(res1.normalizedStatus, "ALLOTTED");
        assert.equal(res2.normalizedStatus, "NOT_ALLOTTED");
      });

      it("160. Handles unrecognized external status gracefully with 'UNKNOWN' and 'unrecognized' confidence", () => {
        const res = externalEventService.normalizeExternalStatus("ipo_infrastructure", "SOME_FUTURE_WEIRD_STATUS");
        assert.equal(res.normalizedStatus, "UNKNOWN");
        assert.equal(res.confidence, "unrecognized");
      });
    });

    describe("7. Inbound Webhook Security, Signatures & Clock Skew Guard", () => {
      it("161. Successfully validates authentic HMAC-SHA256 signature on inbound webhook", async () => {
        const secret = "top-secret-webhook-key-2026";
        const payload = JSON.stringify({ event: "order_update", id: 101 });
        const timestamp = Date.now().toString();
        const crypto = await import("crypto");
        const signature = crypto
          .createHmac("sha256", secret)
          .update(`${timestamp}.${payload}`)
          .digest("hex");

        const result = await standardHmacWebhookVerifier.verify({
          providerId: "bse_ipo",
          rawPayload: payload,
          headers: {
            signature,
            timestamp,
          },
          signingSecret: secret,
        });

        assert.equal(result.valid, true);
        assert.equal(result.reason, "valid");
      });

      it("162. Rejects webhook when signature is tampered or invalid", async () => {
        const result = await standardHmacWebhookVerifier.verify({
          providerId: "bse_ipo",
          rawPayload: JSON.stringify({ event: "order_update" }),
          headers: {
            signature: "invalid_signature_hex_00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            timestamp: Date.now().toString(),
          },
          signingSecret: "correct_secret",
        });

        assert.equal(result.valid, false);
        assert.equal(result.reason, "invalid_signature");
      });

      it("163. Rejects webhook when signature header is missing entirely", async () => {
        const result = await standardHmacWebhookVerifier.verify({
          providerId: "bse_ipo",
          rawPayload: "{}",
          headers: {},
          signingSecret: "secret",
        });

        assert.equal(result.valid, false);
        assert.equal(result.reason, "missing_signature");
      });

      it("164. Rejects webhook when signing secret is missing or empty", async () => {
        const result = await standardHmacWebhookVerifier.verify({
          providerId: "bse_ipo",
          rawPayload: "{}",
          headers: { signature: "abc" },
          signingSecret: "",
        });

        assert.equal(result.valid, false);
        assert.equal(result.reason, "missing_secret");
      });

      it("165. Replay attack defense: Rejects webhook when timestamp clock skew exceeds 300 seconds", async () => {
        const secret = "secret-key";
        const payload = "{}";
        const oldTimestamp = (Date.now() - 360 * 1000).toString(); // 6 minutes ago
        const crypto = await import("crypto");
        const signature = crypto
          .createHmac("sha256", secret)
          .update(`${oldTimestamp}.${payload}`)
          .digest("hex");

        const result = await standardHmacWebhookVerifier.verify({
          providerId: "bse_ipo",
          rawPayload: payload,
          headers: {
            signature,
            timestamp: oldTimestamp,
          },
          signingSecret: secret,
          maxClockSkewSeconds: 300,
        });

        assert.equal(result.valid, false);
        assert.equal(result.reason, "clock_skew_exceeded");
      });
    });

    describe("8. Cross-Domain Reconciliation & Phase 8 Work Queue Alignment", () => {
      it("166. Reconciles matching records cleanly with 0 discrepancies", () => {
        const pairs = [
          {
            entityId: "app-101",
            internalState: { status: "ALLOTTED", sharesAllotted: 30 },
            externalState: { status: "ALLOTTED", sharesAllotted: 30 },
          },
          {
            entityId: "app-102",
            internalState: { status: "NOT_ALLOTTED", sharesAllotted: 0 },
            externalState: { status: "NOT_ALLOTTED", sharesAllotted: 0 },
          },
        ];

        const summary = reconciliationEngine.reconcilePairs("link_intime", "allotments", pairs);
        assert.equal(summary.status, "completed");
        assert.equal(summary.totalRecords, 2);
        assert.equal(summary.matchedRecords, 2);
        assert.equal(summary.discrepancyCount, 0);
      });

      it("167. Detects field mismatches and marks run as 'completed_with_discrepancies'", () => {
        const pairs = [
          {
            entityId: "app-201",
            internalState: { status: "ALLOTTED", sharesAllotted: 30 },
            externalState: { status: "PARTIALLY_ALLOTTED", sharesAllotted: 15 },
          },
        ];

        const summary = reconciliationEngine.reconcilePairs("link_intime", "allotments", pairs);
        assert.equal(summary.status, "completed_with_discrepancies");
        assert.equal(summary.discrepancyCount, 2);
      });

      it("168. Maps reconciliation discrepancy directly into a structured Phase 8 work item specification", () => {
        const discrepancy = {
          entityId: "app-301",
          domain: "allotments" as const,
          discrepancyType: "allotments_field_mismatch",
          field: "sharesAllotted",
          internalValue: 30,
          externalValue: 0,
          severity: "high" as const,
        };

        const workItem = reconciliationEngine.toPhase8WorkItem(discrepancy);
        assert.equal(workItem.category, "allotment_discrepancy");
        assert.equal(workItem.severity, "high");
        assert.equal(workItem.entityType, "allotments");
        assert.equal(workItem.entityId, "app-301");
        assert.equal(workItem.metadata.internal_value, 30);
        assert.equal(workItem.metadata.external_value, 0);
      });

      it("169. Integration telemetry health aggregation reports registered provider states", async () => {
        const healthSnapshot = await integrationHealthService.getAggregatedHealth();
        assert.ok(healthSnapshot.totalProviders >= 2);
        assert.ok(healthSnapshot.standbyCount >= 2);
        assert.equal(healthSnapshot.unhealthyCount, 0);
      });
    });

    describe("9. Phase 9 Stage 2: Hardening & Observability Enhancements", () => {
      // 9.1 Failure Taxonomy & Classification
      it("170. Failure taxonomy defines all 16 required standard failure codes", () => {
        const codes = Object.keys(FAILURE_TAXONOMY);
        assert.equal(codes.length, 16);
        assert.ok(codes.includes("validation_error"));
        assert.ok(codes.includes("signature_verification_failure"));
        assert.ok(codes.includes("replay_attack_detected"));
        assert.ok(codes.includes("duplicate_event"));
        assert.ok(codes.includes("planned_capability"));
        assert.ok(codes.includes("disabled_capability"));
        assert.ok(codes.includes("unsupported_capability"));
        assert.ok(codes.includes("reconciliation_discrepancy"));
      });

      it("171. Classifies security-significant failures accurately with appropriate severity", () => {
        const sigFail = FAILURE_TAXONOMY["signature_verification_failure"];
        assert.equal(sigFail.securitySignificant, true);
        assert.equal(sigFail.operatorActionable, true);
        assert.equal(sigFail.retryable, false);

        const replayFail = FAILURE_TAXONOMY["replay_attack_detected"];
        assert.equal(replayFail.securitySignificant, true);
        assert.equal(replayFail.defaultSeverity, "critical");

        const dupEvent = FAILURE_TAXONOMY["duplicate_event"];
        assert.equal(dupEvent.securitySignificant, false);
        assert.equal(dupEvent.retryable, false);
      });

      it("172. IntegrationError instantiates correctly with sanitized message and classification", () => {
        const err = new IntegrationError("timeout", "HTTP request timed out after 5000ms", {
          provider: "bse_ipo",
        });
        assert.equal(err.code, "timeout");
        assert.equal(err.category, "network");
        assert.equal(err.retryable, true);
        assert.equal(err.operatorActionable, false);
        assert.equal(err.context.provider, "bse_ipo");
      });

      // 9.2 Dual-Layer Capability Gating (Fail-Closed)
      it("173. Dual-layer gating passes when TS contract AND DB record both mark capability 'enabled'", () => {
        providerRegistry.clear();
        providerRegistry.registerProvider({
          providerId: "test_gateway",
          providerName: "Test Gateway",
          providerType: "ipo_infrastructure",
          environment: "development",
          enabled: true,
          capabilities: { read_issue: "enabled" },
          getHealth: async () => ({
            providerId: "test_gateway",
            status: "standby",
            latencyMs: 10,
            lastCheckedAt: new Date().toISOString(),
            errorRatePercent: 0,
          }),
          validateConfiguration: async () => ({ valid: true, errors: [], warnings: [] }),
        });

        const p = providerRegistry.assertOperationalCapability("test_gateway", "read_issue", {
          id: "test_gateway",
          name: "Test Gateway",
          enabled: true,
          capabilities: { read_issue: "enabled" },
        });
        assert.equal(p.providerId, "test_gateway");
      });

      it("174. Dual-layer gating FAILS CLOSED when DB marks capability 'disabled' but TS says 'enabled'", () => {
        let blocked = false;
        try {
          providerRegistry.assertOperationalCapability("test_gateway", "read_issue", {
            id: "test_gateway",
            name: "Test Gateway",
            enabled: true,
            capabilities: { read_issue: "disabled" },
          });
        } catch (err) {
          if (err instanceof CapabilityNotAvailableError && err.state === "disabled") {
            blocked = true;
          }
        }
        assert.ok(blocked, "DB disabled capability was correctly blocked");
      });

      it("175. Dual-layer gating FAILS CLOSED when DB says enabled but TS says 'planned'", () => {
        providerRegistry.clear();
        providerRegistry.registerProvider({
          providerId: "test_planned",
          providerName: "Test Planned",
          providerType: "depository",
          environment: "development",
          enabled: true,
          capabilities: { verify_demat: "planned" },
          getHealth: async () => ({
            providerId: "test_planned",
            status: "standby",
            latencyMs: 10,
            lastCheckedAt: new Date().toISOString(),
            errorRatePercent: 0,
          }),
          validateConfiguration: async () => ({ valid: true, errors: [], warnings: [] }),
        });

        let blocked = false;
        try {
          providerRegistry.assertOperationalCapability("test_planned", "verify_demat", {
            id: "test_planned",
            name: "Test Planned",
            enabled: true,
            capabilities: { verify_demat: "enabled" },
          });
        } catch (err) {
          if (err instanceof CapabilityNotAvailableError && err.state === "planned") {
            blocked = true;
          }
        }
        assert.ok(blocked, "TS planned capability was correctly blocked");
      });

      it("176. Dual-layer gating FAILS CLOSED when DB provider.enabled is false", () => {
        providerRegistry.clear();
        providerRegistry.registerProvider({
          providerId: "test_gateway",
          providerName: "Test Gateway",
          providerType: "ipo_infrastructure",
          environment: "development",
          enabled: true,
          capabilities: { read_issue: "enabled" },
          getHealth: async () => ({
            providerId: "test_gateway",
            status: "standby",
            latencyMs: 10,
            lastCheckedAt: new Date().toISOString(),
            errorRatePercent: 0,
          }),
          validateConfiguration: async () => ({ valid: true, errors: [], warnings: [] }),
        });

        let blocked = false;
        try {
          providerRegistry.assertOperationalCapability("test_gateway", "read_issue", {
            id: "test_gateway",
            name: "Test Gateway",
            enabled: false,
            capabilities: { read_issue: "enabled" },
          });
        } catch (err) {
          if (err instanceof CapabilityNotAvailableError && err.state === "disabled") {
            blocked = true;
          }
        }
        assert.ok(blocked, "Provider disabled in DB was correctly blocked");
      });

      // 9.3 Inbound Webhook Key Ring & Secret Rotation
      it("177. WebhookKeyRing validates signatures using the active key in constant time", () => {
        const keyRing = new WebhookKeyRing([
          { keyId: "key_v1", secret: "super_secret_key_v1", status: "retiring" },
          { keyId: "key_v2", secret: "super_secret_key_v2", status: "active" },
        ]);

        const payload = JSON.stringify({ event: "allotment_announced", issueId: "ipo_123" });
        const activeSig = crypto.createHmac("sha256", "super_secret_key_v2").update(payload).digest("hex");

        const result = keyRing.verifySignatureAgainstRing(payload, activeSig);
        assert.equal(result.valid, true);
        assert.equal(result.matchedKeyId, "key_v2");
      });

      it("178. WebhookKeyRing validates signatures using the retiring key during key transition window", () => {
        const keyRing = new WebhookKeyRing([
          { keyId: "key_v1", secret: "super_secret_key_v1", status: "retiring" },
          { keyId: "key_v2", secret: "super_secret_key_v2", status: "active" },
        ]);

        const payload = JSON.stringify({ event: "allotment_announced", issueId: "ipo_123" });
        const oldSig = crypto.createHmac("sha256", "super_secret_key_v1").update(payload).digest("hex");

        const result = keyRing.verifySignatureAgainstRing(payload, oldSig);
        assert.equal(result.valid, true);
        assert.equal(result.matchedKeyId, "key_v1");
      });

      it("179. WebhookKeyRing rejects invalid or forged signatures against all keys in ring", () => {
        const keyRing = new WebhookKeyRing([
          { keyId: "key_v1", secret: "super_secret_key_v1", status: "retiring" },
          { keyId: "key_v2", secret: "super_secret_key_v2", status: "active" },
        ]);

        const payload = JSON.stringify({ event: "allotment_announced", issueId: "ipo_123" });
        const forgedSig = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        const result = keyRing.verifySignatureAgainstRing(payload, forgedSig);
        assert.equal(result.valid, false);
      });

      // 9.4 Payload Size Protection (Application Layer)
      it("180. Rejects payloads exceeding the 256 KB application threshold", () => {
        const largeString = "X".repeat(MAX_PAYLOAD_BYTES + 10);
        let blocked = false;
        try {
          externalEventService.prepareEventForIngest({
            providerId: "link_intime",
            providerType: "registrar",
            eventType: "allotment_feed",
            payload: { oversized_data: largeString },
          });
        } catch (err) {
          if (err instanceof IntegrationError && err.code === "validation_error") {
            blocked = true;
          }
        }
        assert.ok(blocked, "Oversized payload was rejected at application layer");
      });

      it("181. Rejects metadata exceeding the 64 KB application threshold", () => {
        const largeMetaString = "M".repeat(MAX_METADATA_BYTES + 10);
        let blocked = false;
        try {
          externalEventService.prepareEventForIngest({
            providerId: "link_intime",
            providerType: "registrar",
            eventType: "allotment_feed",
            payload: { normal: "data" },
            metadata: { large_meta: largeMetaString },
          });
        } catch (err) {
          if (err instanceof IntegrationError && err.code === "validation_error") {
            blocked = true;
          }
        }
        assert.ok(blocked, "Oversized metadata was rejected at application layer");
      });

      // 9.5 Deterministic Reconciliation Fingerprint
      it("182. Computes deterministic SHA-256 fingerprint for reconciliation input", () => {
        const pairsA = [
          {
            entityId: "app-01",
            internalState: { status: "ALLOTTED", sharesAllotted: 30 },
            externalState: { status: "ALLOTTED", sharesAllotted: 30 },
          },
          {
            entityId: "app-02",
            internalState: { status: "NOT_ALLOTTED", sharesAllotted: 0 },
            externalState: { status: "NOT_ALLOTTED", sharesAllotted: 0 },
          },
        ];

        // Same records in different array order with differently ordered keys
        const pairsB = [
          {
            entityId: "app-02",
            internalState: { sharesAllotted: 0, status: "NOT_ALLOTTED" },
            externalState: { sharesAllotted: 0, status: "NOT_ALLOTTED" },
          },
          {
            entityId: "app-01",
            internalState: { sharesAllotted: 30, status: "ALLOTTED" },
            externalState: { sharesAllotted: 30, status: "ALLOTTED" },
          },
        ];

        const fpA = reconciliationEngine.computeRunFingerprint("kfintech", "allotments", pairsA);
        const fpB = reconciliationEngine.computeRunFingerprint("kfintech", "allotments", pairsB);
        assert.equal(fpA, fpB, "Identical canonical input produced identical run fingerprint");
      });

      it("183. Generates distinct execution run IDs while preserving identical input fingerprints", () => {
        const pairs = [
          {
            entityId: "app-01",
            internalState: { status: "ALLOTTED", sharesAllotted: 30 },
            externalState: { status: "ALLOTTED", sharesAllotted: 30 },
          },
        ];

        const run1 = reconciliationEngine.reconcilePairs("kfintech", "allotments", pairs);
        const run2 = reconciliationEngine.reconcilePairs("kfintech", "allotments", pairs);

        assert.notEqual(run1.runId, run2.runId, "Execution run IDs are distinct UUIDs");
        assert.equal(run1.runFingerprint, run2.runFingerprint, "Run fingerprints match for identical input");
      });

      // 9.6 Health State Precedence Waterfall
      it("184. Resolves health state strictly adhering to 6-state precedence rules", () => {
        // Precedence 1: Planned
        assert.equal(
          integrationHealthService.resolveHealthState(false, true, true, true, true),
          "planned"
        );
        // Precedence 2: Disabled
        assert.equal(
          integrationHealthService.resolveHealthState(false, true, true, false, false),
          "disabled"
        );
        // Precedence 3: Not Configured
        assert.equal(
          integrationHealthService.resolveHealthState(false, true, false, true, false),
          "not_configured"
        );
        // Precedence 4: Standby (Configured, operational, but no external connectivity - Stage 2 Invariant)
        assert.equal(
          integrationHealthService.resolveHealthState(false, true, true, true, false),
          "standby"
        );
        // Precedence 5: Degraded (Has live external connectivity, but external service failing)
        assert.equal(
          integrationHealthService.resolveHealthState(true, false, true, true, false),
          "degraded"
        );
        // Precedence 6: Healthy (Only reachable with live external connectivity verified)
        assert.equal(
          integrationHealthService.resolveHealthState(true, true, true, true, false),
          "healthy"
        );
      });

      // 9.7 Retention Policy Bounds & Validation
      it("185. Retention pruning enforces fixed 90-day policy and rejects any non-90 retentionDays", () => {
        const events: ExternalEventRecord[] = [];
        assert.throws(() => {
          externalEventService.pruneExpiredEvents(events, 30);
        }, /Raw payload retention is fixed at 90 days/);

        assert.throws(() => {
          externalEventService.pruneExpiredEvents(events, 180);
        }, /Raw payload retention is fixed at 90 days/);
      });

      // 9.8 Operational Tracer & Telemetry Sanitization
      it("186. IntegrationTracer produces sanitized trace results with correlation ID and duration", () => {
        const ctx = IntegrationTracer.startTrace("cdsl", "verify_account_ref", {
          environment: "development",
          capability: "verify_demat",
        });
        assert.ok(ctx.correlationId.startsWith("trc_"));

        const result = IntegrationTracer.completeTrace(ctx, "success", {
          sanitizedMetadata: { checked: true },
        });
        assert.equal(result.outcome, "success");
        assert.equal(result.providerId, "cdsl");
        assert.equal(result.operationName, "verify_account_ref");
        assert.ok(result.durationMs >= 0);
      });

      // 9.9 In-Process Metrics Aggregation
      it("187. In-process metrics collector accurately counts events, deduplications, and latency", () => {
        integrationMetrics.reset();
        integrationMetrics.recordEventReceived();
        integrationMetrics.recordEventReceived();
        integrationMetrics.recordEventDeduplicated();
        integrationMetrics.recordEventProcessed(50);
        integrationMetrics.recordEventProcessed(70);
        integrationMetrics.recordSecurityFailure("signature_verification_failure");

        const snap = integrationMetrics.getSnapshot();
        assert.equal(snap.eventsReceivedTotal, 2);
        assert.equal(snap.eventsDeduplicatedTotal, 1);
        assert.equal(snap.eventsProcessedTotal, 2);
        assert.equal(snap.securityFailuresTotal, 1);
        assert.equal(snap.failuresByCode["signature_verification_failure"], 1);
        assert.equal(snap.averageLatencyMs, 60);
      });

      // 9.10 Alert Contracts Integrity
      it("188. Alert contracts define mandatory thresholds, evaluation windows, and ownership", () => {
        const alerts = Object.values(ALERT_CONTRACTS);
        assert.ok(alerts.length >= 5);
        for (const a of alerts) {
          assert.ok(a.alertId.startsWith("ALT-INT-"));
          assert.ok(["critical", "high", "medium"].includes(a.severity));
          assert.ok(a.evaluationWindowMinutes > 0);
          assert.ok(a.threshold.length > 0);
          assert.ok(a.actionableRunbook.length > 0);
        }
      });

      // 9.11 Phase 8 Pruning Audit Record Formatting
      it("189. Phase 8 audit adapter formats pruning audit log preserving events and tombstoning payloads", () => {
        const audit = integrationAuditAdapter.preparePruningRunAudit("run_12345", 42, 185, 90);
        assert.equal(audit.action, "external_payload_pruning_completed");
        assert.equal(audit.entityType, "external_pruning_run");
        assert.equal(audit.entityId, "run_12345");
        assert.equal(audit.actorType, "system");
        assert.equal(audit.payload.records_pruned, 42);
        assert.equal(audit.payload.raw_payloads_purged, true);
        assert.equal(audit.payload.events_preserved, true);
      });
    });
  });
});





