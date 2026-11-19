// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY } from '../utils/recoverySnapshotAdapter';
import { HomologationApp } from '../../homologation/HomologationApp';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({ upsert: upsertMock }));
const getSessionMock = vi.fn();

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: any[]) => getSessionMock(...args) },
    from: (...args: any[]) => (fromMock as any)(...args)
  },
  SUPABASE_PROJECT_URL: 'https://bloqueado.supabase.invalid'
}));

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

async function flushUi(ms = 35): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

async function waitForCondition(
  predicate: () => boolean,
  errorMessage: string,
  timeoutMs = 2500
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await flushUi(20);
  }
  throw new Error(errorMessage);
}

function findButtonByText(container: HTMLElement, pattern: RegExp): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const found = buttons.find(btn => pattern.test(btn.textContent || ''));
  if (!found) {
    throw new Error(`Botão não encontrado para o padrão: ${pattern.toString()}`);
  }
  return found;
}

describe('P2.6B — Homologação Isolada no Preview do Google AI Studio (UI Sandbox)', () => {
  let storageMock: ReturnType<typeof createLocalStorageMock>;
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'origin', {
      value: 'null',
      writable: true,
      configurable: true
    });
    storageMock = createLocalStorageMock();
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true
    });
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:mock-homolog-json'),
        configurable: true,
        writable: true
      });
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-homolog-json');
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
        writable: true
      });
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it('1. Mantém flag global false e permite testar visualmente criação, limite de 5, deduplicação, detalhes, download/validação JSON e falhas sem tocar Supabase', async () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);
    const idbFactory = new IDBFactory();
    let simulateStorageFail = false;

    const originalSetItem = storageMock.setItem.bind(storageMock);
    storageMock.setItem = (k: string, v: string) => {
      if (simulateStorageFail) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      originalSetItem(k, v);
    };

    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <HomologationApp
            sandboxMode="opaque_preview"
            indexedDBFactory={idbFactory}
            onToggleLocalStorageFailure={fail => {
              simulateStorageFail = fail;
            }}
          />
        );
      });
      await flushUi();

      const flagBadge = container.querySelector('[data-testid="homolog-global-flag-badge"]');
      expect(flagBadge?.textContent).toContain('false');

      // 1 & 2. Cria 6 snapshots em sequência e confirma limite visual de 5 pontos
      await act(async () => {
        findButtonByText(container, /Criar 6 Pontos \(Testar Limite 5\)/i).click();
      });
      await waitForCondition(
        () =>
          container.querySelector('[data-testid="homolog-history-counter"]')?.textContent ===
          '5 de 5 exibidos',
        'Histórico não exibiu 5 de 5 após criar 6 pontos.'
      );

      // 3. Testa deduplicação sem aumentar o histórico
      await act(async () => {
        findButtonByText(container, /Testar Deduplicação/i).click();
      });
      await waitForCondition(
        () =>
          Boolean(
            container
              .querySelector('[data-testid="homolog-status-log"]')
              ?.textContent?.includes('deduplicated=true')
          ),
        'Deduplicação não confirmada no log de status.'
      );
      expect(
        container.querySelector('[data-testid="homolog-history-counter"]')?.textContent
      ).toBe('5 de 5 exibidos');

      // 4. Visualização de detalhes (somente leitura, sem botão de restauração)
      await act(async () => {
        findButtonByText(container, /Visualizar Detalhes/i).click();
      });
      await flushUi();
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain('Versão: v6');
      expect(dialog?.textContent).not.toMatch(/Restaurar/i);
      const closeBtn = container.querySelector(
        'button[aria-label="Fechar detalhes"]'
      ) as HTMLButtonElement;
      await act(async () => {
        closeBtn.click();
      });

      // 5 & 6. Download JSON + Validação segura do JSON exportado (prévia sem restaurar)
      await act(async () => {
        findButtonByText(container, /Baixar \+ Validar JSON/i).click();
      });
      await waitForCondition(
        () => Boolean(container.querySelector('[data-testid="homolog-export-dryrun-report"]')),
        'Relatório de validação JSON em prévia não exibido.'
      );
      const dryRunReport = container.querySelector('[data-testid="homolog-export-dryrun-report"]');
      expect(anchorClickSpy).toHaveBeenCalled();
      expect(dryRunReport?.textContent).toContain('ACEITO na prévia (sem restaurar)');
      expect(dryRunReport?.textContent).toContain('BLOQUEADO corretamente');
      expect(dryRunReport?.textContent).toContain('owner_mismatch');

      // 7. Simulação de falhas de armazenamento (IDB indisponível, QuotaExceededError, Falha Dupla)
      await act(async () => {
        findButtonByText(container, /Simular IndexedDB Indisponível/i).click();
      });
      await waitForCondition(
        () =>
          Boolean(
            container
              .querySelector('[data-testid="homolog-failure-log"]')
              ?.textContent?.includes('historyCode=idb_unavailable')
          ),
        'Falha simulada idb_unavailable não exibida.'
      );

      await act(async () => {
        findButtonByText(container, /Simular QuotaExceededError/i).click();
      });
      await waitForCondition(
        () =>
          Boolean(
            container
              .querySelector('[data-testid="homolog-failure-log"]')
              ?.textContent?.includes('historyCode=quota_exceeded')
          ),
        'Falha simulada quota_exceeded não exibida.'
      );

      await act(async () => {
        findButtonByText(container, /Simular Falha Dupla/i).click();
      });
      await waitForCondition(
        () =>
          Boolean(
            container
              .querySelector('[data-testid="homolog-failure-log"]')
              ?.textContent?.includes('snapshotStatus=failed')
          ),
        'Falha dupla simulada não exibida.'
      );

      // Garantia final de zero chamadas ao Supabase real
      expect(fromMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
      expect(getSessionMock).not.toHaveBeenCalled();
    } finally {
      anchorClickSpy.mockRestore();
    }
  });
});
