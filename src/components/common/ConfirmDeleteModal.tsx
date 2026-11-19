/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  itemLabel?: string;
  itemValue?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  variant?: 'danger' | 'warning';
  requireCheckboxLabel?: string;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  description,
  itemLabel,
  itemValue,
  confirmLabel = 'Confirmar Exclusão',
  confirmingLabel = 'Excluindo...',
  variant = 'danger',
  requireCheckboxLabel,
  isDeleting = false,
  onConfirm,
  onCancel
}) => {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setChecked(false);
    }
  }, [isOpen, title, requireCheckboxLabel]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  const isConfirmDisabled = isDeleting || (Boolean(requireCheckboxLabel) && !checked);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-modal-title"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                variant === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
              }`}
            >
              {variant === 'warning' ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <h3
              id="confirm-delete-modal-title"
              className="font-bold text-slate-900 dark:text-white text-sm sm:text-base"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            aria-label="Fechar janela de confirmação"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            {description}
          </p>

          {(itemLabel || itemValue) && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
              {itemLabel && (
                <span className="font-semibold text-slate-900 dark:text-white truncate">
                  {itemLabel}
                </span>
              )}
              {itemValue && (
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                  {itemValue}
                </span>
              )}
            </div>
          )}

          {requireCheckboxLabel && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                disabled={isDeleting}
                className="mt-0.5 rounded border-amber-400 text-rose-600 focus:ring-rose-500"
              />
              <span className="leading-snug font-medium">{requireCheckboxLabel}</span>
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isDeleting}
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isConfirmDisabled}
              onClick={onConfirm}
              className={`px-4 py-2.5 rounded-xl text-white font-semibold transition-colors inline-flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer ${
                variant === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {isDeleting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>{confirmingLabel}</span>
                </>
              ) : (
                <>
                  {variant === 'warning' ? (
                    <RotateCcw className="w-3.5 h-3.5" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>{confirmLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface ActionFeedback {
  type: 'success' | 'error';
  text: string;
}

export const ActionFeedbackBanner: React.FC<{
  feedback: ActionFeedback | null;
  onClose: () => void;
}> = ({ feedback, onClose }) => {
  if (!feedback) return null;

  return (
    <div
      role="status"
      className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
        feedback.type === 'success'
          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
          : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {feedback.type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
        )}
        <span className="font-medium leading-snug">{feedback.text}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar aviso"
        className="p-1 rounded-lg opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
