/**
 * features/external-integrations/registrars/registrarTypes.ts
 *
 * Registrar and Share Transfer Agent (RTA) Contracts (Link Intime, KFintech, Bigshare).
 *
 * STRICT INVARIANT: INTERFACES AND TYPE CONTRACTS ONLY.
 * Zero live scraping or RTA simulation. Execution deferred to Stage 4.
 */

import { IExternalProvider } from '../providers/providerTypes';

export type RegistrarCode = 'link_intime' | 'kfintech' | 'bigshare' | 'cameo' | 'integrated';

export interface ExternalAllotmentQueryRequest {
  companySymbol: string;
  panNumberMasked: string;
  applicationNumber?: string;
  dpClientIdMasked?: string;
}

export interface ExternalAllotmentRecordContract {
  companySymbol: string;
  panMasked: string;
  applicationNumber: string;
  sharesApplied: number;
  sharesAllotted: number;
  allotmentStatus: 'ALLOTTED' | 'NOT_ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'REJECTED';
  refundAmount: number;
  depositoryCreditStatus: 'CREDITED' | 'PENDING' | 'FAILED';
  basisOfAllotmentDate?: string;
}

export interface IRegistrarProvider extends IExternalProvider {
  readonly providerType: 'registrar';
  readonly registrarCode: RegistrarCode;

  /**
   * Future method: Query allotment status from registrar records (DEFERRED TO STAGE 4).
   */
  queryAllotment(request: ExternalAllotmentQueryRequest): Promise<ExternalAllotmentRecordContract | null>;
}
