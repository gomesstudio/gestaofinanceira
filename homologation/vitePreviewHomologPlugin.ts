/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

export const PREVIEW_HOMOLOG_ROUTE = '/homologacao';
export const PREVIEW_HOMOLOG_FRAME_ROUTE = '/homologacao/frame.html';

export function buildHomologSandboxShellHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Homologação Isolada P2.6B — Preview Sandbox</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; }
      .shell { display: flex; flex-direction: column; height: 100vh; width: 100%; }
      .topbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 16px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        font-size: 12px;
      }
      .back-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #475569;
        text-decoration: none;
        font-weight: 600;
      }
      .back-btn:hover { background: #334155; }
      .pill {
        padding: 5px 10px;
        border-radius: 8px;
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #6ee7b7;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 11px;
      }
      iframe {
        flex: 1;
        width: 100%;
        border: 0;
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <a class="back-btn" href="/">← Voltar ao Aplicativo</a>
          <strong>Homologação P2.6B — Google AI Studio Preview (Sandbox Isolado)</strong>
        </div>
        <span class="pill">sandbox="allow-scripts allow-downloads" · Origem Opaca (null)</span>
      </header>
      <iframe
        id="homolog-sandbox-frame"
        title="Ambiente Isolado de Homologação P2.6B"
        sandbox="allow-scripts allow-downloads"
        src="${PREVIEW_HOMOLOG_FRAME_ROUTE}"
      ></iframe>
    </div>
  </body>
</html>`;
}

export async function buildPreviewHomologBundle(rootDir: string): Promise<string> {
  const stubPath = path.resolve(rootDir, 'homologation/supabaseDisabledStub.ts');
  const entryPath = path.resolve(rootDir, 'homologation/previewMain.tsx');

  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"development"',
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
      'import.meta.env.VITE_SUPABASE_URL': '"https://homologacao-isolada.invalid"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"homologacao-bloqueada"'
    },
    plugins: [
      {
        name: 'block-real-supabase-in-preview-homolog',
        setup(build) {
          build.onResolve({ filter: /utils\/supabase(\.ts)?$/ }, () => ({
            path: stubPath
          }));
        }
      }
    ]
  });

  const jsOutput = result.outputFiles?.[0]?.text ?? '';
  if (!jsOutput) {
    throw new Error('Falha ao gerar bundle isolado de homologação P2.6B.');
  }
  return jsOutput;
}

export function buildHomologSandboxFrameHtml(params: {
  cssText: string;
  bundleJs: string;
}): string {
  const safeCss = params.cssText.replace(/<\/style>/gi, '<\\/style>');
  const safeJs = params.bundleJs.replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none';"
    />
    <title>Homologação Sandbox P2.6B</title>
    <style>${safeCss}</style>
  </head>
  <body class="bg-slate-50 text-slate-900 antialiased">
    <div id="homolog-root"></div>
    <script>
      if (window.origin !== 'null') {
        document.getElementById('homolog-root').innerHTML =
          '<div style="max-width:560px;margin:48px auto;padding:20px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;font-family:system-ui,sans-serif;font-size:13px;"><strong>Execução bloqueada por segurança:</strong> abra <a href="/homologacao">/homologacao</a> para executar dentro do iframe sandbox com origem opaca (null).</div>';
        throw new Error('Acesso direto fora de iframe sandbox bloqueado.');
      }
    </script>
    <script>${safeJs}</script>
  </body>
</html>`;
}

async function resolvePreviewCss(server: ViteDevServer, rootDir: string): Promise<string> {
  try {
    const transformed = await server.transformRequest('/src/index.css?direct');
    if (transformed?.code && !transformed.code.includes('__vite__css')) {
      return transformed.code;
    }
  } catch {
    // fallback para leitura direta se necessário
  }
  try {
    return fs.readFileSync(path.resolve(rootDir, 'src/index.css'), 'utf8');
  } catch {
    return '';
  }
}

export function previewHomologationPlugin(): Plugin {
  let rootDir = process.cwd();

  return {
    name: 'preview-homologation-sandbox',
    apply: 'serve',
    configResolved(config) {
      rootDir = config.root;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = (req.url || '').split('?')[0];

        if (rawUrl === PREVIEW_HOMOLOG_ROUTE || rawUrl === `${PREVIEW_HOMOLOG_ROUTE}/`) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(buildHomologSandboxShellHtml());
          return;
        }

        if (rawUrl === PREVIEW_HOMOLOG_FRAME_ROUTE) {
          try {
            const [bundleJs, cssText] = await Promise.all([
              buildPreviewHomologBundle(rootDir),
              resolvePreviewCss(server, rootDir)
            ]);
            const frameHtml = buildHomologSandboxFrameHtml({ cssText, bundleJs });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(frameHtml);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(
              `Erro ao montar sandbox isolado de homologação: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
          return;
        }

        next();
      });
    },
    transformIndexHtml(html) {
      const launcherMarkup = `
    <a
      id="gfp-preview-homolog-launcher"
      data-testid="preview-homolog-launcher"
      href="${PREVIEW_HOMOLOG_ROUTE}"
      style="position:fixed;bottom:76px;right:14px;z-index:99999;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:8px 12px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:600;text-decoration:none;box-shadow:0 8px 20px rgba(2,6,23,0.28);display:inline-flex;align-items:center;gap:6px;"
    >
      Homologação P2.6B (Sandbox)
    </a>`;
      return html.replace('</body>', `${launcherMarkup}\n  </body>`);
    }
  };
}
