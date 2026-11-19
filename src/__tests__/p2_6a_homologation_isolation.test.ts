/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY } from '../../src/utils/recoverySnapshotAdapter';
import { runHomologationChecklist } from '../../homologation/homologRunner';
import { supabase as disabledSupabaseStub } from '../../homologation/supabaseDisabledStub';
import { assertIsolatedHomologOrigin } from '../../homologation/homologFixtures';

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

const storageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true
});

describe('P2.6A — Preparação e Isolamento do Ambiente de Homologação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.clear();
  });

  it('1. Mantém ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY = false e nenhuma rota pública no app de produção', () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);

    const rootDir = path.resolve(__dirname, '../..');
    const productionFiles = [
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/context/FinanceContext.tsx',
      'src/components/settings/SettingsView.tsx'
    ];

    for (const relPath of productionFiles) {
      const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
      expect(content).not.toContain('homologation');
      expect(content).not.toContain('HomologationApp');
    }

    const rootViteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
    expect(rootViteConfig).toContain("command === 'serve' ? [previewHomologationPlugin()] : []");

    const homologConfig = fs.readFileSync(
      path.join(rootDir, 'homologation/vite.homolog.config.ts'),
      'utf8'
    );
    expect(homologConfig).toContain('port: 4173');
    expect(homologConfig).toContain('supabaseDisabledStub.ts');
  });

  it('2. Bloqueia chamadas ao Supabase no stub de homologação e impede execução direta na porta 3000 ou *.run.app sem sandbox opaco', async () => {
    await expect(disabledSupabaseStub.auth.getSession()).rejects.toThrow(/bloqueadas/i);
    await expect((disabledSupabaseStub.from() as any).select()).rejects.toThrow(/bloqueadas/i);

    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = { origin: 'https://localhost:3000', location: { port: '3000', hostname: 'localhost' } };
      expect(() => assertIsolatedHomologOrigin()).toThrow(/porta 3000/i);

      (globalThis as any).window = {
        origin: 'https://ais-dev-example.us-east5.run.app',
        location: { port: '', hostname: 'ais-dev-example.us-east5.run.app' }
      };
      expect(() => assertIsolatedHomologOrigin()).toThrow(/sandbox isolado/i);

      (globalThis as any).window = {
        origin: 'null',
        location: { port: '', hostname: '' }
      };
      expect(() => assertIsolatedHomologOrigin()).not.toThrow();

      (globalThis as any).window = { origin: 'http://127.0.0.1:4173', location: { port: '4173', hostname: '127.0.0.1' } };
      expect(() => assertIsolatedHomologOrigin()).not.toThrow();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('3. Executa integralmente os 10 testes do roteiro controlado P2.6A usando apenas dados fictícios sem tocar Supabase', async () => {
    const idbFactory = new IDBFactory();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const report = await runHomologationChecklist({ indexedDBFactory: idbFactory });
      expect(report.globalFlagStillDisabled).toBe(true);
      expect(report.checks).toHaveLength(10);

      for (const check of report.checks) {
        expect(check.passed, `Falha no item ${check.id} (${check.title}): ${check.detail}`).toBe(
          true
        );
      }

      expect(report.allPassed).toBe(true);

      // Zero chamadas ao Supabase real
      expect(fromMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
      expect(getSessionMock).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
