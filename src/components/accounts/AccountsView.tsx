/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Edit2,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { BankAccount } from '../../types/finance';
import { formatCurrency, formatPercent, getTodayISO } from '../../utils/formatters';
import {
  ACCOUNT_COLOR_PRESETS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_LIST,
  AccountType,
  formatCurrencyInputInitial,
  getAccountBalanceDistribution,
  getAccountDependencies,
  parseCurrencyInput
} from '../../utils/accountManagement';
import {
  ActionFeedback,
  ActionFeedbackBanner,
  ConfirmDeleteModal
} from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export interface AccountsViewProps {
  onViewAccountTransactions?: (accountId: string) => void;
}

const getAccountTypeIcon = (type: AccountType) => {
  switch (type) {
    case 'checking':
      return Landmark;
    case 'savings':
      return PiggyBank;
    case 'cash':
      return Banknote;
    case 'investment':
      return TrendingUp;
    default:
      return Wallet;
  }
};

export const AccountsView: React.FC<AccountsViewProps> = ({
  onViewAccountTransactions
}) => {
  const {
    accounts,
    totalBankBalance,
    transactions,
    creditCards,
    recurringIncomes,
    debts,
    addAccount,
    updateAccount,
    deleteAccount,
    transferBetweenAccounts
  } = useFinance();

  const fieldIdPrefix = useId();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  // Create / Edit Account Modal State
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('checking');
  const [accBalanceStr, setAccBalanceStr] = useState('0,00');
  const [accColor, setAccColor] = useState('#059669');
  const [accInstitution, setAccInstitution] = useState('');
  const [accFormError, setAccFormError] = useState<string | null>(null);

  // Transfer Between Accounts Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferDate, setTransferDate] = useState(getTodayISO());
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  // Delete Protection & Confirmation State
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<BankAccount | null>(null);
  const [blockedDeleteInfo, setBlockedDeleteInfo] = useState<{
    account: BankAccount;
    reasonText: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const distribution = useMemo(
    () => getAccountBalanceDistribution(accounts),
    [accounts]
  );

  const dependenciesByAccount = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getAccountDependencies>>();
    for (const acc of accounts) {
      map.set(
        acc.id,
        getAccountDependencies(acc.id, {
          transactions,
          creditCards,
          recurringIncomes,
          debts
        })
      );
    }
    return map;
  }, [accounts, transactions, creditCards, recurringIncomes, debts]);

  const handleOpenCreateModal = () => {
    setEditingAccount(null);
    setAccName('');
    setAccType('checking');
    setAccBalanceStr('0,00');
    setAccColor('#059669');
    setAccInstitution('');
    setAccFormError(null);
    setIsAccountModalOpen(true);
  };

  const handleOpenEditModal = (acc: BankAccount) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccBalanceStr(formatCurrencyInputInitial(acc.balance));
    setAccColor(acc.color || '#059669');
    setAccInstitution(acc.institution || '');
    setAccFormError(null);
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = accName.trim();
    if (!trimmedName) {
      setAccFormError('Informe o nome da conta ou carteira.');
      return;
    }

    const parsedBalance = parseCurrencyInput(accBalanceStr);
    const trimmedInstitution = accInstitution.trim();

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        name: trimmedName,
        type: accType,
        balance: parsedBalance,
        color: accColor,
        institution: trimmedInstitution || undefined
      });
      setFeedback({
        type: 'success',
        text: `Conta "${trimmedName}" atualizada com sucesso.`
      });
    } else {
      addAccount({
        name: trimmedName,
        type: accType,
        balance: parsedBalance,
        color: accColor,
        ...(trimmedInstitution ? { institution: trimmedInstitution } : {})
      });
      setFeedback({
        type: 'success',
        text: `Conta "${trimmedName}" cadastrada com sucesso.`
      });
    }

    setIsAccountModalOpen(false);
    setAccFormError(null);
  };

  const handleOpenTransferModal = (preselectedSourceId?: string) => {
    if (accounts.length < 2) {
      setFeedback({
        type: 'error',
        text: 'Cadastre pelo menos duas contas para realizar transferências entre elas.'
      });
      return;
    }
    const sourceId =
      preselectedSourceId && accounts.some(a => a.id === preselectedSourceId)
        ? preselectedSourceId
        : accounts[0].id;
    const targetAcc = accounts.find(a => a.id !== sourceId) || accounts[1];

    setTransferSourceId(sourceId);
    setTransferTargetId(targetAcc.id);
    setTransferAmountStr('');
    setTransferDate(getTodayISO());
    setTransferNotes('');
    setTransferError(null);
    setIsTransferModalOpen(true);
  };

  const handleSubmitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSourceId || !transferTargetId) {
      setTransferError('Selecione a conta de origem e a conta de destino.');
      return;
    }
    if (transferSourceId === transferTargetId) {
      setTransferError('A conta de origem e a conta de destino devem ser diferentes.');
      return;
    }
    const amount = parseCurrencyInput(transferAmountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferError('Informe um valor válido maior que zero.');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === transferSourceId);
    const targetAcc = accounts.find(a => a.id === transferTargetId);
    transferBetweenAccounts(
      transferSourceId,
      transferTargetId,
      amount,
      transferDate || getTodayISO(),
      transferNotes.trim() || undefined
    );

    setIsTransferModalOpen(false);
    setFeedback({
      type: 'success',
      text: `Transferência de ${formatCurrency(amount)} de "${sourceAcc?.name || 'Origem'}" para "${targetAcc?.name || 'Destino'}" registrada.`
    });
  };

  const handleRequestDeleteAccount = (acc: BankAccount) => {
    if (accounts.length <= 1) {
      setBlockedDeleteInfo({
        account: acc,
        reasonText:
          'É necessário manter pelo menos uma conta ativa para que seus lançamentos e saldos permaneçam consistentes.'
      });
      return;
    }

    const deps = dependenciesByAccount.get(acc.id);
    if (deps && deps.totalCount > 0) {
      setBlockedDeleteInfo({
        account: acc,
        reasonText: `Esta conta possui vínculos financeiros ativos (${deps.reasons.join(', ')}). Para preservar o histórico e evitar perda de rastreabilidade nas movimentações, a exclusão foi bloqueada.`
      });
      return;
    }

    setPendingDeleteAccount(acc);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!pendingDeleteAccount || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAccount(pendingDeleteAccount.id);
      setFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir a conta selecionada.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteAccount(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>Minhas Contas</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gerencie suas contas, carteiras e dinheiro em um só lugar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {accounts.length >= 2 && (
            <button
              type="button"
              onClick={() => handleOpenTransferModal()}
              className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Transferir</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>+ Nova Conta</span>
          </button>
        </div>
      </div>

      <ActionFeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      {/* Painel Resumido (Topo) */}
      <section
        aria-label="Resumo consolidado das contas"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Saldo Total Consolidado
            </div>
            <div
              data-testid="accounts-consolidated-balance"
              className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight mt-1 ${
                totalBankBalance >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(totalBankBalance)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Contas cadastradas</span>
            <span
              data-testid="accounts-total-count"
              className="font-mono font-bold text-slate-900 dark:text-white tabular-nums"
            >
              {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
            </span>
          </div>
        </div>

        <div className="lg:col-span-2 p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Distribuição por Tipo de Conta
            </h3>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Considera apenas saldos reais em conta
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {distribution.map(item => {
              const Icon = getAccountTypeIcon(item.type);
              return (
                <div
                  key={item.type}
                  data-testid={`accounts-dist-${item.type}`}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                      {item.count} {item.count === 1 ? 'conta' : 'contas'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(item.totalBalance)}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatPercent(item.sharePercent)}
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, item.sharePercent))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cards Individuais de Contas */}
      <section aria-label="Lista de contas cadastradas">
        {accounts.length === 0 ? (
          <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center space-y-3">
            <Wallet className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Nenhuma conta cadastrada
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Cadastre suas contas bancárias, poupanças ou dinheiro em espécie para acompanhar seus saldos e movimentações.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nova Conta</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map(acc => {
              const Icon = getAccountTypeIcon(acc.type);
              const deps = dependenciesByAccount.get(acc.id);
              const linkedMovements = deps?.transactionsCount ?? 0;

              return (
                <article
                  key={acc.id}
                  data-testid={`account-card-${acc.id}`}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0"
                >
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                          style={{ backgroundColor: acc.color || '#059669' }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: acc.color || '#059669' }}
                              aria-hidden="true"
                            />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {acc.name}
                            </h3>
                          </div>

                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {ACCOUNT_TYPE_LABELS[acc.type] || 'Conta'}
                          </div>

                          {acc.institution && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-full truncate">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">{acc.institution}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saldo atual
                      </div>
                      <div
                        className={`text-xl font-extrabold font-mono tabular-nums mt-0.5 ${
                          acc.balance >= 0
                            ? 'text-slate-900 dark:text-white'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatCurrency(acc.balance)}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                        {linkedMovements}{' '}
                        {linkedMovements === 1
                          ? 'movimentação vinculada'
                          : 'movimentações vinculadas'}
                      </div>
                    </div>
                  </div>

                  {/* Ações de gerenciamento */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(acc)}
                      aria-label={`Editar conta ${acc.name}`}
                      className="flex-1 min-w-[84px] min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Editar</span>
                    </button>

                    {accounts.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleOpenTransferModal(acc.id)}
                        aria-label={`Transferir a partir de ${acc.name}`}
                        className="flex-1 min-w-[96px] min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                        <span>Transferir</span>
                      </button>
                    )}

                    {onViewAccountTransactions && (
                      <button
                        type="button"
                        onClick={() => onViewAccountTransactions(acc.id)}
                        aria-label={`Ver movimentações de ${acc.name}`}
                        className="flex-1 min-w-[116px] min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5 shrink-0" />
                        <span>Movimentações</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRequestDeleteAccount(acc)}
                      aria-label={`Excluir conta ${acc.name}`}
                      title="Excluir conta"
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center p-2 rounded-xl border border-rose-200/80 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Cadastrar / Editar Conta */}
      <ResponsiveModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        title={editingAccount ? 'Editar Conta' : 'Nova Conta'}
        subtitle={
          editingAccount
            ? 'Atualize os dados da conta selecionada'
            : 'Cadastre conta bancária, poupança, carteira ou investimento'
        }
        size="sm"
        bodyClassName="text-xs space-y-3"
        onSubmit={handleSaveAccount}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAccountModalOpen(false)}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs cursor-pointer"
            >
              {editingAccount ? 'Salvar Alterações' : 'Cadastrar Conta'}
            </button>
          </div>
        }
      >
        {accFormError && (
          <div
            role="alert"
            className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium"
          >
            {accFormError}
          </div>
        )}

        <div>
          <label
            htmlFor={`${fieldIdPrefix}-acc-name`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            Nome da Conta *
          </label>
          <input
            id={`${fieldIdPrefix}-acc-name`}
            name="account_name"
            type="text"
            autoComplete="off"
            required
            placeholder="Ex: Conta Principal, Reserva, Carteira..."
            value={accName}
            onChange={e => setAccName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${fieldIdPrefix}-acc-type`}
              className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              Tipo de Conta
            </label>
            <select
              id={`${fieldIdPrefix}-acc-type`}
              name="account_type"
              value={accType}
              onChange={e => setAccType(e.target.value as AccountType)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              {ACCOUNT_TYPE_LIST.map(item => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${fieldIdPrefix}-acc-balance`}
              className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              {editingAccount ? 'Saldo Atual (R$)' : 'Saldo Inicial (R$)'}
            </label>
            <input
              id={`${fieldIdPrefix}-acc-balance`}
              name="account_balance"
              type="text"
              autoComplete="off"
              inputMode="decimal"
              value={accBalanceStr}
              onChange={e =>
                setAccBalanceStr(e.target.value.replace(/[^0-9,.-]/g, ''))
              }
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${fieldIdPrefix}-acc-institution`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            Instituição (opcional)
          </label>
          <input
            id={`${fieldIdPrefix}-acc-institution`}
            name="account_institution"
            type="text"
            autoComplete="off"
            placeholder="Ex: Banco, cooperativa ou carteira"
            value={accInstitution}
            onChange={e => setAccInstitution(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <span
            id={`${fieldIdPrefix}-acc-color-label`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1.5"
          >
            Cor de Identificação
          </span>
          <div
            role="group"
            aria-labelledby={`${fieldIdPrefix}-acc-color-label`}
            className="flex flex-wrap items-center gap-2"
          >
            {ACCOUNT_COLOR_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setAccColor(preset.value)}
                aria-label={`Cor ${preset.label}`}
                aria-pressed={accColor === preset.value}
                className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                  accColor === preset.value
                    ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 scale-110'
                    : ''
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>
        </div>
      </ResponsiveModal>

      {/* Modal: Transferência entre Contas */}
      <ResponsiveModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transferência entre Contas"
        subtitle="Movimenta saldo entre suas contas sem contar como receita ou despesa"
        size="sm"
        bodyClassName="text-xs space-y-3"
        onSubmit={handleSubmitTransfer}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs cursor-pointer"
            >
              Confirmar Transferência
            </button>
          </div>
        }
      >
        {transferError && (
          <div
            role="alert"
            className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium"
          >
            {transferError}
          </div>
        )}

        <div>
          <label
            htmlFor={`${fieldIdPrefix}-transfer-source`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            Conta de Origem *
          </label>
          <select
            id={`${fieldIdPrefix}-transfer-source`}
            name="transfer_source_account"
            value={transferSourceId}
            onChange={e => setTransferSourceId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrency(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`${fieldIdPrefix}-transfer-target`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            Conta de Destino *
          </label>
          <select
            id={`${fieldIdPrefix}-transfer-target`}
            name="transfer_target_account"
            value={transferTargetId}
            onChange={e => setTransferTargetId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrency(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${fieldIdPrefix}-transfer-amount`}
              className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              Valor (R$) *
            </label>
            <input
              id={`${fieldIdPrefix}-transfer-amount`}
              name="transfer_amount"
              type="text"
              autoComplete="off"
              inputMode="decimal"
              required
              placeholder="0,00"
              value={transferAmountStr}
              onChange={e =>
                setTransferAmountStr(e.target.value.replace(/[^0-9,.]/g, ''))
              }
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldIdPrefix}-transfer-date`}
              className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              Data
            </label>
            <input
              id={`${fieldIdPrefix}-transfer-date`}
              name="transfer_date"
              type="date"
              value={transferDate}
              onChange={e => setTransferDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${fieldIdPrefix}-transfer-notes`}
            className="block font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            Observações (opcional)
          </label>
          <input
            id={`${fieldIdPrefix}-transfer-notes`}
            name="transfer_notes"
            type="text"
            autoComplete="off"
            placeholder="Ex: Reserva mensal, ajuste de saldo..."
            value={transferNotes}
            onChange={e => setTransferNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal: Proteção de Integridade contra Exclusão */}
      <ResponsiveModal
        isOpen={!!blockedDeleteInfo}
        onClose={() => setBlockedDeleteInfo(null)}
        title="Exclusão Protegida"
        subtitle={blockedDeleteInfo?.account.name}
        size="sm"
        icon={
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
        }
        bodyClassName="text-xs space-y-3"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            {blockedDeleteInfo && onViewAccountTransactions && (
              <button
                type="button"
                onClick={() => {
                  const accId = blockedDeleteInfo.account.id;
                  setBlockedDeleteInfo(null);
                  onViewAccountTransactions(accId);
                }}
                className="px-4 py-2.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs cursor-pointer"
              >
                Ver Movimentações
              </button>
            )}
            <button
              type="button"
              onClick={() => setBlockedDeleteInfo(null)}
              className="px-4 py-2.5 min-h-[40px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
            >
              Entendi
            </button>
          </div>
        }
      >
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
          {blockedDeleteInfo?.reasonText}
        </p>
      </ResponsiveModal>

      {/* Modal: Confirmação Segura de Exclusão (somente quando sem vínculos) */}
      <ConfirmDeleteModal
        isOpen={!!pendingDeleteAccount}
        title="Excluir Conta"
        description="Deseja excluir esta conta? Como não há movimentações ou vínculos associados a ela, o histórico financeiro permanecerá intacto."
        itemLabel={pendingDeleteAccount?.name}
        itemValue={
          pendingDeleteAccount ? formatCurrency(pendingDeleteAccount.balance) : undefined
        }
        isDeleting={isDeleting}
        onConfirm={handleConfirmDeleteAccount}
        onCancel={() => setPendingDeleteAccount(null)}
      />
    </div>
  );
};
