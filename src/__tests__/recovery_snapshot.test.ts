/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  buildRecoverySnapshotDownload,
  inspectLocalRecoverySnapshot
} from '../utils/recoverySnapshot';
import { supabase } from '../utils/supabase';

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  upsert: upsertMock
}));

vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn()
      },
      from: (...args: any[]) => (fromMock as any)(...args)
    },
    SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
  };
});

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

Object.defineProperty(globalThis, 'localStorage', {
  value: createLocalStorageMock(),
  writable: true
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function createFixtureState(
  ownerUserId: string,
  overrides: Partial<AppState> = {}
): AppState {
  return {
    ownerUserId,
    version: 4,
    lastModified: 1700000400000,
    transactions: [
      {
        id: 'tx-1',
        description: 'Salário Fictício',
        amount: 5000,
        type: 'income',
        category: 'Salário',
        date: '2026-11-05',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      },
      {
        id: 'tx-2',
        description: 'Supermercado Fictício',
        amount: 420,
        type: 'expense_variable',
        category: 'Supermercado',
        date: '2026-11-06',
        creditCardId: 'card-1',
        paymentMethod: 'credit_card',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Corrente Fictícia',
        type: 'checking',
        balance: 5000,
        color: '#3b82f6'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Fictício',
        color: '#6366f1',
        limitTotal: 4000,
        closingDay: 20,
        dueDay: 27
      }
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Dívida Fictícia',
        creditor: 'Banco Fictício',
        originalAmount: 3000,
        currentBalance: 1500,
        contractDate: '2026-01-10',
        dueDate: '2026-12-10',
        priority: 'medium',
        status: 'in_payment',
        totalPaid: 1500
      }
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Objetivo Fictício',
        targetAmount: 10000,
        currentAmount: 3000,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 500,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: 2000,
    isSampleLoaded: false,
    ...overrides
  };
}

describe('P1: Ponto de Recuperação Local (Consulta e Download Preventivo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Lê corretamente snapshot válido do usuário autenticado com motivo amigável e contagens exatas', () => {
    const snapshotState = createFixtureState(USER_A, { version: 7 });
    const saved = saveRecoverySnapshotForUser(USER_A, snapshotState, 'pre_json_import');
    expect(saved).toBe(true);

    const inspection = inspectLocalRecoverySnapshot(USER_A);

    expect(inspection.status).toBe('available');
    expect(inspection.summary).toBeDefined();
    expect(inspection.summary?.version).toBe(7);
    expect(inspection.summary?.reason.code).toBe('pre_json_import');
    expect(inspection.summary?.reason.label).toBe('Antes de restaurar backup JSON');
    expect(inspection.summary?.counts).toEqual({
      transactions: 2,
      accounts: 1,
      creditCards: 1,
      debts: 1,
      goals: 1,
      categories: DEFAULT_CATEGORIES.length
    });
    expect(Date.parse(inspection.summary!.savedAt)).not.toBeNaN();
  });

  it('2. Trata ausência de snapshot retornando estado vazio esperado e bloqueando download', () => {
    const inspection = inspectLocalRecoverySnapshot(USER_A);

    expect(inspection.status).toBe('empty');
    expect(inspection.message).toBe('Nenhum ponto de recuperação disponível neste navegador');
    expect(inspection.summary).toBeUndefined();

    const download = buildRecoverySnapshotDownload(USER_A);
    expect(download.success).toBe(false);
    expect(download.jsonContent).toBeUndefined();
  });

  it('3. Bloqueia acesso a snapshot de outro usuário (chave separada ou ownerUserId divergente)', () => {
    const stateB = createFixtureState(USER_B);
    saveRecoverySnapshotForUser(USER_B, stateB, 'pre_reset_clean');

    // Usuário A não vê snapshot salvo na chave do Usuário B
    const inspectionA = inspectLocalRecoverySnapshot(USER_A);
    expect(inspectionA.status).toBe('empty');

    // Mesmo se um snapshot do Usuário B fosse gravado na chave do Usuário A, o acesso é bloqueado
    const rawB = localStorage.getItem(getUserRecoveryKey(USER_B))!;
    localStorage.setItem(getUserRecoveryKey(USER_A), rawB);

    const crossInspection = inspectLocalRecoverySnapshot(USER_A);
    expect(crossInspection.status).toBe('corrupted');
    expect(crossInspection.summary).toBeUndefined();

    const crossDownload = buildRecoverySnapshotDownload(USER_A);
    expect(crossDownload.success).toBe(false);
  });

  it('4. Trata snapshots corrompidos ou inválidos sem travar o aplicativo', () => {
    // Caso A: JSON malformado
    localStorage.setItem(getUserRecoveryKey(USER_A), '{corrupted_json');
    const badJsonRes = inspectLocalRecoverySnapshot(USER_A);
    expect(badJsonRes.status).toBe('corrupted');
    expect(badJsonRes.summary).toBeUndefined();

    // Caso B: savedAt inválido
    localStorage.setItem(
      getUserRecoveryKey(USER_A),
      JSON.stringify({
        savedAt: 'data-invalida',
        reason: 'pre_reset_clean',
        ownerUserId: USER_A,
        state: createFixtureState(USER_A)
      })
    );
    const badDateRes = inspectLocalRecoverySnapshot(USER_A);
    expect(badDateRes.status).toBe('corrupted');

    // Caso C: coleções internas ausentes/corrompidas
    const brokenState = { ...createFixtureState(USER_A), creditCards: 'invalido' };
    localStorage.setItem(
      getUserRecoveryKey(USER_A),
      JSON.stringify({
        savedAt: '2026-11-14T18:00:00.000Z',
        reason: 'pre_force_download',
        ownerUserId: USER_A,
        state: brokenState
      })
    );
    const brokenArraysRes = inspectLocalRecoverySnapshot(USER_A);
    expect(brokenArraysRes.status).toBe('corrupted');
    expect(buildRecoverySnapshotDownload(USER_A).success).toBe(false);
  });

  it('5. Exporta JSON original sem alterações, sem UUID completo no nome do arquivo e sem modificar o snapshot salvo', () => {
    const originalState = createFixtureState(USER_A, { version: 9, safetyReserveDesired: 3450 });
    saveRecoverySnapshotForUser(USER_A, originalState, 'pre_force_download');

    const storedRawBefore = localStorage.getItem(getUserRecoveryKey(USER_A))!;
    const download = buildRecoverySnapshotDownload(USER_A);

    expect(download.success).toBe(true);
    expect(download.filename).toBeDefined();
    expect(download.filename).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    expect(download.filename).not.toContain(USER_A);
    expect(download.jsonContent).toBeDefined();

    // Conteúdo JSON exportado preserva integralmente o snapshot original
    expect(JSON.parse(download.jsonContent!)).toEqual(JSON.parse(storedRawBefore));

    // O snapshot armazenado no localStorage permanece inalterado byte a byte
    const storedRawAfter = localStorage.getItem(getUserRecoveryKey(USER_A));
    expect(storedRawAfter).toBe(storedRawBefore);
  });

  it('6. Não executa nenhuma leitura ou gravação no Supabase durante inspeção ou download', () => {
    saveRecoverySnapshotForUser(USER_A, createFixtureState(USER_A), 'pre_local_push');

    inspectLocalRecoverySnapshot(USER_A);
    buildRecoverySnapshotDownload(USER_A);

    expect(fromMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('7. Preserva integralmente o estado financeiro ativo sem sobrescrevê-lo na consulta ou download', () => {
    const activeState = createFixtureState(USER_A, {
      version: 12,
      safetyReserveDesired: 9999,
      transactions: [
        {
          id: 'tx-atual',
          description: 'Lançamento Atual Ativo',
          amount: 1234.56,
          type: 'income',
          category: 'Salário',
          date: '2026-11-14',
          accountId: 'acc-1',
          paymentMethod: 'pix',
          status: 'paid'
        }
      ]
    });
    saveStateToStorageForUser(USER_A, activeState);

    // Snapshot anterior possui versão 4 e 2 lançamentos antigos
    const olderSnapshotState = createFixtureState(USER_A, { version: 4, safetyReserveDesired: 2000 });
    saveRecoverySnapshotForUser(USER_A, olderSnapshotState, 'pre_reset_clean');

    const inspection = inspectLocalRecoverySnapshot(USER_A);
    expect(inspection.status).toBe('available');
    expect(inspection.summary?.version).toBe(4);

    const download = buildRecoverySnapshotDownload(USER_A);
    expect(download.success).toBe(true);

    // Estado ativo do usuário no storage continua idêntico ao original (versão 12, reserva 9999, 1 lançamento)
    const activeAfter = getUserStateFromStorage(USER_A);
    expect(activeAfter).toEqual(activeState);
  });
});
