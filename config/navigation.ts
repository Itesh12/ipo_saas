export type UserRole = "super_admin" | "admin" | "editor" | "analyst" | "user";

export interface NavItem {
  title: string;
  href: string;
  iconName: string;
  badge?: string;
  description?: string;
  minRole?: UserRole;
  isExternal?: boolean;
}

export interface NavSection {
  sectionTitle?: string;
  items: NavItem[];
}

/**
 * Public website top navigation
 */
export const PUBLIC_NAV_ITEMS: NavItem[] = [
  { title: "Current IPOs", href: "/ipos", iconName: "Flame" },
  { title: "Upcoming", href: "/ipos?tab=upcoming", iconName: "Calendar" },
  { title: "GMP Tracker", href: "/ipo-gmp", iconName: "TrendingUp", badge: "Live" },
  { title: "Subscription", href: "/ipo-subscription", iconName: "BarChart3" },
  { title: "Calendar", href: "/ipo-calendar", iconName: "CalendarDays" },
  { title: "Screener", href: "/ipo-screener", iconName: "SlidersHorizontal" },
  { title: "Compare", href: "/compare", iconName: "GitCompare" },
  { title: "News", href: "/news", iconName: "Newspaper" },
];

/**
 * User Dashboard sidebar sections
 */
export const USER_DASHBOARD_NAV: NavSection[] = [
  {
    sectionTitle: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", iconName: "LayoutDashboard" },
      { title: "Watchlist", href: "/watchlist", iconName: "Star" },
    ],
  },
  {
    sectionTitle: "IPO Management",
    items: [
      { title: "Applications", href: "/applications", iconName: "FileCheck2" },
      { title: "Applicants (Family)", href: "/applicants", iconName: "Users2" },
      { title: "Allotment & P&L", href: "/portfolio", iconName: "PieChart" },
    ],
  },
  {
    sectionTitle: "Financials",
    items: [
      { title: "Capital & Ledger", href: "/capital", iconName: "Wallet" },
      { title: "Analytics", href: "/analytics", iconName: "LineChart" },
      { title: "Reports & Tax", href: "/reports", iconName: "FileSpreadsheet" },
    ],
  },
  {
    sectionTitle: "Preferences",
    items: [
      { title: "Notifications", href: "/notifications", iconName: "Bell" },
      { title: "Settings", href: "/settings", iconName: "Settings" },
    ],
  },
];

/**
 * Admin operational portal navigation with role gates
 */
export const ADMIN_NAV: NavSection[] = [
  {
    sectionTitle: "Operations Command",
    items: [
      { title: "Admin Overview", href: "/admin/dashboard", iconName: "ShieldAlert", minRole: "analyst" },
      { title: "Work Queue", href: "/admin/work-queue", iconName: "CheckSquare", minRole: "analyst" },
      { title: "Data Quality", href: "/admin/data-quality", iconName: "ShieldCheck", minRole: "analyst" },
      { title: "System Health", href: "/admin/system-health", iconName: "Activity", minRole: "admin" },
      { title: "IPO Master", href: "/admin/ipos", iconName: "Layers", minRole: "editor" },
      { title: "GMP Updates", href: "/admin/gmp", iconName: "TrendingUp", minRole: "editor" },
      { title: "Subscriptions", href: "/admin/subscriptions", iconName: "BarChart3", minRole: "editor" },
    ],
  },
  {
    sectionTitle: "Governance & Users",
    items: [
      { title: "User Directory", href: "/admin/users", iconName: "Users", minRole: "admin" },
      { title: "Global Applications", href: "/admin/applications", iconName: "FileText", minRole: "admin" },
      { title: "Global Applicants", href: "/admin/applicants", iconName: "Users2", minRole: "admin" },
      { title: "General Ledger Audit", href: "/admin/finance", iconName: "Scale", minRole: "admin" },
      { title: "Data Pipelines", href: "/admin/data-sources", iconName: "Database", minRole: "admin" },
      { title: "External Integrations", href: "/admin/integrations", iconName: "Network", minRole: "admin", badge: "Stage 1" },
      { title: "Audit Trail", href: "/admin/audit-logs", iconName: "ScrollText", minRole: "admin" },
    ],
  },
];
