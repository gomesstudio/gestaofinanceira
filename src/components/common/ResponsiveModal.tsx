/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export type ResponsiveModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_CLASS_MAP: Record<ResponsiveModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl'
};

export interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ResponsiveModalSize;
  disableClose?: boolean;
  closeAriaLabel?: string;
  footer?: React.ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  panelClassName?: string;
  role?: 'dialog' | 'alertdialog';
  titleId?: string;
  children: React.ReactNode;
}

export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  disableClose = false,
  closeAriaLabel = 'Fechar janela',
  footer,
  onSubmit,
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  panelClassName = '',
  role = 'dialog',
  titleId: titleIdProp,
  children
}) => {
  const generatedTitleId = useId();
  const titleId = titleIdProp || generatedTitleId;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, disableClose, onClose]);

  if (!isOpen) return null;

  const content = (
    <>
      <div
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 ${bodyClassName}`}
      >
        {children}
      </div>

      {footer && (
        <div
          className={`shrink-0 px-4 sm:px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 ${footerClassName}`}
        >
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!disableClose) onClose();
      }}
    >
      <div
        className={`w-full ${SIZE_CLASS_MAP[size]} max-h-[92vh] max-h-[92dvh] sm:max-h-[90vh] sm:max-h-[90dvh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden ${panelClassName}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Zone 1: Sticky Header */}
        <div
          className={`shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 ${headerClassName}`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              <h3
                id={titleId}
                className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug truncate"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={disableClose}
            onClick={onClose}
            aria-label={closeAriaLabel}
            className="p-2 -mr-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Zone 2 (Scrollable Body) & Zone 3 (Sticky Footer) */}
        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex-1 min-h-0 flex flex-col">
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>
  );
};
