import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Garante que o módulo real `src/utils/supabase.ts` nunca seja carregado
 * dentro do servidor de homologação isolada (porta 4173).
 */
function blockRealSupabasePlugin(): Plugin {
  const stubPath = path.resolve(__dirname, 'supabaseDisabledStub.ts');
  return {
    name: 'block-real-supabase-in-homologation',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source === '../utils/supabase' ||
        source.endsWith('/utils/supabase') ||
        source.endsWith('/utils/supabase.ts') ||
        (importer && source.includes('utils/supabase'))
      ) {
        return stubPath;
      }
      return null;
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [blockRealSupabasePlugin(), react(), tailwindcss()],
  server: {
    // Origem de navegador separada da porta 3000 de produção/preview
    port: 4173,
    strictPort: true,
    host: '127.0.0.1'
  },
  preview: {
    port: 4174,
    strictPort: true,
    host: '127.0.0.1'
  },
  build: {
    outDir: path.resolve(__dirname, '../.homolog-dist'),
    emptyOutDir: true
  }
});
