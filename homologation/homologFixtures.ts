/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, DEFAULT_CATEGORIES } from '../src/utils/storage';

/**
 * UUIDs exclusivamente fictícios para homologação local isolada.
 * Não correspondem a nenhuma conta real do Supabase.
 */
export const HOMOLOG_USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const HOMOLOG_USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const HOMOLOG_REASONS = [
  'pre_local_push',
  'pre_force_download',
  'pre_legacy_import',
  'pre_load_sample',
  'pre_reset_clean',
  'pre_json_import',
  'timestamp_tie_content_conflict'
] as const;

export function createHomologFictitiousState(params: {
  ownerUserId: string;
  version: number;
  label?: string;
  amount?: number;
  lastModifiedOffsetMs?: number;
}): AppState {
  const {
    ownerUserId,
    version,
    label = `Lançamento Fictício Homologação v${version}`,
    amount = 1000 + version * 250,
    lastModifiedOffsetMs = version * 5000
  } = params;

  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + lastModifiedOffsetMs,
    transactions: [
      {
        id: `homolog-tx-${version}`,
        description: label,
        amount,
        type: 'income',
        category: 'Salário',
        date: '2026-11-15',
        accountId: 'homolog-acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'homolog-acc-1',
        name: `Conta Fictícia ${ownerUserId === HOMOLOG_USER_A ? 'Alfa' : 'Beta'}`,
        type: 'checking',
        balance: amount * 2,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'homolog-card-1',
        name: 'Cartão Fictício Homologação',
        color: '#6366f1',
        limitTotal: 5000,
        closingDay: 15,
        dueDay: 22
      }
    ],
    debts:
      version % 2 === 0
        ? [
            {
              id: `homolog-debt-${version}`,
              name: `Dívida Simulada v${version}`,
              creditor: 'Instituição Fictícia',
              originalAmount: 1500,
              currentBalance: 750,
              contractDate: '2026-01-10',
              dueDate: '2026-12-10',
              priority: 'medium',
              status: 'in_payment',
              totalPaid: 750
            }
          ]
        : [],
    goals: [
      {
        id: `homolog-goal-${version}`,
        name: `Objetivo Simulado v${version}`,
        targetAmount: 10000,
        currentAmount: 2000 + version * 100,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 350,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: 3000 + version * 100,
    isSampleLoaded: false
  };
}

/**
 * Bloqueia execução caso o módulo seja carregado diretamente fora de uma origem isolada
 * (ex.: porta 3000 ou URL top-level *.run.app sem sandbox opaco `null`).
 */
export function assertIsolatedHomologOrigin(): void {
  if (typeof window !== 'undefined' && window.location) {
    if (window.origin === 'null') {
      return;
    }

    const hostname = window.location.hostname || '';
    if (window.location.port === '3000' || hostname.endsWith('.run.app')) {
      throw new Error(
        'Execução bloqueada: o módulo de homologação não pode rodar diretamente na origem de produção (porta 3000 / Preview) sem sandbox isolado.'
      );
    }
  }
}
