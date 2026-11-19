// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  getSessionMock,
  refreshSessionMock,
  signInWithPasswordMock,
  signInWithOAuthMock,
  signInWithOtpMock,
  verifyOtpMock,
  updateUserMock,
  signOutMock,
  rpcMock,
  fromSelectMock,
  authStateListeners,
  financeCtxMock,
  mockAuthStateForUi
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
  rpcMock: vi.fn(),
  fromSelectMock: vi.fn(),
  authStateListeners: new Set<(event: string, session: any) => void>(),
  financeCtxMock: {
    transactions: [],
    debts: [],
    goals: [],
    categories: [],
    accounts: [],
    safetyReserveDesired: 0,
    setSafetyReserveDesired: vi.fn(),
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    loadSampleData: vi.fn(),
    exportBackupJson: vi.fn(),
    inspectBackupJsonForRestore: vi.fn(),
    applyConfirmedBackupRestore: vi.fn(),
    isSampleLoaded: false,
    cloudSyncStatus: 'table_missing' as any,
    cloudSyncMessage: 'A tabela "user_finance_data" precisa ser criada no Supabase com RLS.',
    lastCloudSyncDate: null as Date | null,
    syncNowWithCloud: vi.fn(),
    forceUploadLocalToCloud: vi.fn(async () => ({ success: true, conflict: false, message: 'OK' })),
    forceDownloadFromCloud: vi.fn(),
    runCloudDiagnostic: vi.fn(),
    legacyBackupPrompt: null,
    exportLegacyBackupFile: vi.fn(),
    importLegacyBackupToCurrentAccount: vi.fn(),
    dismissLegacyBackupPrompt: vi.fn(),
    requestSafeLogout: vi.fn(),
    filter: { period: 'current_month' },
    setFilter: vi.fn(),
    theme: 'dark' as const,
    toggleTheme: vi.fn(),
    openQuickEntry: vi.fn(),
    selectedYear: 2026,
    selectedMonth: 10,
    isFutureView: false,
    goToNextMonth: vi.fn(),
    goToPrevMonth: vi.fn(),
    goToCurrentMonth: vi.fn()
  },
  mockAuthStateForUi: {
    useRealContext: true,
    supabaseUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    supabaseUserEmail: 'usuario@ficticio.com',
    supabaseUserDisplayName: 'Usuário Comum'
  }
}));

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
      signInWithPassword: signInWithPasswordMock,
      signInWithOAuth: signInWithOAuthMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      updateUser: updateUserMock,
      signOut: signOutMock,
      setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, session: any) => void) => {
        authStateListeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => authStateListeners.delete(cb)
            }
          }
        };
      })
    },
    rpc: rpcMock,
    from: vi.fn(() => ({
      select: fromSelectMock
    }))
  },
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co'
}));

vi.mock('../context/FinanceContext', async () => {
  const actual = await vi.importActual<typeof import('../context/FinanceContext')>(
    '../context/FinanceContext'
  );
  return {
    ...actual,
    useFinance: () => financeCtxMock
  };
});

vi.mock('../utils/recoveryHistoryService', () => ({
  EMPTY_RECOVERY_HISTORY_MESSAGE: 'Nenhum ponto de recuperação disponível.',
  exportHybridRecoverySnapshot: vi.fn(),
  loadHybridRecoveryHistory: vi.fn(async () => ({
    items: [],
    totalDistinctCount: 0,
    extraOmittedCount: 0,
    indexedDbStatus: 'available',
    legacyStatus: 'empty',
    skippedCorruptedCount: 0,
    hasAnyWarning: false
  }))
}));

import {
  buildExcelWorkbook,
  exportToExcel,
  sanitizeExcelTextCell,
  ExportDataParams
} from '../utils/exportUtils';
import {
  AuthProvider,
  useAuth,
  AuthContextType
} from '../context/AuthContext';
import {
  resolveTechnicalAccessPermissions,
  sanitizeCloudSyncMessageForUser
} from '../utils/technicalAccess';
import { SettingsView } from '../components/settings/SettingsView';
import { Header } from '../components/layout/Header';
import { SubscriptionAccessState } from '../services/subscriptionService';

function createExportFixture(): ExportDataParams {
  return {
    periodLabel: '=CMD|\' /C calc\'!A0',
    transactions: [
      {
        id: '=tx-1',
        description: '=SUM(1,1)',
        amount: 2500,
        type: 'income',
        category: '+Salário',
        date: '2026-11-10',
        paymentMethod: '@Pix' as any,
        status: 'paid',
        accountId: 'acc-1',
        notes: '\t=HYPERLINK("http://evil.example","Clique")'
      },
      {
        id: '+tx-2',
        description: '-1+1',
        amount: -120.5,
        type: 'expense_fixed',
        category: '  =Moradia',
        date: '2026-11-12',
        dueDate: '\x00=IMPORTXML("http://evil")',
        paymentMethod: 'credit_card',
        status: 'paid',
        accountId: 'acc-1',
        creditCardId: 'card-1',
        notes: '\r\n+2+2'
      },
      {
        id: 'tx-3',
        description: 'Supermercado - Compra da Semana + Padaria @Pix',
        amount: 345.8,
        type: 'expense_variable',
        category: 'Alimentação',
        date: '2026-11-15',
        paymentMethod: 'debit_card',
        status: 'paid',
        accountId: 'acc-2',
        notes: 'Compra normal do mês'
      }
    ],
    accounts: [
      {
        id: 'acc-1',
        name: '@ContaPrincipal',
        type: 'checking',
        balance: -500,
        color: '#3b82f6'
      },
      {
        id: 'acc-2',
        name: 'Carteira Pessoal',
        type: 'cash',
        balance: 1200,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: '+CartaoBlack',
        limitTotal: 5000,
        closingDay: 10,
        dueDay: 17,
        color: '#0f172a',
        linkedAccountId: 'acc-1'
      }
    ],
    debts: [
      {
        id: 'debt-1',
        name: '=Emprestimo',
        creditor: '@BancoX',
        originalAmount: 1000,
        currentBalance: 400,
        totalPaid: 600,
        contractDate: '2026-01-01',
        dueDate: '2026-12-01',
        priority: 'high',
        status: 'in_payment',
        notes: '\n-SUM(1,2)'
      }
    ],
    goals: [
      {
        id: 'goal-1',
        name: '\t@Reserva',
        category: '=Emergencia',
        targetAmount: 10000,
        currentAmount: 2500,
        monthlyPlannedContribution: 500,
        deadlineDate: '2027-12-31',
        color: '#10b981'
      }
    ],
    kpis: {
      totalBankBalance: 700,
      totalIncome: 2500,
      totalExpense: 466.3,
      fixedExpense: 120.5,
      variableExpense: 345.8,
      activeDebts: 400,
      freeMoney: -250,
      committedPercent: 18.7,
      savedAmount: -100
    }
  };
}

describe('FASE 2.2 — Segurança das exportações Excel, URLs de Auth e restrição técnica', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  const originalUrl = window.location.href;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateListeners.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');

    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signOutMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValue({ data: [], error: null });
    fromSelectMock.mockReturnValue({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: null, error: null }))
      }))
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
    window.history.replaceState(null, '', new URL(originalUrl).pathname);
    vi.restoreAllMocks();
  });

  it('1. Exportação Excel neutraliza payloads de fórmula (=, +, -, @, tabulação, controle) em todas as abas e no arquivo .xlsx gerado', () => {
    expect(sanitizeExcelTextCell('=SUM(1,1)')).toBe("'=SUM(1,1)");
    expect(sanitizeExcelTextCell('+CMD|calc')).toBe("'+CMD|calc");
    expect(sanitizeExcelTextCell('-1+1')).toBe("'-1+1");
    expect(sanitizeExcelTextCell('@SUM(1,1)')).toBe("'@SUM(1,1)");
    expect(sanitizeExcelTextCell('\t=1+1')).toBe("'\t=1+1");
    expect(sanitizeExcelTextCell('\r\n+1+1')).toBe("'\r\n+1+1");
    expect(sanitizeExcelTextCell('\x00\x07=CMD()')).toBe("'=CMD()");
    expect(sanitizeExcelTextCell('   =HYPERLINK("a","b")')).toBe('\'   =HYPERLINK("a","b")');

    const fixture = createExportFixture();
    const { workbook, fileName } = buildExcelWorkbook(fixture);
    expect(fileName).toMatch(/^Controle_Financeiro_.*\.xlsx$/);
    expect(workbook.SheetNames).toHaveLength(9);

    // Serializa e relê o XLSX real para garantir que nenhuma célula tem fórmula (.f) ou payload ativo
    const binary = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsedWorkbook = XLSX.read(binary, { type: 'buffer' });

    for (const sheetName of parsedWorkbook.SheetNames) {
      const sheet = parsedWorkbook.Sheets[sheetName];
      for (const addr of Object.keys(sheet)) {
        if (addr.startsWith('!')) continue;
        const cell = sheet[addr] as XLSX.CellObject;
        expect(cell.f).toBeUndefined();
        if (cell.t === 's' && typeof cell.v === 'string') {
          expect(cell.v).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
          expect(cell.v).not.toMatch(/^[=+@\t\r\n]/);
          // O único '-' permitido sem escape é o marcador legítimo da app quando data/conta está ausente
          if (cell.v.startsWith('-')) {
            expect(cell.v).toBe('-');
          }
        }
      }
    }

    // Confirma que textos perigosos específicos ficaram escapados com apóstrofo literal
    const historyRows = XLSX.utils.sheet_to_json<any[]>(parsedWorkbook.Sheets['Histórico Completo'], {
      header: 1
    });
    expect(historyRows[1][0]).toBe("'=tx-1");
    expect(historyRows[1][3]).toBe("'=SUM(1,1)");
    expect(historyRows[1][4]).toBe("'+Salário");
    expect(historyRows[1][6]).toBe("'@Pix");
    expect(historyRows[1][8]).toBe("'@ContaPrincipal");
    expect(historyRows[1][10]).toBe('\'\t=HYPERLINK("http://evil.example","Clique")');
    expect(historyRows[2][3]).toBe("'-1+1");
    expect(historyRows[2][4]).toBe("'  =Moradia");
    expect(historyRows[2][9]).toBe("'+CartaoBlack");
  });

  it('2. Exportação Excel preserva números negativos, textos normais, datas e porcentagens sem mutar o estado original', () => {
    const fixture = createExportFixture();
    const originalSnapshot = JSON.stringify(fixture);

    const writeFileSpy = vi.fn();
    exportToExcel(fixture, writeFileSpy);
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    // Estado de origem permanece intacto
    expect(JSON.stringify(fixture)).toBe(originalSnapshot);

    const { workbook } = buildExcelWorkbook(fixture);
    const binary = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsedWorkbook = XLSX.read(binary, { type: 'buffer' });

    const summarySheet = parsedWorkbook.Sheets['Dashboard e Resumo'];
    const summaryRows = XLSX.utils.sheet_to_json<any[]>(summarySheet, { header: 1 });

    // KPIs numéricos negativos preservados como número
    const freeMoneyRow = summaryRows.find(r => r[0] === 'Dinheiro Livre Disponível (Poder de Compra)');
    expect(freeMoneyRow?.[1]).toBe(-250);
    const savedRow = summaryRows.find(r => r[0] === 'Economias no Período (Sobra)');
    expect(savedRow?.[1]).toBe(-100);
    const percentRow = summaryRows.find(r => r[0] === 'Percentual da Renda Comprometida (%)');
    expect(percentRow?.[1]).toBe('18.7%');

    // Conta com saldo negativo preservada como número negativo
    const accRow = summaryRows.find(r => r[0] === "'@ContaPrincipal");
    expect(accRow?.[2]).toBe(-500);

    // Texto normal em português preservado sem apóstrofo extra
    const historyRows = XLSX.utils.sheet_to_json<any[]>(parsedWorkbook.Sheets['Histórico Completo'], {
      header: 1
    });
    expect(historyRows[3][1]).toBe('15/11/2026');
    expect(historyRows[3][3]).toBe('Supermercado - Compra da Semana + Padaria @Pix');
    expect(historyRows[3][10]).toBe('Compra normal do mês');
  });

  it('3. Login Supabase com senha autentica e limpa estado sem expor credenciais', async () => {
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'cliente@ficticio.com' };
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user,
        session: { user, access_token: 'tok-login', refresh_token: 'ref-login', expires_at: 9999999999 }
      },
      error: null
    });

    let ctx!: AuthContextType;
    const Probe = () => {
      ctx = useAuth();
      return null;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    let res: any;
    await act(async () => {
      res = await ctx.loginWithSupabase('cliente@ficticio.com', 'senhaSegura123');
    });

    expect(res.success).toBe(true);
    expect(ctx.isSupabaseAuthenticated).toBe(true);
    expect(ctx.supabaseUserId).toBe(user.id);
  });

  it('4. Login GitHub OAuth e popup: limpa código/tokens da URL somente após getSession e mantém postMessage ao window.opener', async () => {
    const oauthUrl = '/?code=pkce_secret_code_123&state=csrf_state&view=dashboard#access_token=oauth_tok_secret&refresh_token=oauth_ref_secret&provider_token=gh_secret&token_type=bearer';
    window.history.replaceState(null, '', oauthUrl);

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const openerPostMessageMock = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage: openerPostMessageMock }
    });

    let urlSeenDuringGetSession = '';
    const oauthUser = { id: '22222222-2222-4222-8222-222222222222', email: 'gh@ficticio.com' };
    getSessionMock.mockImplementation(async () => {
      urlSeenDuringGetSession = window.location.href;
      return {
        data: {
          session: {
            user: oauthUser,
            access_token: 'oauth_tok_secret',
            refresh_token: 'oauth_ref_secret',
            expires_at: 9999999999
          }
        },
        error: null
      };
    });

    let ctx!: AuthContextType;
    const Probe = () => {
      ctx = useAuth();
      return null;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    // Durante getSession(), os parâmetros ainda estavam disponíveis para o Supabase
    expect(urlSeenDuringGetSession).toContain('code=pkce_secret_code_123');
    expect(urlSeenDuringGetSession).toContain('access_token=oauth_tok_secret');

    // Após getSession(), popup notificou o opener e a URL foi limpa
    expect(openerPostMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SUPABASE_AUTH_SUCCESS',
        userId: oauthUser.id
      }),
      window.location.origin
    );
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(window.location.search).toBe('?view=dashboard');
    expect(window.location.hash).toBe('');
    expect(ctx.isSupabaseAuthenticated).toBe(true);

    // Nenhum token ou código foi impresso em console
    const allConsoleArgs = [
      ...consoleLogSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls
    ].flat().join(' ');
    expect(allConsoleArgs).not.toContain('oauth_tok_secret');
    expect(allConsoleArgs).not.toContain('pkce_secret_code_123');
    expect(allConsoleArgs).not.toContain('gh_secret');

    Object.defineProperty(window, 'opener', { configurable: true, value: null });
  });

  it('5. Magic Link / OTP: envio, verificação e limpeza de token_hash na URL após retorno', async () => {
    window.history.replaceState(null, '', '/?token_hash=magic_hash_secret&type=magiclink');
    const otpUser = { id: '33333333-3333-4333-8333-333333333333', email: 'otp@ficticio.com' };

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: otpUser,
          access_token: 'magic_access',
          refresh_token: 'magic_refresh',
          expires_at: 9999999999
        }
      },
      error: null
    });

    signInWithOtpMock.mockResolvedValue({ error: null });
    verifyOtpMock.mockResolvedValue({
      data: {
        user: otpUser,
        session: {
          user: otpUser,
          access_token: 'magic_access',
          refresh_token: 'magic_refresh',
          expires_at: 9999999999
        }
      },
      error: null
    });

    let ctx!: AuthContextType;
    const Probe = () => {
      ctx = useAuth();
      return null;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    expect(window.location.search).toBe('');
    expect(ctx.isSupabaseAuthenticated).toBe(true);

    let sendRes: any;
    let verifyRes: any;
    await act(async () => {
      sendRes = await ctx.signInWithOtp('otp@ficticio.com');
      verifyRes = await ctx.verifyOtp('otp@ficticio.com', '123456');
    });

    expect(sendRes.success).toBe(true);
    expect(verifyRes.success).toBe(true);
  });

  it('6. Recuperação de senha: preserva isPasswordRecoveryMode mesmo após limpar tokens/type=recovery da URL e conclui updatePassword', async () => {
    window.history.replaceState(
      null,
      '',
      '/?type=recovery#access_token=rec_tok_secret&refresh_token=rec_ref_secret&type=recovery'
    );

    const recUser = { id: '44444444-4444-4444-8444-444444444444', email: 'rec@ficticio.com' };
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: recUser,
          access_token: 'rec_tok_secret',
          refresh_token: 'rec_ref_secret',
          expires_at: 9999999999
        }
      },
      error: null
    });
    updateUserMock.mockResolvedValue({ data: { user: recUser }, error: null });

    let ctx!: AuthContextType;
    const Probe = () => {
      ctx = useAuth();
      return null;
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    // URL foi limpa sem expor tokens nem type=recovery, mas o modo de recuperação segue ativo em estado
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(ctx.isPasswordRecoveryMode).toBe(true);

    let updateRes: any;
    await act(async () => {
      updateRes = await ctx.updatePassword('NovaSenha@2026');
    });

    expect(updateUserMock).toHaveBeenCalledWith({ password: 'NovaSenha@2026' });
    expect(updateRes.success).toBe(true);
    expect(ctx.isPasswordRecoveryMode).toBe(false);
  });

  it('7. Usuário comum e ambiente antes do SQL comercial não visualizam scripts SQL, nomes de tabelas, diagnósticos ou painel admin (nem com email/localStorage forjados)', async () => {
    // Simula tentativa local maliciosa de forjar privilégios antes das tabelas comerciais existirem
    localStorage.setItem('gfp_is_admin', 'true');
    localStorage.setItem('role', 'admin');

    const schemaMissingAccess: SubscriptionAccessState = {
      accessStatus: 'schema_not_deployed',
      hasAccess: false,
      isSchemaMissing: true,
      isAdmin: true, // mesmo inconsistente, isSchemaMissing bloqueia
      subscription: null,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Estrutura comercial (SQL Etapa C1) aguardando instalação.'
    };

    const perms = resolveTechnicalAccessPermissions({
      subscriptionAccess: schemaMissingAccess,
      isDev: false
    });
    expect(perms.isServerConfirmedAdmin).toBe(false);
    expect(perms.canViewAdminTools).toBe(false);
    expect(perms.canViewDevDiagnostics).toBe(false);

    expect(
      sanitizeCloudSyncMessageForUser(
        'A tabela "user_finance_data" precisa ser criada no Supabase com RLS.',
        false
      )
    ).not.toContain('user_finance_data');

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: {
            id: '55555555-5555-4555-8555-555555555555',
            email: 'lucasgomes3621@gmail.com',
            user_metadata: { role: 'admin', is_admin: true }
          },
          access_token: 'tok',
          refresh_token: 'ref',
          expires_at: 9999999999
        }
      },
      error: null
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <Header currentTab="settings" isMasterAdmin={false} />
          <SettingsView
            subscriptionAccess={schemaMissingAccess}
            isDevelopmentEnv={false}
          />
        </AuthProvider>
      );
    });

    const text = container.textContent || '';

    // Informações técnicas proibidas ao usuário comum
    expect(text).not.toContain('SUPABASE_SQL_SETUP');
    expect(text).not.toContain('CREATE TABLE');
    expect(text).not.toContain('user_finance_data');
    expect(text).not.toContain('auth.users');
    expect(text).not.toContain('auth.uid()');
    expect(text).not.toContain('Script SQL com RLS');
    expect(text).not.toContain('Copiar Código SQL');
    expect(text).not.toContain('Projeto Supabase Ativo');
    expect(text).not.toContain('Diagnóstico de Integridade');
    expect(text).not.toContain('Testar Conexão e Gravação');
    expect(text).not.toContain('Criar Tabela SQL');
    expect(text).not.toContain('Etapa C1');
    expect(text).not.toContain('Gerenciamento de Assinaturas');

    // Recursos legítimos do usuário comum permanecem disponíveis
    expect(text).toContain('Sincronização Direta');
    expect(text).toContain('Enviar');
    expect(text).toContain('Baixar');
    expect(text).toContain('Fazer Backup Completo');
    expect(text).toContain('Restaurar de Arquivo');
    expect(text).toContain('Alterar Senha');
    expect(text).toContain('Encerrar Sessão (Sair)');
  });

  it('8. Diagnóstico técnico permanece acessível somente em ambiente de desenvolvimento (isDev=true)', async () => {
    const userAccess: SubscriptionAccessState = {
      accessStatus: 'active',
      hasAccess: true,
      isSchemaMissing: false,
      isAdmin: false,
      subscription: {
        userId: '55555555-5555-4555-8555-555555555555',
        planType: 'monthly',
        status: 'active',
        startsAt: '2026-11-01T00:00:00Z',
        expiresAt: '2026-12-01T00:00:00Z',
        notes: null,
        updatedAt: '2026-11-01T00:00:00Z'
      },
      effectiveExpiresAt: '2026-12-01T00:00:00Z',
      daysRemaining: 20,
      message: 'Assinatura ativa.'
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <SettingsView
            subscriptionAccess={userAccess}
            isDevelopmentEnv={true}
          />
        </AuthProvider>
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('Diagnóstico de Integridade e Gravação na Nuvem');
    expect(text).toContain('Testar Conexão e Gravação');
    expect(text).not.toContain('Gerenciamento de Assinaturas');
  });

  it('9. Compatibilidade com conta Master: admin confirmado pelo servidor (isAdmin=true, isSchemaMissing=false) mantém painel administrativo e portal comercial', async () => {
    const masterAccess: SubscriptionAccessState = {
      accessStatus: 'active',
      hasAccess: true,
      isSchemaMissing: false,
      isAdmin: true,
      subscription: null,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Acesso permanente da conta Master.'
    };

    const perms = resolveTechnicalAccessPermissions({
      subscriptionAccess: masterAccess,
      isDev: false
    });
    expect(perms.isServerConfirmedAdmin).toBe(true);
    expect(perms.canViewAdminTools).toBe(true);
    expect(perms.canViewDevDiagnostics).toBe(false);

    const onOpenMasterPortal = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AuthProvider>
          <SettingsView
            subscriptionAccess={masterAccess}
            onOpenMasterPortal={onOpenMasterPortal}
            isDevelopmentEnv={false}
          />
        </AuthProvider>
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('Conta Master (Acesso Permanente)');
    // Painel administrativo continua renderizado para o Master mesmo em produção
    expect(text).toContain('Administração de Assinaturas');
    expect(text).toContain('Abrir Painel Master Completo');
    // Scripts SQL internos de dev continuam ocultos fora do ambiente de desenvolvimento
    expect(text).not.toContain('CREATE TABLE IF NOT EXISTS public.user_finance_data');

    const masterBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Abrir Painel Master Completo')
    );
    expect(masterBtn).toBeDefined();
    await act(async () => {
      masterBtn!.click();
    });
    expect(onOpenMasterPortal).toHaveBeenCalledTimes(1);
  });
});
