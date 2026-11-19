/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import viteConfigExport from '../../vite.config';
import { ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY } from '../utils/recoverySnapshotAdapter';
import {
  buildHomologSandboxFrameHtml,
  buildHomologSandboxShellHtml,
  buildPreviewHomologBundle,
  previewHomologationPlugin
} from '../../homologation/vitePreviewHomologPlugin';

describe('P2.6B (Node) — Isolamento de Build, Bundle e Sandbox Preview', () => {
  it('1. Mantém flag global false, remove homologação no build publicado (command=build) e ativa sandbox apenas em serve', async () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);

    const plugin = previewHomologationPlugin();
    expect(plugin.apply).toBe('serve');

    const configFactory = viteConfigExport as (env: {
      command: 'build' | 'serve';
      mode: string;
    }) => Promise<{ plugins?: Array<{ name?: string }> }> | { plugins?: Array<{ name?: string }> };

    const buildConfig = await configFactory({ command: 'build', mode: 'production' });
    const buildPluginNames = (buildConfig.plugins || [])
      .flat()
      .map(p => (p && typeof p === 'object' ? p.name : undefined));
    expect(buildPluginNames).not.toContain('preview-homologation-sandbox');

    const serveConfig = await configFactory({ command: 'serve', mode: 'development' });
    const servePluginNames = (serveConfig.plugins || [])
      .flat()
      .map(p => (p && typeof p === 'object' ? p.name : undefined));
    expect(servePluginNames).toContain('preview-homologation-sandbox');

    const shellHtml = buildHomologSandboxShellHtml();
    expect(shellHtml).toContain('sandbox="allow-scripts allow-downloads"');
    expect(shellHtml).not.toContain('allow-same-origin');
    expect(shellHtml).toContain('src="/homologacao/frame.html"');

    const rootDir = path.resolve(__dirname, '../..');
    const bundleJs = await buildPreviewHomologBundle(rootDir);
    expect(bundleJs.includes('opaque_preview')).toBe(true);
    expect(bundleJs.includes('P2.6B')).toBe(true);
    expect(bundleJs.includes('supabase-js')).toBe(false);
    expect(bundleJs.includes('lwkecyfhpkyuakbbxksl.supabase.co')).toBe(false);
    expect(bundleJs.includes('sb_publishable_WJFITYIkMpYJAiPErF4iWA_lzK9QdMI')).toBe(false);

    const frameHtml = buildHomologSandboxFrameHtml({
      cssText: 'body { margin: 0; }',
      bundleJs
    });
    expect(frameHtml).toContain("connect-src 'none'");
    expect(frameHtml).toContain("if (window.origin !== 'null')");

    const initFile = fs.readFileSync(
      path.join(rootDir, 'homologation/initPreviewSandbox.ts'),
      'utf8'
    );
    expect(initFile).toContain("window.origin !== 'null'");
  }, 20000);
});
