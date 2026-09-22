import { z } from "zod";

export const ipoSchema = z
  .object({
    company_name: z
      .string()
      .min(2, "Company name must be at least 2 characters")
      .max(255, "Company name cannot exceed 255 characters"),
    symbol: z
      .string()
      .max(20, "Stock symbol cannot exceed 20 characters")
      .optional()
      .nullable()
      .or(z.literal("")),
    slug: z
      .string()
      .min(2, "Slug is required")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric with hyphens (e.g. bajaj-housing-finance)"
      ),
    company_logo: z
      .string()
      .url("Logo must be a valid URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    category: z.enum(["mainboard", "sme_bse", "sme_nse"]),
    issue_type: z.enum(["book_building", "fixed_price"]),
    status: z.enum([
      "announced",
      "upcoming",
      "open",
      "closed",
      "allotment_pending",
      "listing_soon",
      "listed",
      "withdrawn",
      "cancelled",
    ]),
    publication_status: z.enum([
      "draft",
      "in_review",
      "approved",
      "published",
      "archived",
    ]),

    // Pricing & Lots
    price_band_low: z
      .number()
      .positive("Price must be greater than 0")
      .optional()
      .nullable(),
    price_band_high: z
      .number()
      .positive("Price must be greater than 0")
      .optional()
      .nullable(),
    face_value: z.number().positive().default(10),
    lot_size: z
      .number()
      .int("Lot size must be an integer")
      .positive("Lot size must be at least 1")
      .optional()
      .nullable(),

    // Issue Size & Structure in Crores
    issue_size_cr: z
      .number()
      .positive("Issue size must be greater than 0")
      .optional()
      .nullable(),
    fresh_issue_cr: z.number().nonnegative().optional().nullable(),
    ofs_cr: z.number().nonnegative().optional().nullable(),
    shares_offered: z.number().int().positive().optional().nullable(),

    // Quotas (No fabricated statutory defaults; must remain null if unverified)
    retail_quota_pct: z.number().min(0).max(100).optional().nullable(),
    qib_quota_pct: z.number().min(0).max(100).optional().nullable(),
    hni_quota_pct: z.number().min(0).max(100).optional().nullable(),

    // Market Info
    exchange: z.string().default("NSE, BSE"),
    registrar_name: z.string().optional().nullable(),
    lead_managers: z.array(z.string()).default([]),

    // Timeline Dates
    announcement_date: z.string().optional().nullable(),
    open_date: z.string().optional().nullable(),
    close_date: z.string().optional().nullable(),
    allotment_date: z.string().optional().nullable(),
    refund_date: z.string().optional().nullable(),
    listing_date: z.string().optional().nullable(),

    // Post-listing
    listing_price: z.number().positive().optional().nullable(),

    // Content
    about_company: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.price_band_low && data.price_band_high) {
        return data.price_band_high >= data.price_band_low;
      }
      return true;
    },
    {
      message: "Price band high must be greater than or equal to price band low",
      path: ["price_band_high"],
    }
  )
  .refine(
    (data) => {
      if (data.open_date && data.close_date) {
        return new Date(data.close_date) >= new Date(data.open_date);
      }
      return true;
    },
    {
      message: "Close date must be on or after open date",
      path: ["close_date"],
    }
  )
  .refine(
    (data) => {
      if (data.close_date && data.allotment_date) {
        return new Date(data.allotment_date) >= new Date(data.close_date);
      }
      return true;
    },
    {
      message: "Allotment date must be on or after close date",
      path: ["allotment_date"],
    }
  )
  .refine(
    (data) => {
      if (data.allotment_date && data.listing_date) {
        return new Date(data.listing_date) >= new Date(data.allotment_date);
      }
      return true;
    },
    {
      message: "Listing date must be on or after allotment date",
      path: ["listing_date"],
    }
  );

export type IPOFormData = z.infer<typeof ipoSchema>;
