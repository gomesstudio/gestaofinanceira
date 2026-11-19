/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  ExternalLink,
  FileText,
  Info,
  MessageCircle,
  Moon,
  Server,
  ShieldCheck,
  Sun
} from 'lucide-react';
import {
  LEGAL_APP_NAME,
  LEGAL_CONTROLLER_INFO,
  LEGAL_DOCUMENTS_REGISTRY,
  LegalDocumentId,
  VERIFIED_LOCAL_STORAGE_INVENTORY,
  VERIFIED_THIRD_PARTY_PROCESSORS
} from '../../legal/legalConfig';
import { TERMS_OF_USE_CONTENT } from '../../legal/termsOfUseContent';
import { PRIVACY_POLICY_CONTENT } from '../../legal/privacyPolicyContent';

interface LegalDocumentsViewProps {
  documentId: LegalDocumentId;
  onSelectDocument: (docId: LegalDocumentId) => void;
  onClose: () => void;
  backLabel?: string;
}

function detectInitialDarkPreference(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem('finance_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {
      return false;
    }
  }
  return false;
}

export const LegalDocumentsView: React.FC<LegalDocumentsViewProps> = ({
  documentId,
  onSelectDocument,
  onClose,
  backLabel = 'Voltar'
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => detectInitialDarkPreference());

  const content =
    documentId === 'terms_of_use' ? TERMS_OF_USE_CONTENT : PRIVACY_POLICY_CONTENT;
  const meta = LEGAL_DOCUMENTS_REGISTRY[documentId];

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, 0);
      }
    }
  }, [documentId]);

  const handleToggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
      }
      return next;
    });
  };

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(`legal-section-${sectionId}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      data-testid="legal-documents-view"
      data-legal-theme={isDark ? 'dark' : 'light'}
      className={isDark ? 'dark' : ''}
    >
      <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                data-testid="legal-back-button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{backLabel}</span>
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {LEGAL_APP_NAME}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Transparência & Documentos Legais
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <nav
                aria-label="Alternar documento legal"
                className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 p-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onSelectDocument('terms_of_use')}
                  aria-current={documentId === 'terms_of_use' ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                    documentId === 'terms_of_use'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>Termos de Uso</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectDocument('privacy_policy')}
                  aria-current={documentId === 'privacy_policy' ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                    documentId === 'privacy_policy'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Política de Privacidade</span>
                </button>
              </nav>

              <button
                type="button"
                onClick={handleToggleTheme}
                aria-label={isDark ? 'Ativar tema claro na leitura' : 'Ativar tema escuro na leitura'}
                title={isDark ? 'Tema claro' : 'Tema escuro'}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Grid */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Sidebar Navigation (Desktop Sticky / Mobile Card) */}
            <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Seções deste documento</span>
                </div>

                <nav aria-label="Navegação por seções" className="space-y-1">
                  {content.sections.map(section => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-start gap-2 cursor-pointer"
                    >
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        {section.number}.
                      </span>
                      <span className="leading-snug font-medium">{section.title}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Official Support & Pending Controller Info Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3 text-xs">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Canal Oficial de Atendimento e LGPD</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Dúvidas sobre estes documentos, privacidade, dados pessoais ou planos podem ser tratadas pelo WhatsApp oficial:
                </p>
                <a
                  href={LEGAL_CONTROLLER_INFO.officialWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                >
                  <span>{LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    Campos formais pendentes de definição oficial:
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {LEGAL_CONTROLLER_INFO.pendingFields.map(field => (
                      <li key={field.key}>{field.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            {/* Document Body */}
            <article className="lg:col-span-8 space-y-6">
              {/* Document Header Banner */}
              <div className="p-5 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 font-semibold font-mono">
                    Versão v{meta.version}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>Atualizado em {meta.updatedAtBr}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                    Acesso público sem autenticação
                  </span>
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {content.title}
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {content.subtitle}
                  </p>
                </div>

                {/* Highlights Summary */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Resumo em linguagem clara
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {content.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Document Sections */}
              <div className="space-y-4">
                {content.sections.map(section => (
                  <section
                    key={section.id}
                    id={`legal-section-${section.id}`}
                    className="scroll-mt-24 p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
                  >
                    <div className="space-y-1 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-baseline gap-2">
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">
                          {section.number}.
                        </span>
                        <span>{section.title}</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {section.summary}
                      </p>
                    </div>

                    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {section.paragraphs.map((paragraph, pIdx) => (
                        <p key={pIdx}>{paragraph}</p>
                      ))}

                      {section.bullets && section.bullets.length > 0 && (
                        <ul className="space-y-2 pt-1">
                          {section.bullets.map((bullet, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2.5 text-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.callout && (
                        <div
                          className={`p-4 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                            section.callout.tone === 'warning'
                              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-200'
                              : 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/80 text-blue-950 dark:text-blue-200'
                          }`}
                        >
                          {section.callout.tone === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-1">
                            <div className="font-bold">{section.callout.title}</div>
                            <p>{section.callout.text}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>

              {/* Extra Structured Transparency Tables for Privacy Policy */}
              {documentId === 'privacy_policy' && (
                <div className="space-y-4">
                  <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Quadro Resumido de Serviços Externos Verificados
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {VERIFIED_THIRD_PARTY_PROCESSORS.map(proc => (
                        <div
                          key={proc.id}
                          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {proc.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium">
                              {proc.optional ? 'Opcional (ação do usuário)' : 'Operação essencial'}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">Função:</strong>{' '}
                            {proc.role}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-200">Dados:</strong>{' '}
                            {proc.dataProcessed}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Infraestrutura:</strong> {proc.internationalTransferNote}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Inventário de Armazenamento Local no Navegador
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5">
                      {VERIFIED_LOCAL_STORAGE_INVENTORY.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-1 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                              {item.keyOrStore}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
                              {item.mechanism}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.purpose}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong>Limpeza/Retenção:</strong> {item.retentionAndCleanup}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* Bottom Switch & Return Actions */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                <div className="text-slate-500 dark:text-slate-400">
                  Documento vigente: <strong className="text-slate-800 dark:text-slate-200">{content.title}</strong> (v{meta.version} · {meta.updatedAtBr})
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectDocument(
                        documentId === 'terms_of_use' ? 'privacy_policy' : 'terms_of_use'
                      )
                    }
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
                  >
                    {documentId === 'terms_of_use'
                      ? 'Ler Política de Privacidade'
                      : 'Ler Termos de Uso'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
                  >
                    {backLabel}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
};
