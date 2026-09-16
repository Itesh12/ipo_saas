/**
 * features/allotment-verification/adapters/registrarAdapterFactory.ts
 *
 * Factory to instantiate and resolve registrar adapters by registrar_code.
 */

import { BaseRegistrarAdapter } from './baseRegistrarAdapter';
import { LinkIntimeAdapter } from './linkIntimeAdapter';
import { KFintechAdapter } from './kfintechAdapter';
import { BigshareAdapter } from './bigshareAdapter';

export class RegistrarAdapterFactory {
  private static adapters: Map<string, BaseRegistrarAdapter> = new Map<string, BaseRegistrarAdapter>([
    ['link_intime', new LinkIntimeAdapter()],
    ['kfintech', new KFintechAdapter()],
    ['bigshare', new BigshareAdapter()],
  ]);

  static getAdapter(registrarCode: string): BaseRegistrarAdapter | null {
    return this.adapters.get(registrarCode) || null;
  }

  static isSupported(registrarCode: string): boolean {
    return this.adapters.has(registrarCode);
  }
}
