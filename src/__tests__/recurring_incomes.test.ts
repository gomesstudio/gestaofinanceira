/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addMonthsToPeriod,
  addRecurringIncomeRuleToState,
  calculateRecurringIncomeAnnualTotal,
  confirmRecurringIncomeReceiptInState,
  deleteRecurringIncomeRuleInState,
  endRecurringIncomeInState,
  getEffectiveRuleValuesForPeriod,
  getRecurringIncomesForMonth,
  resolveClampedDateForPeriod,
  resolveRecurringIncomeOccurrence,
  skipRecurringIncomeOccurrenceInState,
  unskipRecurringIncomeOccurrenceInState,
  updateRecurringIncomeInState
} from '../utils/recurringIncome';
import {
  AppState,
  DEFAULT_CATEGORIES,
  createCleanUserState,
  getUserStateFromStorage,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  evaluateBackupRestorationSafety,
  hasRealFinancialData,
  validateBackupJsonStructure
} from '../utils/backupSecurity';
import { areStatesContentEqual } from '../services/supabaseSyncService';
import { applyAuthenticatedMutation } from '../context/FinanceContext';

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

function makeBaseState(ownerUserId = USER_A, initialBalance = 1500): AppState {
  return {
    ownerUserId,
    version: 1,
    lastModified: 1700000000000,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-main',
        name: 'Conta Principal',
        type: 'checking',
        balance: initialBalance,
        color: '#059669'
      },
      {
        id: 'acc-alt',
        name: 'Conta Poupança',
        type: 'savings',
        balance: 500,
        color: '#2563eb'
      }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    recurringIncomes: [],
    safetyReserveDesired: 3000,
    isSampleLoaded: false
  };
}

describe('Receitas Fixas Recorrentes — Motor, Integridade Financeira e Backup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Cenário 1: cria regra mensal indeterminada sem gerar dezenas de transações antecipadas nem alterar saldo atual', () => {
    const base = makeBaseState(USER_A, 1500);
    const { state, rule, initialTransaction } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Salário Empresa X',
        amount: 6000,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 5,
        startDate: '2026-12-05',
        isIndefinite: true,
        firstOccurrenceStatus: 'paid', // Mesmo que solicitado como pago, início futuro NÃO pode efetivar!
        notes: 'Salário líquido mensal'
      },
      '2026-11-25'
    );

    expect(initialTransaction).toBeUndefined();
    expect(state.recurringIncomes).toHaveLength(1);
    expect(state.transactions).toHaveLength(0);
    expect(state.accounts[0].balance).toBe(1500);
    expect(rule.isIndefinite).toBe(true);
    expect(rule.startPeriod).toBe('2026-12');
    expect(calculateRecurringIncomeAnnualTotal(rule, '2026-12')).toBe(72000);
  });

  it('Cenário 2: projeta dinamicamente ocorrências em múltiplos meses consecutivos sem criar transações duplicadas', () => {
    const base = makeBaseState(USER_A, 1000);
    const { state, rule } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Aposentadoria INSS',
        amount: 4200,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 2,
        startDate: '2026-11-02',
        isIndefinite: true,
        firstOccurrenceStatus: 'pending'
      },
      '2026-11-01'
    );

    const nov = getRecurringIncomesForMonth(state.recurringIncomes, 2026, 10, state.transactions, '2026-11-01');
    const dec = getRecurringIncomesForMonth(state.recurringIncomes, 2026, 11, state.transactions, '2026-11-01');
    const mar27 = getRecurringIncomesForMonth(state.recurringIncomes, 2027, 2, state.transactions, '2026-11-01');

    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({
      ruleId: rule.id,
      date: '2026-11-02',
      amount: 4200,
      status: 'predicted',
      isVirtual: true
    });
    expect(dec[0]).toMatchObject({
      date: '2026-12-02',
      amount: 4200,
      status: 'predicted',
      isVirtual: true
    });
    expect(mar27[0]).toMatchObject({
      date: '2027-03-02',
      amount: 4200,
      status: 'predicted',
      isVirtual: true
    });
    expect(state.transactions).toHaveLength(0);
  });

  it('Cenário 3: transição correta na virada de ano (Dezembro -> Janeiro -> Fevereiro)', () => {
    expect(addMonthsToPeriod('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToPeriod('2026-12', 2)).toBe('2027-02');
    expect(addMonthsToPeriod('2027-01', -1)).toBe('2026-12');

    const base = makeBaseState(USER_A);
    const { state } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Aluguel Recebido Imóvel',
        amount: 2500,
        category: 'Renda Extra',
        accountId: 'acc-main',
        paymentMethod: 'pix',
        dayOfMonth: 10,
        startDate: '2026-12-10',
        isIndefinite: true
      },
      '2026-11-25'
    );

    const nov = getRecurringIncomesForMonth(state.recurringIncomes, 2026, 10, state.transactions, '2026-11-25');
    const dec = getRecurringIncomesForMonth(state.recurringIncomes, 2026, 11, state.transactions, '2026-11-25');
    const jan = getRecurringIncomesForMonth(state.recurringIncomes, 2027, 0, state.transactions, '2026-11-25');
    const feb = getRecurringIncomesForMonth(state.recurringIncomes, 2027, 1, state.transactions, '2026-11-25');

    expect(nov).toHaveLength(0);
    expect(dec[0].date).toBe('2026-12-10');
    expect(jan[0].date).toBe('2027-01-10');
    expect(feb[0].date).toBe('2027-02-10');
  });

  it('Cenário 4: ajuste de meses curtos (dias 29, 30 e 31) sem sobrescrever o dia configurado na regra', () => {
    expect(resolveClampedDateForPeriod('2027-02', 31)).toBe('2027-02-28');
    expect(resolveClampedDateForPeriod('2028-02', 31)).toBe('2028-02-29'); // Ano bissexto
    expect(resolveClampedDateForPeriod('2028-02', 29)).toBe('2028-02-29');
    expect(resolveClampedDateForPeriod('2027-02', 29)).toBe('2027-02-28');
    expect(resolveClampedDateForPeriod('2027-04', 31)).toBe('2027-04-30');
    expect(resolveClampedDateForPeriod('2027-03', 31)).toBe('2027-03-31');

    const base = makeBaseState(USER_A);
    const { state, rule } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Pró-labore Dia 31',
        amount: 8000,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 31,
        startDate: '2027-01-31',
        isIndefinite: true
      },
      '2026-11-25'
    );

    const feb27 = resolveRecurringIncomeOccurrence(rule, '2027-02', state.transactions, '2026-11-25');
    const mar27 = resolveRecurringIncomeOccurrence(rule, '2027-03', state.transactions, '2026-11-25');
    const apr27 = resolveRecurringIncomeOccurrence(rule, '2027-04', state.transactions, '2026-11-25');
    const feb28 = resolveRecurringIncomeOccurrence(rule, '2028-02', state.transactions, '2026-11-25');

    expect(feb27?.date).toBe('2027-02-28');
    expect(feb27?.configuredDayOfMonth).toBe(31);
    expect(mar27?.date).toBe('2027-03-31');
    expect(apr27?.date).toBe('2027-04-30');
    expect(feb28?.date).toBe('2028-02-29');
    expect(state.recurringIncomes?.[0].dayOfMonth).toBe(31);
  });

  it('Cenário 5: receita com prazo determinado para automaticamente após a data final', () => {
    const base = makeBaseState(USER_A);
    const { state, rule } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Consultoria Temporária',
        amount: 3500,
        category: 'Freelance',
        accountId: 'acc-main',
        paymentMethod: 'pix',
        dayOfMonth: 15,
        startDate: '2026-11-15',
        isIndefinite: false,
        endDate: '2027-01-20'
      },
      '2026-11-01'
    );

    expect(resolveRecurringIncomeOccurrence(rule, '2026-11', state.transactions, '2026-11-01')).not.toBeNull();
    expect(resolveRecurringIncomeOccurrence(rule, '2026-12', state.transactions, '2026-11-01')).not.toBeNull();
    expect(resolveRecurringIncomeOccurrence(rule, '2027-01', state.transactions, '2026-11-01')).not.toBeNull();
    expect(resolveRecurringIncomeOccurrence(rule, '2027-02', state.transactions, '2026-11-01')).toBeNull();
    expect(calculateRecurringIncomeAnnualTotal(rule, '2026-11')).toBe(10500); // 3 meses apenas
  });

  it('Cenário 6: separação rigorosa — ocorrência vencida NÃO é marcada automaticamente como recebida', () => {
    const base = makeBaseState(USER_A, 1200);
    const { state, rule } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Pensão Alimentícia',
        amount: 1800,
        category: 'Outros Ganhos',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 10,
        startDate: '2026-11-10',
        isIndefinite: true,
        firstOccurrenceStatus: 'pending'
      },
      '2026-11-01'
    );

    // Avalia no dia 25/11: o dia 10/11 já passou, mas o usuário NÃO confirmou recebimento
    const occNov = resolveRecurringIncomeOccurrence(rule, '2026-11', state.transactions, '2026-11-25');
    expect(occNov).not.toBeNull();
    expect(occNov?.status).toBe('overdue');
    expect(occNov?.isVirtual).toBe(true);
    expect(state.transactions).toHaveLength(0);
    expect(state.accounts[0].balance).toBe(1200);
  });

  it('Cenário 7: confirmar recebimento real com ajuste de valor/data credita conta uma única vez sem duplicidade', () => {
    const base = makeBaseState(USER_A, 1000);
    const created = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Salário Líquido',
        amount: 5000,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 5,
        startDate: '2026-11-05',
        isIndefinite: true,
        firstOccurrenceStatus: 'pending'
      },
      '2026-11-01'
    );

    const confirmed = confirmRecurringIncomeReceiptInState(created.state, {
      ruleId: created.rule.id,
      period: '2026-11',
      actualAmount: 5250.75,
      actualDate: '2026-11-06',
      accountId: 'acc-main',
      notes: 'Incluiu adicional de horas'
    });

    expect(confirmed.transaction).toBeDefined();
    expect(confirmed.transaction?.status).toBe('paid');
    expect(confirmed.transaction?.amount).toBe(5250.75);
    expect(confirmed.transaction?.date).toBe('2026-11-06');
    expect(confirmed.state.accounts[0].balance).toBe(6250.75);

    // Reconfirmar o mesmo período ajusta em vez de duplicar
    const reconfirmed = confirmRecurringIncomeReceiptInState(confirmed.state, {
      ruleId: created.rule.id,
      period: '2026-11',
      actualAmount: 5300,
      actualDate: '2026-11-06',
      accountId: 'acc-main'
    });
    expect(reconfirmed.state.transactions.filter((t) => t.recurringPeriod === '2026-11')).toHaveLength(1);
    expect(reconfirmed.state.accounts[0].balance).toBe(6300);

    // O mês de novembro aparece exatamente 1x em getRecurringIncomesForMonth (status 'received', isVirtual: false)
    const novOccs = getRecurringIncomesForMonth(
      reconfirmed.state.recurringIncomes,
      2026,
      10,
      reconfirmed.state.transactions,
      '2026-11-25'
    );
    expect(novOccs).toHaveLength(1);
    expect(novOccs[0].status).toBe('received');
    expect(novOccs[0].isVirtual).toBe(false);
    expect(novOccs[0].amount).toBe(5300);

    // Dezembro continua previsto com o valor base da regra (5000)
    const decOccs = getRecurringIncomesForMonth(
      reconfirmed.state.recurringIncomes,
      2026,
      11,
      reconfirmed.state.transactions,
      '2026-11-25'
    );
    expect(decOccs).toHaveLength(1);
    expect(decOccs[0].status).toBe('predicted');
    expect(decOccs[0].amount).toBe(5000);
  });

  it('Cenário 8: edição isolada (scope = single) altera somente o mês escolhido', () => {
    const base = makeBaseState(USER_A);
    const created = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Aluguel Recebido',
        amount: 2000,
        category: 'Renda Extra',
        accountId: 'acc-main',
        paymentMethod: 'pix',
        dayOfMonth: 10,
        startDate: '2026-11-10',
        isIndefinite: true
      },
      '2026-11-01'
    );

    const updated = updateRecurringIncomeInState(created.state, {
      ruleId: created.rule.id,
      targetPeriod: '2026-12',
      scope: 'single',
      updates: {
        amount: 2350,
        customDate: '2026-12-12',
        notes: 'Reajuste pontual condomínio'
      }
    });

    const rule = updated.recurringIncomes![0];
    const nov = resolveRecurringIncomeOccurrence(rule, '2026-11', updated.transactions, '2026-11-01');
    const dec = resolveRecurringIncomeOccurrence(rule, '2026-12', updated.transactions, '2026-11-01');
    const jan = resolveRecurringIncomeOccurrence(rule, '2027-01', updated.transactions, '2026-11-01');

    expect(nov?.amount).toBe(2000);
    expect(dec?.amount).toBe(2350);
    expect(dec?.date).toBe('2026-12-12');
    expect(jan?.amount).toBe(2000);
    expect(jan?.date).toBe('2027-01-10');
  });

  it('Cenário 9: edição futura (scope = future) aplica reajuste deste mês em diante preservando histórico anterior', () => {
    const base = makeBaseState(USER_A, 1000);
    const created = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Salário Base',
        amount: 5000,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 5,
        startDate: '2026-10-05',
        isIndefinite: true,
        firstOccurrenceStatus: 'paid'
      },
      '2026-10-10'
    );

    expect(created.state.accounts[0].balance).toBe(6000);

    // Reajuste salarial a partir de Dezembro/2026 para R$ 6.200 dia 7
    const revised = updateRecurringIncomeInState(created.state, {
      ruleId: created.rule.id,
      targetPeriod: '2026-12',
      scope: 'future',
      updates: {
        amount: 6200,
        dayOfMonth: 7,
        description: 'Salário Reajustado'
      }
    });

    const rule = revised.recurringIncomes![0];
    const oct = resolveRecurringIncomeOccurrence(rule, '2026-10', revised.transactions, '2026-11-25');
    const nov = resolveRecurringIncomeOccurrence(rule, '2026-11', revised.transactions, '2026-11-25');
    const dec = resolveRecurringIncomeOccurrence(rule, '2026-12', revised.transactions, '2026-11-25');
    const jan = resolveRecurringIncomeOccurrence(rule, '2027-01', revised.transactions, '2026-11-25');

    expect(oct?.status).toBe('received');
    expect(oct?.amount).toBe(5000);
    expect(nov?.amount).toBe(5000);
    expect(dec?.amount).toBe(6200);
    expect(dec?.date).toBe('2026-12-07');
    expect(dec?.description).toBe('Salário Reajustado');
    expect(jan?.amount).toBe(6200);
    expect(jan?.date).toBe('2027-01-07');
    expect(revised.accounts[0].balance).toBe(6000);
  });

  it('Cenário 10: pular um único mês e restaurar previsão preserva a regra recorrente intacta', () => {
    const base = makeBaseState(USER_A);
    const created = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Comissão Fixa',
        amount: 1200,
        category: 'Comissões',
        accountId: 'acc-main',
        paymentMethod: 'pix',
        dayOfMonth: 15,
        startDate: '2026-11-15',
        isIndefinite: true
      },
      '2026-11-01'
    );

    const skippedState = skipRecurringIncomeOccurrenceInState(created.state, created.rule.id, '2026-12');
    const decDefault = getRecurringIncomesForMonth(
      skippedState.recurringIncomes,
      2026,
      11,
      skippedState.transactions,
      '2026-11-01'
    );
    const decWithSkipped = getRecurringIncomesForMonth(
      skippedState.recurringIncomes,
      2026,
      11,
      skippedState.transactions,
      '2026-11-01',
      { includeSkipped: true }
    );
    const janDefault = getRecurringIncomesForMonth(
      skippedState.recurringIncomes,
      2027,
      0,
      skippedState.transactions,
      '2026-11-01'
    );

    expect(decDefault).toHaveLength(0);
    expect(decWithSkipped).toHaveLength(1);
    expect(decWithSkipped[0].status).toBe('skipped');
    expect(janDefault).toHaveLength(1);
    expect(calculateRecurringIncomeAnnualTotal(skippedState.recurringIncomes![0], '2026-11')).toBe(
      11 * 1200
    );

    const unskippedState = unskipRecurringIncomeOccurrenceInState(
      skippedState,
      created.rule.id,
      '2026-12'
    );
    const decRestored = getRecurringIncomesForMonth(
      unskippedState.recurringIncomes,
      2026,
      11,
      unskippedState.transactions,
      '2026-11-01'
    );
    expect(decRestored).toHaveLength(1);
    expect(decRestored[0].status).toBe('predicted');
  });

  it('Cenário 11: encerrar ou excluir recorrência interrompe previsões futuras e preserva histórico recebido', () => {
    const base = makeBaseState(USER_A, 500);
    const created = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Contrato Retainer',
        amount: 3000,
        category: 'Serviços Prestados',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 20,
        startDate: '2026-10-20',
        isIndefinite: true,
        firstOccurrenceStatus: 'paid'
      },
      '2026-10-25'
    );

    const ended = endRecurringIncomeInState(created.state, created.rule.id, '2026-12');
    const rule = ended.recurringIncomes![0];

    expect(rule.isActive).toBe(false);
    expect(resolveRecurringIncomeOccurrence(rule, '2026-10', ended.transactions, '2026-11-25')?.status).toBe(
      'received'
    );
    expect(resolveRecurringIncomeOccurrence(rule, '2026-11', ended.transactions, '2026-11-25')?.status).toBe(
      'overdue'
    );
    expect(resolveRecurringIncomeOccurrence(rule, '2026-12', ended.transactions, '2026-11-25')).toBeNull();
    expect(ended.accounts[0].balance).toBe(3500);

    const deleted = deleteRecurringIncomeRuleInState(ended, created.rule.id);
    expect(deleted.recurringIncomes).toHaveLength(0);
    expect(deleted.transactions).toHaveLength(1);
    expect(deleted.transactions[0].amount).toBe(3000);
    expect(deleted.transactions[0].recurringIncomeId).toBeUndefined();
    expect(deleted.accounts[0].balance).toBe(3500);
  });

  it('Cenário 13: backup JSON valida recurringIncomes, preserva round-trip e mantém compatibilidade com backups legados', () => {
    const base = makeBaseState(USER_A, 2000);
    const { state } = addRecurringIncomeRuleToState(
      base,
      {
        description: 'Salário Fixo',
        amount: 5500,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 5,
        startDate: '2026-11-05',
        isIndefinite: true
      },
      '2026-11-01'
    );

    expect(hasRealFinancialData(state)).toBe(true);

    const json = JSON.stringify(state);
    const validated = validateBackupJsonStructure(json, USER_A);
    expect(validated.valid).toBe(true);
    expect(validated.state?.recurringIncomes).toHaveLength(1);
    expect(validated.state?.recurringIncomes?.[0].description).toBe('Salário Fixo');
    expect(validated.state?.recurringIncomes?.[0].amount).toBe(5500);

    // Igualdade de conteúdo detecta diferença quando recurringIncomes muda
    const modified: AppState = {
      ...state,
      recurringIncomes: [
        {
          ...state.recurringIncomes![0],
          amount: 5900
        }
      ]
    };
    expect(areStatesContentEqual(state, state)).toBe(true);
    expect(areStatesContentEqual(state, modified)).toBe(false);

    // Backup legado sem o campo recurringIncomes continua válido e restaurável
    const legacyState: any = { ...base };
    delete legacyState.recurringIncomes;
    legacyState.transactions = [
      {
        id: 'tx-legacy-1',
        description: 'Entrada Legada',
        amount: 1000,
        type: 'income',
        category: 'Salário',
        date: '2026-10-05',
        accountId: 'acc-main',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ];
    const legacyValidation = validateBackupJsonStructure(JSON.stringify(legacyState), USER_A);
    expect(legacyValidation.valid).toBe(true);
    expect(legacyValidation.state?.recurringIncomes ?? []).toEqual([]);

    const safety = evaluateBackupRestorationSafety({
      backupState: validated.state!,
      currentLocalState: createCleanUserState(USER_A),
      remoteResult: { success: true, data: undefined },
      expectedUserId: USER_A
    });
    expect(safety.allowed).toBe(true);

    // Regra inválida no JSON deve ser rejeitada com segurança
    const invalidJson = JSON.stringify({
      ...state,
      recurringIncomes: [{ id: 'bad-rule', description: '', amount: -50 }]
    });
    const invalidValidation = validateBackupJsonStructure(invalidJson, USER_A);
    expect(invalidValidation.valid).toBe(false);
  });

  it('Cenário 14: isolamento estrito entre contas autenticadas (UUIDs diferentes não se misturam)', () => {
    const stateA = addRecurringIncomeRuleToState(
      makeBaseState(USER_A),
      {
        description: 'Receita Exclusiva A',
        amount: 7000,
        category: 'Salário',
        accountId: 'acc-main',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 5,
        startDate: '2026-11-05',
        isIndefinite: true
      },
      '2026-11-01'
    ).state;

    saveStateToStorageForUser(USER_A, stateA);

    const loadedA = getUserStateFromStorage(USER_A);
    const loadedB = getUserStateFromStorage(USER_B);

    expect(loadedA?.recurringIncomes).toHaveLength(1);
    expect(loadedB).toBeNull();

    // Mutação autenticada com owner divergente ou não hidratada é bloqueada
    const blockedCrossUser = applyAuthenticatedMutation(stateA, USER_B, true, (curr) => ({
      ...curr,
      recurringIncomes: []
    }));
    expect(blockedCrossUser).toBe(stateA);
    expect(blockedCrossUser.recurringIncomes).toHaveLength(1);

    const blockedUnhydrated = applyAuthenticatedMutation(stateA, USER_A, false, (curr) => ({
      ...curr,
      recurringIncomes: []
    }));
    expect(blockedUnhydrated).toBe(stateA);
  });
});
