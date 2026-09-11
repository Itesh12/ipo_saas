/**
 * features/external-integrations/ipo-infrastructure/ipoInfrastructureTypes.ts
 *
 * IPO Infrastructure (Exchange Syndicate & Intermediary Gateway) Contracts.
 *
 * STRICT INVARIANT: INTERFACES AND TYPE CONTRACTS ONLY.
 * ZERO mock implementations, zero mock bidding, zero mock mandates, zero mock applications.
 * Execution is explicitly deferred to Stage 5.
 */

import { IExternalProvider } from '../providers/providerTypes';

export type ExchangeType = 'BSE' | 'NSE';

export type ExternalInvestorCategory = 'IND' | 'SHA' | 'EMP' | 'POL' | 'NII' | 'HNI' | 'QIB';

export interface ExternalBidSpec {
  bidNumber: number; // 1, 2, 3
  quantity: number;
  rate: number;
  isCutOff: boolean;
}

export interface ExternalIpoApplicationContract {
  symbol: string;
  panNumberMasked: string;
  depositoryType: 'cdsl' | 'nsdl';
  dpId: string;
  clientId: string;
  upiHandleMasked: string;
  category: ExternalInvestorCategory;
  bids: ExternalBidSpec[];
  totalAmountPayable: number;
}

export interface ExternalBiddingResponseContract {
  externalApplicationNumber: string;
  exchangeRefNumber: string;
  exchangeTimestamp: string;
  status: 'PENDING_CONFIRMATION' | 'ACCEPTED_BY_EXCHANGE' | 'REJECTED_BY_EXCHANGE';
  reason?: string;
}

export interface ExternalMandateStatusContract {
  externalApplicationNumber: string;
  upiMandateUmn: string;
  status: 'REQUESTED' | 'AUTHENTICATED' | 'SUCCESS' | 'EXPIRED' | 'DECLINED' | 'FAILED';
  updatedAt: string;
  failureReason?: string;
}

/**
 * Interface definition for future IPO Infrastructure Gateway implementations.
 * STRICT GUARDRAIL: No executable class or mock instance is provided in Stage 1.
 */
export interface IIpoInfrastructureProvider extends IExternalProvider {
  readonly providerType: 'ipo_infrastructure';
  readonly exchange: ExchangeType;

  /**
   * Future method: Query issue master details from exchange bidding system.
   */
  getIssueMaster(symbol: string): Promise<unknown>;

  /**
   * Future method: Submit IPO syndicate bid (DEFERRED TO STAGE 5).
   */
  submitApplication(contract: ExternalIpoApplicationContract): Promise<ExternalBiddingResponseContract>;

  /**
   * Future method: Poll or query mandate status (DEFERRED TO STAGE 5).
   */
  queryMandateStatus(externalApplicationNumber: string): Promise<ExternalMandateStatusContract>;
}
