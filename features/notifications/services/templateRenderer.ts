/**
 * features/notifications/services/templateRenderer.ts
 *
 * Pure in-memory notification template rendering engine.
 * Enforces minimal safe payloads, XSS HTML escaping, PII masking,
 * mandatory unofficial GMP disclaimers, and mandatory in-app flags.
 */

import { NotificationContent, NotificationCategory, NotificationPriority } from "../types/notification.types";
import { maskPAN, maskUPI } from "@/features/application/services/piiMasking";

export const MANDATORY_GMP_DISCLAIMER =
  "Unofficial grey-market indicator — not an exchange price or guaranteed listing price.";

/**
 * Escapes HTML characters to prevent XSS in rendered notifications.
 */
export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface RenderTemplateParams {
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Pure template renderer mapping typed minimal payloads to notification content.
 */
export function renderNotificationContent(params: RenderTemplateParams): NotificationContent {
  const { eventType, payload } = params;

  switch (eventType) {
    // -------------------------------------------------------------------------
    // Phase 2: IPO Catalog & Milestone Alerts
    // -------------------------------------------------------------------------
    case "ipo_bidding_opened": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");
      const issuePrice = payload.issuePrice ? `₹${payload.issuePrice}` : "Price band open";

      return {
        title: `Bidding Open: ${companyName}${symbol ? ` (${symbol})` : ""}`,
        message: `${companyName} is now officially open for bidding at ${issuePrice}. Review issue details and submit your application.`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "View IPO Details",
        priority: "normal",
        category: "ipo_milestone",
        isMandatory: false,
        metadata: { slug, eventType },
      };
    }

    case "ipo_closing_soon": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");
      const closeDate = escapeHtml(String(payload.closeDate || "today"));

      return {
        title: `Closing Soon: ${companyName}${symbol ? ` (${symbol})` : ""}`,
        message: `${companyName} closes bidding on ${closeDate}. Submit your application before cut-off time (5:00 PM IST).`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "Apply Now",
        priority: "high",
        category: "ipo_milestone",
        isMandatory: false,
        metadata: { slug, closeDate, eventType },
      };
    }

    case "ipo_allotment_finalized": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");

      return {
        title: `Basis of Allotment Finalized: ${companyName}`,
        message: `Registrar has finalized the basis of allotment for ${companyName}${symbol ? ` (${symbol})` : ""}. Check your individual application status for allotment outcomes.`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "View Allotment Info",
        priority: "urgent",
        category: "ipo_milestone",
        isMandatory: false,
        metadata: { slug, eventType },
      };
    }

    case "ipo_listing_today": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");

      return {
        title: `Listing Today: ${companyName}${symbol ? ` (${symbol})` : ""}`,
        message: `${companyName} commences trading on NSE and BSE today at 10:00 AM IST.`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "View Listing Details",
        priority: "high",
        category: "ipo_milestone",
        isMandatory: false,
        metadata: { slug, eventType },
      };
    }

    // -------------------------------------------------------------------------
    // Phase 3: Research & Grey Market Intelligence
    // -------------------------------------------------------------------------
    case "gmp_significant_movement": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");
      const gmpValue = Number(payload.gmpValue || 0);
      const gmpPercentage = Number(payload.gmpPercentage || 0);
      const shiftDirection = gmpPercentage >= 0 ? "surged" : "dropped";

      return {
        title: `GMP Movement: ${companyName}${symbol ? ` (${symbol})` : ""}`,
        message: `Grey Market Premium has ${shiftDirection} to ₹${gmpValue.toFixed(2)} (${gmpPercentage >= 0 ? "+" : ""}${gmpPercentage.toFixed(1)}%).\n\nDisclaimer: ${MANDATORY_GMP_DISCLAIMER}`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "View Research & GMP",
        priority: "normal",
        category: "research_gmp",
        isMandatory: false,
        metadata: { slug, gmpValue, gmpPercentage, eventType },
      };
    }

    case "governance_risk_alert": {
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const symbol = escapeHtml(String(payload.symbol || ""));
      const slug = String(payload.slug || "");
      const riskTitle = escapeHtml(String(payload.riskTitle || "High governance risk observed"));

      return {
        title: `Governance Risk Alert: ${companyName}`,
        message: `A high-severity governance or balance sheet risk was flagged for ${companyName}${symbol ? ` (${symbol})` : ""}: "${riskTitle}". Review comprehensive risk factors before bidding.`,
        actionUrl: slug ? `/ipos/${slug}` : "/ipos",
        actionLabel: "Review Risk Factors",
        priority: "high",
        category: "research_gmp",
        isMandatory: false,
        metadata: { slug, eventType },
      };
    }

    // -------------------------------------------------------------------------
    // Phase 4: Application & Allotment Lifecycle (MANDATORY IN-APP)
    // -------------------------------------------------------------------------
    case "application_mandate_pending": {
      const applicationId = String(payload.applicationId || "");
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const amount = Number(payload.applicationAmount || 0);
      const maskedUpi = maskUPI(String(payload.upiId || payload.upiIdMasked || ""));

      return {
        title: `UPI Mandate Pending: ${companyName}`,
        message: `Application submitted for ₹${amount.toLocaleString("en-IN")}. Authorize the UPI mandate request sent to ${maskedUpi} in your UPI app before expiry.`,
        actionUrl: applicationId ? `/applications/${applicationId}` : "/applications",
        actionLabel: "View Application",
        priority: "urgent",
        category: "application_lifecycle",
        isMandatory: true,
        metadata: { applicationId, eventType },
      };
    }

    case "application_funds_blocked": {
      const applicationId = String(payload.applicationId || "");
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const amount = Number(payload.blockedAmount || 0);

      return {
        title: `ASBA Funds Blocked: ${companyName}`,
        message: `Bank mandate confirmed. ₹${amount.toLocaleString("en-IN")} is successfully held under bank lien for your ${companyName} bid.`,
        actionUrl: applicationId ? `/applications/${applicationId}` : "/applications",
        actionLabel: "View Application",
        priority: "high",
        category: "application_lifecycle",
        isMandatory: true,
        metadata: { applicationId, eventType },
      };
    }

    case "application_allotment_result": {
      const applicationId = String(payload.applicationId || "");
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const sharesAllotted = Number(payload.sharesAllotted || 0);
      const refundAmount = Number(payload.refundAmount || 0);
      const maskedPan = maskPAN(String(payload.pan || payload.panMasked || ""));

      let statusMsg = "";
      if (sharesAllotted > 0) {
        statusMsg = `Congratulations! You have been allotted ${sharesAllotted} shares for ${companyName} (PAN: ${maskedPan}).`;
        if (refundAmount > 0) {
          statusMsg += ` Surplus lien of ₹${refundAmount.toLocaleString("en-IN")} marked for release.`;
        }
      } else {
        statusMsg = `No shares were allotted for ${companyName} (PAN: ${maskedPan}). Entire lien amount of ₹${refundAmount.toLocaleString("en-IN")} released to your available bank balance.`;
      }

      return {
        title: `Allotment Outcome: ${companyName}`,
        message: statusMsg,
        actionUrl: applicationId ? `/applications/${applicationId}` : "/applications",
        actionLabel: "View Allotment Receipt",
        priority: "urgent",
        category: "allotment_refund",
        isMandatory: true,
        metadata: { applicationId, sharesAllotted, refundAmount, eventType },
      };
    }

    case "application_refund_completed": {
      const applicationId = String(payload.applicationId || "");
      const companyName = escapeHtml(String(payload.companyName || "IPO"));
      const refundAmount = Number(payload.refundAmount || 0);

      return {
        title: `Refund Processed: ${companyName}`,
        message: `Bank lien released. ₹${refundAmount.toLocaleString("en-IN")} has been credited back to your liquid bank account balance.`,
        actionUrl: applicationId ? `/applications/${applicationId}` : "/applications",
        actionLabel: "View Application",
        priority: "high",
        category: "allotment_refund",
        isMandatory: true,
        metadata: { applicationId, refundAmount, eventType },
      };
    }

    // -------------------------------------------------------------------------
    // Phase 5: Financial Ledger & Capital Updates (MANDATORY IN-APP)
    // -------------------------------------------------------------------------
    case "finance_cash_unblocked": {
      const amount = Number(payload.unblockedAmount || payload.amount || 0);
      const narration = escapeHtml(String(payload.narration || "Lien release posted to liquid bank ledger."));

      return {
        title: `Liquid Cash Restored (Account 1010)`,
        message: `₹${amount.toLocaleString("en-IN")} unblocked from ASBA lien and credited back to Account 1010. ${narration}`,
        actionUrl: "/finance",
        actionLabel: "View General Ledger",
        priority: "high",
        category: "portfolio_capital",
        isMandatory: true,
        metadata: { amount, eventType },
      };
    }

    case "finance_capital_credited": {
      const amount = Number(payload.amount || 0);

      return {
        title: `Capital Deposit Recorded`,
        message: `Capital deposit of ₹${amount.toLocaleString("en-IN")} posted to Bank Ledger (Account 1010). Balance available for new IPO bids.`,
        actionUrl: "/finance",
        actionLabel: "View Accounts",
        priority: "normal",
        category: "portfolio_capital",
        isMandatory: true,
        metadata: { amount, eventType },
      };
    }

    // -------------------------------------------------------------------------
    // Phase 6: Analytics & Screener Alerts
    // -------------------------------------------------------------------------
    case "portfolio_hhi_warning": {
      const sector = escapeHtml(String(payload.sector || "Concentrated Sector"));
      const hhiScore = Number(payload.hhiScore || 2500);

      return {
        title: `Portfolio Concentration Warning: ${sector}`,
        message: `Your IPO holding allocation in ${sector} exceeds high-concentration threshold (HHI Score: ${hhiScore.toFixed(0)}). Diversification recommended.`,
        actionUrl: "/analytics",
        actionLabel: "View Portfolio Analytics",
        priority: "normal",
        category: "portfolio_capital",
        isMandatory: false,
        metadata: { sector, hhiScore, eventType },
      };
    }

    case "saved_screen_match": {
      const screenName = escapeHtml(String(payload.screenName || "Saved Screen"));
      const companyName = escapeHtml(String(payload.companyName || "New IPO"));
      const slug = String(payload.slug || "");

      return {
        title: `Screener Alert: Match for "${screenName}"`,
        message: `Newly published issue "${companyName}" satisfies all filter criteria in your custom screen "${screenName}".`,
        actionUrl: slug ? `/ipos/${slug}` : "/analytics/screener",
        actionLabel: "View Matched Issue",
        priority: "low",
        category: "research_gmp",
        isMandatory: false,
        metadata: { screenName, slug, eventType },
      };
    }

    // Default Fallback
    default: {
      const title = escapeHtml(String(payload.title || "Notification"));
      const message = escapeHtml(String(payload.message || "You have a new update."));

      return {
        title,
        message,
        actionUrl: "/notifications",
        actionLabel: "View Notifications",
        priority: (payload.priority as NotificationPriority) || "normal",
        category: (payload.category as NotificationCategory) || "ipo_milestone",
        isMandatory: Boolean(payload.isMandatory),
        metadata: { eventType },
      };
    }
  }
}
