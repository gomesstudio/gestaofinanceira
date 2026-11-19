/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  LEGACY_STORAGE_KEY,
  clearUserActiveCache,
  createCleanUserState,
  createNeutralLoadingState,
  exportLegacyStorageJson,
  getUserStateFromStorage,
  getUserStorageKey,
  inspectLegacyStorageState,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  areStatesContentEqual,
  fetchFinanceDataFromSupabase,
  hasConfirmedStateOwnership,
  migrateAndVerifyFinanceData,
  resolveMultiDeviceConflict,
  saveFinanceDataToSupabase
} from '../services/supabaseSyncService';
import {
  applyAuthenticatedMutation,
  hydrateUserFinanceSession
} from '../context/FinanceContext';
import { supabase } from '../utils/supabase';

// Mock do supabase para testar todas as camadas reais de frontend sem alterar produção
vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        refreshSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signInWithOtp: vi.fn(),
        verifyOtp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })),
          limit: vi.fn().mockResolvedValue({ data: [], error: null })
        })),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null })
      }))
    },
    SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
  };
});

// Mock completo de localStorage compartilhado no mesmo navegador (simulando o Preview)
const createBrowserStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    _dump: () => ({ ...store })
  };
};

const localMock = createBrowserStorageMock();
const sessionMock = createBrowserStorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: localMock,
  writable: true
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionMock,
  writable: true
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function makeUserState(userId: string, description: string, amount: number, version = 2, lastModified = 1700000000000): AppState {
  return {
    ownerUserId: userId,
    version,
    lastModified,
    transactions: [
      {
        id: `tx-${userId.slice(0, 4)}`,
        description,
        amount,
        type: 'income',
        category: 'Salário',
        date: '2026-11-13',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      { id: 'acc-1', name: 'Conta Principal', type: 'checking', balance: amount, color: '#3b82f6' }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };
}

describe('Isolamento Estrito Multiusuário no Frontend (Preview / Navegador Compartilhado)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.clear();
    sessionMock.clear();
  });

  it('A & B: Conta A carrega seus dados; Conta B no mesmo navegador não visualiza nenhum dado de A', async () => {
    const cloudA = makeUserState(USER_A, 'Receita Exclusiva Conta A', 5000, 3, 1700000001000);
    const cloudB = makeUserState(USER_B, 'Receita Exclusiva Conta B', 1200, 2, 1700000002000);

    // 1. Conta A faz login e hidrata seus dados
    const resA = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_A),
      fetchRemote: async () => ({
        success: true,
        data: cloudA,
        version: cloudA.version,
        clientTimestamp: cloudA.lastModified
      })
    });

    expect(resA.aborted).toBe(false);
    expect(resA.hydrated).toBe(true);
    expect(resA.state.ownerUserId).toBe(USER_A);
    expect(resA.state.transactions.map(t => t.description)).toEqual(['Receita Exclusiva Conta A']);
    expect(getUserStateFromStorage(USER_A)?.transactions[0].description).toBe('Receita Exclusiva Conta A');

    // 2. Conta B faz login no MESMO navegador (onde a chave de A ainda existe isolada ou foi limpa)
    const resB = await hydrateUserFinanceSession({
      userId: USER_B,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_B),
      fetchRemote: async () => ({
        success: true,
        data: cloudB,
        version: cloudB.version,
        clientTimestamp: cloudB.lastModified
      })
    });

    expect(resB.aborted).toBe(false);
    expect(resB.hydrated).toBe(true);
    expect(resB.state.ownerUserId).toBe(USER_B);
    expect(resB.state.transactions.map(t => t.description)).toEqual(['Receita Exclusiva Conta B']);
    expect(JSON.stringify(resB.state)).not.toContain('Receita Exclusiva Conta A');
  });

  it('C & D: Conta B cadastra "TESTE CONTA B", atualiza version/lastModified e faz logout; Conta A não visualiza "TESTE CONTA B"', async () => {
    const cloudA = makeUserState(USER_A, 'Salário Conta A', 4000, 2, 1700000005000);
    const cloudBInitial = makeUserState(USER_B, 'Saldo Inicial B', 100, 1, 1700000005000);

    // Conta B hidratada
    const hydratedB = await hydrateUserFinanceSession({
      userId: USER_B,
      isSessionMatch: () => true,
      localUserCache: null,
      fetchRemote: async () => ({
        success: true,
        data: cloudBInitial,
        version: cloudBInitial.version,
        clientTimestamp: cloudBInitial.lastModified
      })
    });

    // Conta B cadastra "TESTE CONTA B" via mutação autenticada centralizada
    const updatedB = applyAuthenticatedMutation(hydratedB.state, USER_B, true, prev => ({
      ...prev,
      transactions: [
        {
          id: 'tx-teste-b',
          description: 'TESTE CONTA B',
          amount: 999,
          type: 'income',
          category: 'Outras entradas',
          date: '2026-11-13',
          accountId: 'acc-1',
          paymentMethod: 'pix',
          status: 'paid'
        },
        ...prev.transactions
      ]
    }));

    expect(updatedB.ownerUserId).toBe(USER_B);
    expect(updatedB.version).toBe(hydratedB.state.version + 1);
    expect((updatedB.lastModified || 0) > (hydratedB.state.lastModified || 0)).toBe(true);

    saveStateToStorageForUser(USER_B, updatedB);

    // Conta B faz logout (limpando cache ativo de B sem tocar em A nem na chave legada)
    clearUserActiveCache(USER_B);
    expect(getUserStateFromStorage(USER_B)).toBeNull();

    // Mesmo se tentassem injetar manualmente um estado de B no cache de A, a leitura valida ownerUserId e rejeita
    localStorage.setItem(getUserStorageKey(USER_A), JSON.stringify(updatedB));
    expect(getUserStateFromStorage(USER_A)).toBeNull();

    // Conta A faz login e carrega seus dados do Supabase
    const resA = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_A),
      fetchRemote: async () => ({
        success: true,
        data: cloudA,
        version: cloudA.version,
        clientTimestamp: cloudA.lastModified
      })
    });

    expect(resA.hydrated).toBe(true);
    expect(resA.state.ownerUserId).toBe(USER_A);
    expect(resA.state.transactions.some(t => t.description === 'TESTE CONTA B')).toBe(false);
    expect(resA.state.transactions[0].description).toBe('Salário Conta A');
  });

  it('E & F: Atualizar a página e alternar sessões A -> B -> A nunca mistura estados nem usa timestamps iguais como prova de igualdade', async () => {
    const sharedTimestamp = 1700000099000;
    const stateA = makeUserState(USER_A, 'Conta A Original', 3000, 4, sharedTimestamp);
    const stateB = makeUserState(USER_B, 'TESTE CONTA B', 850, 4, sharedTimestamp);

    // Conteúdos diferentes com EXATAMENTE o mesmo timestamp jamais são considerados iguais
    expect(areStatesContentEqual(stateA, stateB)).toBe(false);

    const conflictCrossOwner = resolveMultiDeviceConflict(stateB, stateA, sharedTimestamp, USER_A);
    expect(conflictCrossOwner.strategy).toBe('use_remote');
    expect(conflictCrossOwner.resolvedState.ownerUserId).toBe(USER_A);
    expect(conflictCrossOwner.resolvedState.transactions[0].description).toBe('Conta A Original');

    // Mesmo usuário com mesmo timestamp e conteúdo divergente resulta em 'conflict' (nunca 'equal')
    const editedSameUser = makeUserState(USER_A, 'Conta A Editada Offline', 3500, 4, sharedTimestamp);
    const conflictSameUser = resolveMultiDeviceConflict(editedSameUser, stateA, sharedTimestamp, USER_A);
    expect(conflictSameUser.strategy).toBe('conflict');

    // Alternância A -> B -> A simulando reloads consecutivos
    await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_A),
      fetchRemote: async () => ({ success: true, data: stateA, version: 4, clientTimestamp: sharedTimestamp })
    });
    const reloadA = getUserStateFromStorage(USER_A);
    expect(reloadA?.transactions[0].description).toBe('Conta A Original');

    await hydrateUserFinanceSession({
      userId: USER_B,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_B),
      fetchRemote: async () => ({ success: true, data: stateB, version: 4, clientTimestamp: sharedTimestamp })
    });
    const reloadB = getUserStateFromStorage(USER_B);
    expect(reloadB?.transactions[0].description).toBe('TESTE CONTA B');

    // Após B logar, cache de A permanece estritamente de A e cache de B permanece estritamente de B
    expect(getUserStateFromStorage(USER_A)?.transactions[0].description).toBe('Conta A Original');
    expect(getUserStateFromStorage(USER_B)?.transactions[0].description).toBe('TESTE CONTA B');
  });

  it('G: Resposta assíncrona atrasada da Conta B após troca para Conta A é descartada e não altera a interface/cache de A', async () => {
    let currentActiveUser: string = USER_B;
    let resolveDelayedB!: (val: any) => void;

    const delayedFetchB = new Promise<any>(resolve => {
      resolveDelayedB = resolve;
    });

    const hydrationBPromise = hydrateUserFinanceSession({
      userId: USER_B,
      isSessionMatch: () => currentActiveUser === USER_B,
      localUserCache: null,
      fetchRemote: () => delayedFetchB
    });

    // Usuário troca para Conta A antes da resposta de B chegar
    currentActiveUser = USER_A;

    const stateA = makeUserState(USER_A, 'Patrimônio Conta A', 7500, 2, 1700000100000);
    const hydrationARes = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => currentActiveUser === USER_A,
      localUserCache: null,
      fetchRemote: async () => ({ success: true, data: stateA, version: 2, clientTimestamp: 1700000100000 })
    });

    // Agora a resposta atrasada da Conta B chega da rede
    const stateB = makeUserState(USER_B, 'TESTE CONTA B ATRASADO', 999, 2, 1700000200000);
    resolveDelayedB({ success: true, data: stateB, version: 2, clientTimestamp: 1700000200000 });
    const hydrationBRes = await hydrationBPromise;

    expect(hydrationBRes.aborted).toBe(true);
    expect(hydrationBRes.hydrated).toBe(false);
    expect(hydrationBRes.state.transactions).toHaveLength(0);

    expect(hydrationARes.hydrated).toBe(true);
    expect(getUserStateFromStorage(USER_A)?.transactions[0].description).toBe('Patrimônio Conta A');
    expect(getUserStateFromStorage(USER_B)).toBeNull();
  });

  it('H: Falha de conexão com Supabase não provoca upload de cache sem proprietário nem exibe dados inválidos', async () => {
    const uploadSpy = vi.fn();

    // Cache inválido pertencente a outro usuário ou estado neutro não pode ser aceito
    const foreignCache = makeUserState(USER_B, 'Dados de B', 500);
    const res = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: foreignCache,
      fetchRemote: async () => ({ success: false, message: 'Network error' }),
      uploadLocal: uploadSpy
    });

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res.hydrated).toBe(false);
    expect(res.error).toBe('Network error');
    expect(res.state.transactions).toHaveLength(0);
    expect(JSON.stringify(res.state)).not.toContain('Dados de B');
  });

  it('I: Logout / estado não hidratado bloqueia mutações CRUD e bloqueia gravações no Supabase', async () => {
    const neutralState = createNeutralLoadingState(USER_A);

    // Tentativa de mutação antes da hidratação ou após logout deve ser ignorada
    const blockedNotHydrated = applyAuthenticatedMutation(neutralState, USER_A, false, prev => ({
      ...prev,
      safetyReserveDesired: 9999
    }));
    expect(blockedNotHydrated).toBe(neutralState);

    const blockedLoggedOut = applyAuthenticatedMutation(makeUserState(USER_A, 'A', 100), null, true, prev => ({
      ...prev,
      safetyReserveDesired: 9999
    }));
    expect(blockedLoggedOut.safetyReserveDesired).toBe(1000);

    // Gravação direta para usuário errado ou estado sem ownerUserId deve ser recusada mesmo com sessão ativa
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: USER_A } } as any },
      error: null
    });

    const unownedState: AppState = {
      ...createCleanUserState(USER_A),
      ownerUserId: undefined
    };
    expect(hasConfirmedStateOwnership(unownedState, USER_A)).toBe(false);

    const saveUnowned = await saveFinanceDataToSupabase(unownedState, USER_A);
    expect(saveUnowned.success).toBe(false);
    expect(saveUnowned.message).toContain('propriedade confirmada');

    const saveCrossUser = await saveFinanceDataToSupabase(makeUserState(USER_B, 'TESTE CONTA B', 100), USER_A);
    expect(saveCrossUser.success).toBe(false);
    expect(saveCrossUser.message).toContain('propriedade confirmada');

    // Tentativa de gravar no storage local de A usando estado marcado com proprietário B é bloqueada
    expect(saveStateToStorageForUser(USER_A, makeUserState(USER_B, 'TESTE CONTA B', 100))).toBe(false);
  });

  it('J: Dados legados (finance_pro_app_state_v1) são preservados intactos e nunca importados automaticamente para novas contas', async () => {
    const legacyPayload: AppState = {
      version: 5,
      lastModified: 1700009999999,
      transactions: [
        {
          id: 'tx-legacy-1',
          description: 'Registro Histórico Legado',
          amount: 12345.67,
          type: 'income',
          category: 'Salário',
          date: '2026-10-01',
          paymentMethod: 'pix',
          status: 'paid'
        }
      ],
      categories: DEFAULT_CATEGORIES,
      accounts: [{ id: 'acc-legacy', name: 'Conta Legada', type: 'checking', balance: 12345.67, color: '#000' }],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 5000,
      isSampleLoaded: false
    };

    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyPayload));
    const uploadSpy = vi.fn();

    // Nova Conta A (sem registro ainda no Supabase) faz login
    const resNewAccount = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: getUserStateFromStorage(USER_A),
      fetchRemote: async () => ({ success: true, data: undefined }),
      uploadLocal: uploadSpy
    });

    // Não importou automaticamente e não enviou para a nuvem
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(resNewAccount.hydrated).toBe(true);
    expect(resNewAccount.state.transactions).toHaveLength(0);
    expect(JSON.stringify(resNewAccount.state)).not.toContain('Registro Histórico Legado');

    // Chave legada sem ownerUserId comprovado permanece preservada, porém bloqueada para visualização/exportação
    const blockedInspectionA = inspectLegacyStorageState(USER_A);
    expect(blockedInspectionA.summary.exists).toBe(true);
    expect(blockedInspectionA.summary.ownershipVerified).toBe(false);
    expect(blockedInspectionA.summary.accessBlocked).toBe(true);
    expect(blockedInspectionA.summary.requiresAdminRecovery).toBe(true);
    expect(blockedInspectionA.summary.transactionsCount).toBe(0);
    expect(blockedInspectionA.state).toBeNull();
    expect(exportLegacyStorageJson(USER_A)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toContain('Registro Histórico Legado');

    // Quando a chave legada possui ownerUserId explícito de A, apenas A pode inspecionar/exportar; B segue bloqueado
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...legacyPayload, ownerUserId: USER_A }));
    const ownedInspectionA = inspectLegacyStorageState(USER_A);
    expect(ownedInspectionA.summary.ownershipVerified).toBe(true);
    expect(ownedInspectionA.summary.accessBlocked).toBe(false);
    expect(ownedInspectionA.summary.transactionsCount).toBe(1);
    expect(ownedInspectionA.state?.ownerUserId).toBe(USER_A);
    expect(exportLegacyStorageJson(USER_A)).toContain('Registro Histórico Legado');

    const blockedInspectionB = inspectLegacyStorageState(USER_B);
    expect(blockedInspectionB.summary.accessBlocked).toBe(true);
    expect(blockedInspectionB.state).toBeNull();
    expect(exportLegacyStorageJson(USER_B)).toBeNull();

    // Recusa migração automática de estado demonstrativo não editado
    const uneditedSample: AppState = {
      ...createCleanUserState(USER_A),
      lastModified: 0,
      isSampleLoaded: true
    };
    const blockedMigration = await migrateAndVerifyFinanceData(uneditedSample, USER_A);
    expect(blockedMigration.success).toBe(false);
    expect(blockedMigration.message).toContain('demonstrativos');

    // Snapshot de recuperação individual permanece estritamente isolado por usuário
    saveRecoverySnapshotForUser(USER_A, makeUserState(USER_A, 'Backup A', 250), 'teste');
    expect(localMock._dump()[`finance_pro_recovery_${USER_A}`]).toContain('Backup A');
    expect(localMock._dump()[`finance_pro_recovery_${USER_B}`]).toBeUndefined();

    // fetchFinanceDataFromSupabase rejeita caso o registro retornado tenha user_id divergente
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: USER_A } } as any },
      error: null
    });
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: USER_B, data: makeUserState(USER_B, 'Intruso', 1), version: 1, client_timestamp: 100 },
            error: null
          })
        }))
      }))
    } as any);
    const fetchedMismatch = await fetchFinanceDataFromSupabase(USER_A);
    expect(fetchedMismatch.success).toBe(false);
    expect(fetchedMismatch.message).toContain('divergência de proprietário');
  });
});
