/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getRecoverySnapshotForUser,
  getUserStateFromStorage,
  resetToCleanStateForUser,
  resetToSampleStateForUser,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  evaluateBackupRestorationSafety,
  evaluateManualCloudUploadSafety,
  hasRealFinancialData,
  validateBackupJsonStructure
} from '../utils/backupSecurity';
import {
  fetchFinanceDataFromSupabase,
  saveFinanceDataToSupabase,
  SyncResult
} from '../services/supabaseSyncService';
import { supabase } from '../utils/supabase';

const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: maybeSingleMock
          }))
        })),
        upsert: upsertMock
      }))
    },
    SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
  };
});

// Mock de localStorage para ambiente Node do Vitest
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

function createValidUserState(
  ownerUserId: string,
  overrides: Partial<AppState> = {}
): AppState {
  return {
    ownerUserId,
    version: 3,
    lastModified: 1700000300000,
    transactions: [
      {
        id: 'tx-1',
        description: 'Salário Mensal',
        amount: 4500,
        type: 'income',
        category: 'Salário',
        date: '2026-11-05',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Corrente',
        type: 'checking',
        balance: 4500,
        color: '#3b82f6',
        institution: 'Banco Teste'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Principal',
        color: '#6366f1',
        limitTotal: 3000,
        closingDay: 20,
        dueDay: 27
      }
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Empréstimo Teste',
        creditor: 'Banco X',
        originalAmount: 2000,
        currentBalance: 1000,
        contractDate: '2026-01-10',
        dueDate: '2026-12-10',
        priority: 'medium',
        status: 'in_payment',
        totalPaid: 1000
      }
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Reserva',
        targetAmount: 10000,
        currentAmount: 2500,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 500,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: 1500,
    isSampleLoaded: false,
    ...overrides
  };
}

describe('Segurança P0 de Backup, Restauração, Sincronização Manual e Ações Destrutivas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: { id: USER_A, email: 'usuarioa@teste.com' }
        }
      },
      error: null
    });
  });

  it('1. Valida backup legítimo da própria conta e gera prévia exata sem modificar estado ou nuvem', () => {
    const validState = createValidUserState(USER_A, { version: 5, lastModified: 1700000500000 });
    const rawJson = JSON.stringify(validState);

    const validation = validateBackupJsonStructure(rawJson, USER_A);

    expect(validation.valid).toBe(true);
    expect(validation.code).toBe('ok');
    expect(validation.ownerUserId).toBe(USER_A);
    expect(validation.version).toBe(5);
    expect(validation.lastModified).toBe(1700000500000);
    expect(validation.counts).toEqual({
      transactions: 1,
      categories: DEFAULT_CATEGORIES.length,
      accounts: 1,
      creditCards: 1,
      debts: 1,
      goals: 1
    });

    // Não deve tocar em localStorage nem em Supabase durante a validação
    expect(getUserStateFromStorage(USER_A)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();

    const safety = evaluateBackupRestorationSafety({
      backupState: validation.state!,
      currentLocalState: createValidUserState(USER_A, { version: 4, lastModified: 1700000400000 }),
      remoteResult: {
        success: true,
        data: createValidUserState(USER_A, { version: 4, lastModified: 1700000400000 }),
        version: 4,
        clientTimestamp: 1700000400000
      },
      expectedUserId: USER_A
    });

    expect(safety.allowed).toBe(true);
    expect(safety.reasonCode).toBe('ok');
  });

  it('2. Rejeita backup pertencente a outro usuário ou sem ownerUserId sem reescrever propriedade', () => {
    const otherUserBackup = createValidUserState(USER_B);
    const mismatchRes = validateBackupJsonStructure(JSON.stringify(otherUserBackup), USER_A);

    expect(mismatchRes.valid).toBe(false);
    expect(mismatchRes.code).toBe('owner_mismatch');
    expect(mismatchRes.state).toBeUndefined();

    const missingOwnerBackup = { ...createValidUserState(USER_A), ownerUserId: undefined };
    const missingRes = validateBackupJsonStructure(JSON.stringify(missingOwnerBackup), USER_A);

    expect(missingRes.valid).toBe(false);
    expect(missingRes.code).toBe('missing_owner');
    expect(missingRes.state).toBeUndefined();
  });

  it('3. Rejeita JSON malformado, estrutura incompleta ou itens com tipos incompatíveis', () => {
    const malformed = validateBackupJsonStructure('{ json_quebrado', USER_A);
    expect(malformed.valid).toBe(false);
    expect(malformed.code).toBe('invalid_json');

    const incomplete = createValidUserState(USER_A) as any;
    delete incomplete.creditCards;
    const missingSection = validateBackupJsonStructure(JSON.stringify(incomplete), USER_A);
    expect(missingSection.valid).toBe(false);
    expect(missingSection.code).toBe('invalid_structure');

    const invalidReserve = createValidUserState(USER_A, { safetyReserveDesired: -50 });
    const badReserveRes = validateBackupJsonStructure(JSON.stringify(invalidReserve), USER_A);
    expect(badReserveRes.valid).toBe(false);
    expect(badReserveRes.code).toBe('invalid_structure');

    const incompatibleCard = createValidUserState(USER_A);
    incompatibleCard.creditCards[0].closingDay = 45; // dia inválido (> 31)
    const badCardRes = validateBackupJsonStructure(JSON.stringify(incompatibleCard), USER_A);
    expect(badCardRes.valid).toBe(false);
    expect(badCardRes.code).toBe('incompatible_item');

    const incompatibleTx = createValidUserState(USER_A) as any;
    incompatibleTx.transactions[0].amount = -100;
    const badTxRes = validateBackupJsonStructure(JSON.stringify(incompatibleTx), USER_A);
    expect(badTxRes.valid).toBe(false);
    expect(badTxRes.code).toBe('incompatible_item');
  });

  it('4. Bloqueia restauração quando a nuvem Supabase está indisponível', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network timeout', code: '503' }
    });

    const remoteResult = await fetchFinanceDataFromSupabase(USER_A);
    expect(remoteResult.success).toBe(false);

    const backupState = createValidUserState(USER_A, { version: 5, lastModified: 1700000500000 });
    const safety = evaluateBackupRestorationSafety({
      backupState,
      currentLocalState: createValidUserState(USER_A),
      remoteResult,
      expectedUserId: USER_A
    });

    expect(safety.allowed).toBe(false);
    expect(safety.reasonCode).toBe('cloud_unavailable');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('5. Bloqueia restauração de backup mais antigo, versão inferior ou em conflito sem usar Date.now()', () => {
    const oldBackup = createValidUserState(USER_A, {
      version: 4,
      lastModified: 1700000400000,
      transactions: []
    });
    const newerCloud = createValidUserState(USER_A, {
      version: 6,
      lastModified: 1700000600000
    });

    const outdatedByVersion = evaluateBackupRestorationSafety({
      backupState: oldBackup,
      currentLocalState: newerCloud,
      remoteResult: {
        success: true,
        data: newerCloud,
        version: 6,
        clientTimestamp: 1700000600000
      },
      expectedUserId: USER_A
    });

    expect(outdatedByVersion.allowed).toBe(false);
    expect(outdatedByVersion.reasonCode).toBe('outdated_version');
    // Garante que o timestamp autêntico do backup não foi substituído por Date.now()
    expect(outdatedByVersion.backupTimestamp).toBe(1700000400000);

    const sameVersionOlderTs = createValidUserState(USER_A, {
      version: 6,
      lastModified: 1700000200000,
      transactions: []
    });
    const outdatedByTs = evaluateBackupRestorationSafety({
      backupState: sameVersionOlderTs,
      currentLocalState: newerCloud,
      remoteResult: {
        success: true,
        data: newerCloud,
        version: 6,
        clientTimestamp: 1700000600000
      },
      expectedUserId: USER_A
    });
    expect(outdatedByTs.allowed).toBe(false);
    expect(outdatedByTs.reasonCode).toBe('older_than_cloud');

    // Mesmo timestamp e mesma versão, mas conteúdo financeiro diferente -> conflito bloqueado
    const divergentSameTs = createValidUserState(USER_A, {
      version: 6,
      lastModified: 1700000600000,
      safetyReserveDesired: 9999
    });
    const conflictDecision = evaluateBackupRestorationSafety({
      backupState: divergentSameTs,
      currentLocalState: newerCloud,
      remoteResult: {
        success: true,
        data: newerCloud,
        version: 6,
        clientTimestamp: 1700000600000
      },
      expectedUserId: USER_A
    });
    expect(conflictDecision.allowed).toBe(false);
    expect(conflictDecision.reasonCode).toBe('cloud_conflict');
  });

  it('6. Cancelamento ou validação sem confirmação preserva integralmente o estado atual, localStorage e nuvem', () => {
    const existingLocal = createValidUserState(USER_A, { version: 5, lastModified: 1700000500000 });
    saveStateToStorageForUser(USER_A, existingLocal);

    const newerBackup = createValidUserState(USER_A, {
      version: 7,
      lastModified: 1700000700000,
      safetyReserveDesired: 3200
    });

    // Apenas inspeciona/valida (usuário ainda não confirmou ou clicou Cancelar)
    const validation = validateBackupJsonStructure(JSON.stringify(newerBackup), USER_A);
    expect(validation.valid).toBe(true);

    const storedAfterInspect = getUserStateFromStorage(USER_A);
    expect(storedAfterInspect?.version).toBe(5);
    expect(storedAfterInspect?.safetyReserveDesired).toBe(1500);
    expect(getRecoverySnapshotForUser(USER_A)).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('7. Isolamento multiusuário: snapshot de recuperação e cache são escopados por usuário e bloqueiam envio cruzado', async () => {
    const stateA = createValidUserState(USER_A);
    saveStateToStorageForUser(USER_A, stateA);
    saveRecoverySnapshotForUser(USER_A, stateA, 'pre_json_import');

    expect(getUserStateFromStorage(USER_B)).toBeNull();
    expect(getRecoverySnapshotForUser(USER_B)).toBeNull();

    // Sessão ativa é USER_A, tentativa de gravar estado de USER_B no Supabase é bloqueada
    const stateB = createValidUserState(USER_B);
    const crossSave = await saveFinanceDataToSupabase(stateB, USER_A);
    expect(crossSave.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('8. Proteção de ações destrutivas: dados demonstrativos não recebem timestamp ativo e são bloqueados sobre dados reais', () => {
    const realState = createValidUserState(USER_A);
    expect(hasRealFinancialData(realState)).toBe(true);

    // Estado demonstrativo deve nascer com lastModified: 0 para não auto-sincronizar sobre dados reais
    const sampleState = resetToSampleStateForUser(USER_A, 3);
    expect(sampleState.isSampleLoaded).toBe(true);
    expect(sampleState.lastModified).toBe(0);
    expect(hasRealFinancialData(sampleState)).toBe(false);

    // Reset limpo cria estado vazio preservando ownerUserId e incrementando versão
    const cleanState = resetToCleanStateForUser(USER_A, 3);
    expect(cleanState.ownerUserId).toBe(USER_A);
    expect(cleanState.transactions).toEqual([]);
    expect(cleanState.version).toBe(4);
    expect(cleanState.isSampleLoaded).toBe(false);
  });

  it('9. Revisão da sincronização manual (forceUploadLocalToCloud): bloqueia conflito e nuvem mais recente antes de gravar', () => {
    const localOlder = createValidUserState(USER_A, {
      version: 4,
      lastModified: 1700000400000
    });
    const remoteNewer = createValidUserState(USER_A, {
      version: 5,
      lastModified: 1700000500000,
      safetyReserveDesired: 4000
    });

    const remoteNewerResult: SyncResult = {
      success: true,
      data: remoteNewer,
      version: 5,
      clientTimestamp: 1700000500000
    };

    const blockedNewer = evaluateManualCloudUploadSafety({
      localState: localOlder,
      remoteResult: remoteNewerResult,
      expectedUserId: USER_A
    });

    expect(blockedNewer.allowed).toBe(false);
    expect(blockedNewer.conflict).toBe(true);
    expect(blockedNewer.reasonCode).toBe('remote_newer');

    // Igualdade de conteúdo não sobrescreve desnecessariamente
    const identicalDecision = evaluateManualCloudUploadSafety({
      localState: remoteNewer,
      remoteResult: remoteNewerResult,
      expectedUserId: USER_A
    });
    expect(identicalDecision.allowed).toBe(false);
    expect(identicalDecision.alreadySynced).toBe(true);
    expect(identicalDecision.conflict).toBe(false);

    // Mesmo timestamp com conteúdos divergentes é bloqueado como conflito
    const localSameTsDivergent = createValidUserState(USER_A, {
      version: 5,
      lastModified: 1700000500000,
      safetyReserveDesired: 8888
    });
    const tieConflict = evaluateManualCloudUploadSafety({
      localState: localSameTsDivergent,
      remoteResult: remoteNewerResult,
      expectedUserId: USER_A
    });
    expect(tieConflict.allowed).toBe(false);
    expect(tieConflict.conflict).toBe(true);
    expect(tieConflict.reasonCode).toBe('remote_conflict');

    // Estado demonstrativo sem edição real é bloqueado sobre dados reais na nuvem
    const uneditedSample = resetToSampleStateForUser(USER_A, 6);
    const sampleBlocked = evaluateManualCloudUploadSafety({
      localState: uneditedSample,
      remoteResult: remoteNewerResult,
      expectedUserId: USER_A
    });
    expect(sampleBlocked.allowed).toBe(false);
    expect(sampleBlocked.reasonCode).toBe('sample_blocked');

    // Estado local comprovadamente mais recente que a nuvem é autorizado
    const localActuallyNewer = createValidUserState(USER_A, {
      version: 6,
      lastModified: 1700000600000,
      safetyReserveDesired: 5000
    });
    const allowedUpload = evaluateManualCloudUploadSafety({
      localState: localActuallyNewer,
      remoteResult: remoteNewerResult,
      expectedUserId: USER_A
    });
    expect(allowedUpload.allowed).toBe(true);
    expect(allowedUpload.conflict).toBe(false);
    expect(allowedUpload.reasonCode).toBe('ok');
  });
});
