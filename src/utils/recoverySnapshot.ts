/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getRecoverySnapshotForUser,
  getUserRecoveryKey,
  isValidStorageUserId
} from './storage';

export interface RecoveryReasonMetadata {
  code: string;
  label: string;
  description: string;
}

export interface RecoverySnapshotCounts {
  transactions: number;
  accounts: number;
  creditCards: number;
  debts: number;
  goals: number;
  categories: number;
  recurringIncomes?: number;
  recurringExpenses?: number;
}

export interface LocalRecoverySnapshotSummary {
  savedAt: string;
  formattedSavedAt: string;
  reason: RecoveryReasonMetadata;
  version: number;
  counts: RecoverySnapshotCounts;
}

export interface LocalRecoverySnapshotInspection {
  status: 'available' | 'empty' | 'corrupted';
  message: string;
  summary?: LocalRecoverySnapshotSummary;
}

export interface RecoverySnapshotDownloadPayload {
  success: boolean;
  filename?: string;
  jsonContent?: string;
  error?: string;
}

const RECOVERY_REASON_MAP: Record<string, { label: string; description: string }> = {
  pre_local_push: {
    label: 'Antes de enviar alterações para a nuvem',
    description:
      'Cópia preventiva salva automaticamente antes de enviar atualizações locais para a conta na nuvem.'
  },
  timestamp_tie_content_conflict: {
    label: 'Conflito de sincronização detectado',
    description:
      'Cópia preventiva gerada ao identificar divergência de conteúdo no mesmo horário entre dispositivos.'
  },
  pre_force_download: {
    label: 'Antes de baixar dados da nuvem',
    description:
      'Cópia preventiva gerada antes de atualizar o dispositivo com os dados armazenados na nuvem.'
  },
  pre_legacy_import: {
    label: 'Antes de importar dados legados',
    description:
      'Cópia preventiva criada antes da importação controlada de dados locais antigos.'
  },
  pre_load_sample: {
    label: 'Antes de carregar dados demonstrativos',
    description:
      'Cópia preventiva salva antes de carregar o conjunto demonstrativo para visualização.'
  },
  pre_reset_clean: {
    label: 'Antes de zerar os dados da conta',
    description:
      'Cópia preventiva salva antes da reinicialização limpa da conta.'
  },
  pre_json_import: {
    label: 'Antes de restaurar backup JSON',
    description:
      'Cópia preventiva gerada automaticamente antes de aplicar uma restauração de arquivo JSON.'
  },
  pre_unsynced_logout: {
    label: 'Antes de sair com alterações não sincronizadas',
    description:
      'Cópia de segurança mantida no dispositivo porque o usuário optou por sair antes de confirmar o envio à nuvem.'
  },
  pre_unverified_logout: {
    label: 'Antes de sair sem confirmação da nuvem',
    description:
      'Cópia de segurança preservada localmente porque não foi possível confirmar a sincronização remota no encerramento da sessão.'
  }
};

export function formatRecoveryReason(reason: unknown): RecoveryReasonMetadata {
  const code = typeof reason === 'string' && reason.trim() ? reason.trim() : 'automatic_snapshot';
  const mapped = RECOVERY_REASON_MAP[code];
  if (mapped) {
    return {
      code,
      label: mapped.label,
      description: mapped.description
    };
  }
  return {
    code,
    label: 'Cópia preventiva automática',
    description:
      'Ponto de recuperação local gerado automaticamente antes de uma alteração importante nesta conta.'
  };
}

export function buildRecoverySnapshotFilename(savedAtIso: string): string {
  const parsed = new Date(savedAtIso);
  const effectiveDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${effectiveDate.getFullYear()}-${pad(effectiveDate.getMonth() + 1)}-${pad(
    effectiveDate.getDate()
  )}`;
  const timePart = `${pad(effectiveDate.getHours())}-${pad(effectiveDate.getMinutes())}-${pad(
    effectiveDate.getSeconds()
  )}`;

  // Identificação clara de recuperação + data/hora, sem dados pessoais nem UUID completo
  return `ponto_recuperacao_${datePart}_${timePart}.json`;
}

function isSnapshotStateStructurallySafe(state: unknown, expectedUserId: string): boolean {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const s = state as Record<string, unknown>;

  if (s.ownerUserId !== undefined && s.ownerUserId !== expectedUserId) {
    return false;
  }

  return (
    Array.isArray(s.transactions) &&
    Array.isArray(s.accounts) &&
    Array.isArray(s.creditCards) &&
    Array.isArray(s.debts) &&
    Array.isArray(s.goals) &&
    Array.isArray(s.categories)
  );
}

/**
 * Inspeciona em modo SOMENTE LEITURA o snapshot local de recuperação do usuário autenticado.
 * Nunca grava no localStorage, nunca altera estado financeiro ativo e nunca sincroniza com o Supabase.
 */
export function inspectLocalRecoverySnapshot(
  userId?: string | null
): LocalRecoverySnapshotInspection {
  if (!isValidStorageUserId(userId)) {
    return {
      status: 'empty',
      message: 'Nenhum ponto de recuperação disponível neste navegador'
    };
  }

  let rawEntry: string | null = null;
  try {
    rawEntry = localStorage.getItem(getUserRecoveryKey(userId));
  } catch {
    return {
      status: 'empty',
      message: 'Nenhum ponto de recuperação disponível neste navegador'
    };
  }

  if (!rawEntry) {
    return {
      status: 'empty',
      message: 'Nenhum ponto de recuperação disponível neste navegador'
    };
  }

  const snapshot = getRecoverySnapshotForUser(userId) as
    | { savedAt: string; reason: string; ownerUserId?: string; state: any }
    | null;

  if (!snapshot) {
    return {
      status: 'corrupted',
      message:
        'O registro local de recuperação encontrado está inválido ou pertence a outro usuário e foi ignorado por segurança.'
    };
  }

  if (snapshot.ownerUserId !== userId) {
    return {
      status: 'corrupted',
      message:
        'Acesso bloqueado: o ponto de recuperação local não corresponde ao usuário autenticado.'
    };
  }

  if (typeof snapshot.savedAt !== 'string' || Number.isNaN(Date.parse(snapshot.savedAt))) {
    return {
      status: 'corrupted',
      message:
        'O ponto de recuperação local possui data/horário inválido e não pôde ser carregado.'
    };
  }

  if (!isSnapshotStateStructurallySafe(snapshot.state, userId)) {
    return {
      status: 'corrupted',
      message:
        'O ponto de recuperação local está incompleto ou corrompido e não pôde ser lido.'
    };
  }

  const parsedDate = new Date(snapshot.savedAt);
  const recurringIncomesCount = Array.isArray(snapshot.state.recurringIncomes)
    ? snapshot.state.recurringIncomes.length
    : 0;
  const recurringExpensesCount = Array.isArray(snapshot.state.recurringExpenses)
    ? snapshot.state.recurringExpenses.length
    : 0;
  const counts: RecoverySnapshotCounts = {
    transactions: snapshot.state.transactions.length,
    accounts: snapshot.state.accounts.length,
    creditCards: snapshot.state.creditCards.length,
    debts: snapshot.state.debts.length,
    goals: snapshot.state.goals.length,
    categories: snapshot.state.categories.length,
    ...(recurringIncomesCount > 0 ? { recurringIncomes: recurringIncomesCount } : {}),
    ...(recurringExpensesCount > 0 ? { recurringExpenses: recurringExpensesCount } : {})
  };

  return {
    status: 'available',
    message: 'Ponto de recuperação local válido encontrado para esta conta.',
    summary: {
      savedAt: snapshot.savedAt,
      formattedSavedAt: parsedDate.toLocaleString('pt-BR'),
      reason: formatRecoveryReason(snapshot.reason),
      version: typeof snapshot.state.version === 'number' ? snapshot.state.version : 1,
      counts
    }
  };
}

/**
 * Prepara o arquivo JSON original do ponto de recuperação para download em modo SOMENTE LEITURA,
 * preservando integralmente sua estrutura armazenada sem modificá-la.
 */
export function buildRecoverySnapshotDownload(
  userId?: string | null
): RecoverySnapshotDownloadPayload {
  const inspection = inspectLocalRecoverySnapshot(userId);
  if (inspection.status !== 'available' || !inspection.summary || !isValidStorageUserId(userId)) {
    return {
      success: false,
      error: inspection.message || 'Nenhum ponto de recuperação válido disponível para download.'
    };
  }

  const originalSnapshot = getRecoverySnapshotForUser(userId);
  if (!originalSnapshot) {
    return {
      success: false,
      error: 'Não foi possível ler o ponto de recuperação original para download.'
    };
  }

  return {
    success: true,
    filename: buildRecoverySnapshotFilename(inspection.summary.savedAt),
    jsonContent: JSON.stringify(originalSnapshot, null, 2)
  };
}
