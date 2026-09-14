/**
 * features/external-integrations/documents/documentSourceRegistry.ts
 *
 * Configurable, versioned registry for authoritative regulatory and registrar domains.
 * Allows runtime expansion without modifying core proxy code.
 */

export interface AllowedDomainRule {
  domain: string;
  sourceType: 'regulatory_sebi' | 'regulatory_exchange' | 'registrar' | 'merchant_banker';
  displayName: string;
  allowSubdomains: boolean;
}

export const DOC_SOURCE_REGISTRY_V1: AllowedDomainRule[] = [
  // SEBI
  {
    domain: 'sebi.gov.in',
    sourceType: 'regulatory_sebi',
    displayName: 'Official SEBI Filing',
    allowSubdomains: true,
  },
  // NSE
  {
    domain: 'nseindia.com',
    sourceType: 'regulatory_exchange',
    displayName: 'Official Exchange Filing',
    allowSubdomains: true,
  },
  // BSE
  {
    domain: 'bseindia.com',
    sourceType: 'regulatory_exchange',
    displayName: 'Official Exchange Filing',
    allowSubdomains: true,
  },
  // Initial Approved Registrars
  {
    domain: 'linkintime.co.in',
    sourceType: 'registrar',
    displayName: 'Official Registrar Document',
    allowSubdomains: true,
  },
  {
    domain: 'kfintech.com',
    sourceType: 'registrar',
    displayName: 'Official Registrar Document',
    allowSubdomains: true,
  },
  {
    domain: 'bigshareonline.com',
    sourceType: 'registrar',
    displayName: 'Official Registrar Document',
    allowSubdomains: true,
  },
  {
    domain: 'cameoindia.com',
    sourceType: 'registrar',
    displayName: 'Official Registrar Document',
    allowSubdomains: true,
  },
  {
    domain: 'masserv.com',
    sourceType: 'registrar',
    displayName: 'Official Registrar Document',
    allowSubdomains: true,
  },
];

export class DocumentSourceRegistry {
  private rules: AllowedDomainRule[];

  constructor(initialRules: AllowedDomainRule[] = DOC_SOURCE_REGISTRY_V1) {
    this.rules = [...initialRules];
  }

  public isDomainAllowed(hostname: string): boolean {
    const cleanHost = hostname.toLowerCase().trim();
    return this.rules.some((rule) => {
      const ruleDomain = rule.domain.toLowerCase();
      if (cleanHost === ruleDomain) return true;
      if (rule.allowSubdomains && cleanHost.endsWith(`.${ruleDomain}`)) return true;
      return false;
    });
  }

  public getSourceRule(hostname: string): AllowedDomainRule | undefined {
    const cleanHost = hostname.toLowerCase().trim();
    return this.rules.find((rule) => {
      const ruleDomain = rule.domain.toLowerCase();
      if (cleanHost === ruleDomain) return true;
      if (rule.allowSubdomains && cleanHost.endsWith(`.${ruleDomain}`)) return true;
      return false;
    });
  }

  public getDisplayName(hostname: string, fallbackSource?: string): string {
    const rule = this.getSourceRule(hostname);
    if (rule) return rule.displayName;
    if (fallbackSource === 'sebi') return 'Official SEBI Filing';
    if (fallbackSource === 'nse' || fallbackSource === 'bse') return 'Official Exchange Filing';
    if (fallbackSource === 'registrar') return 'Official Registrar Document';
    return 'Official Filing';
  }

  public registerDomain(rule: AllowedDomainRule): void {
    const exists = this.rules.some(r => r.domain.toLowerCase() === rule.domain.toLowerCase());
    if (!exists) {
      this.rules.push(rule);
    }
  }

  public getAllRules(): AllowedDomainRule[] {
    return [...this.rules];
  }
}

export const documentSourceRegistry = new DocumentSourceRegistry();
