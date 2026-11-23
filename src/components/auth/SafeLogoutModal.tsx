/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  LogOut,
  ShieldAlert
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const SafeLogoutModal: React.FC = () => {
  const {
    pendingLogoutPrompt,
    cancelPendingLogout,
    syncAndConfirmLogout,
    confirmSafeLogout,
    exportBackupForPendingLogout
  } = useFinance();

  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [alsoDeleteRecoveryBackups, setAlsoDeleteRecoveryBackups] = useState(false);

  useEffect(() => {
    if (pendingLogoutPrompt) {
      setBackupDownloaded(false);
      setAlsoDeleteRecoveryBackups(false);
    }
  }, [Boolean(pendingLogoutPrompt)]);

  const isProcessing = Boolean(pendingLogoutPrompt?.isProcessing);

  const handleExport = () => {
    const res = exportBackupForPendingLogout();
    if (res.success) {
      setBackupDownloaded(true);
    }
  };

  return (
    <ResponsiveModal
      isOpen={Boolean(pendingLogoutPrompt)}
      onClose={cancelPendingLogout}
      title="Confirmação de Saída Segura"
      subtitle="Ainda não foi possível confirmar que todas as alterações locais desta sessão estão salvas na nuvem."
      titleId="safe-logout-modal-title"
      size="lg"
      disableClose={isProcessing}
      closeAriaLabel="Cancelar saída"
      headerClassName="bg-amber-50/70 dark:bg-amber-950/20"
      bodyClassName="text-xs"
      icon={
        <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={cancelPendingLogout}
            disabled={isProcessing}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar e Permanecer
          </button>

          <button
            type="button"
            onClick={() => confirmSafeLogout({ alsoDeleteRecoveryBackups })}
            disabled={isProcessing}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
              alsoDeleteRecoveryBackups
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>
              {alsoDeleteRecoveryBackups
                ? 'Sair e Limpar Cópias Locais'
                : 'Sair Mantendo Backup Local'}
            </span>
          </button>
        </div>
      }
    >
      {pendingLogoutPrompt && (
        <>
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed min-w-0">
              <p className="font-semibold">{pendingLogoutPrompt.message}</p>
              <p className="text-amber-800/90 dark:text-amber-300/90">
                Para evitar perda de dados, sua cópia de recuperação local será preservada neste navegador por padrão caso você opte por sair agora, enquanto sua sessão e o cache ativo serão encerrados.
              </p>
            </div>
          </div>

          {pendingLogoutPrompt.actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 leading-relaxed"
            >
              {pendingLogoutPrompt.actionError}
            </div>
          )}

          {backupDownloaded && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Backup JSON exportado com sucesso! Guarde o arquivo em local seguro.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleExport}
              disabled={isProcessing}
              className="w-full min-h-[42px] py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Exportar Backup JSON</span>
            </button>

            {pendingLogoutPrompt.canRetrySync && (
              <button
                type="button"
                onClick={syncAndConfirmLogout}
                disabled={isProcessing}
                className="w-full min-h-[42px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4 shrink-0" />
                <span>{isProcessing ? 'Sincronizando...' : 'Sincronizar e Sair'}</span>
              </button>
            )}
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alsoDeleteRecoveryBackups}
              disabled={isProcessing}
              onChange={e => setAlsoDeleteRecoveryBackups(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 shrink-0"
            />
            <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Estou em computador compartilhado e já exportei meu backup: remover também as cópias locais de recuperação desta conta ao sair.
            </span>
          </label>
        </>
      )}
    </ResponsiveModal>
  );
};
