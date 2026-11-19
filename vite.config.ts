import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {previewHomologationPlugin} from './homologation/vitePreviewHomologPlugin';

const DEFAULT_SUPABASE_URL = 'https://lwkecyfhpkyuakbbxksl.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_WJFITYIkMpYJAiPErF4iWA_lzK9QdMI';

export default defineConfig(({command}) => {
  const envKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const safeKey =
    envKey && envKey.length > 20 && (envKey.startsWith('sb_publishable_') || envKey.startsWith('eyJ'))
      ? envKey
      : DEFAULT_SUPABASE_KEY;

  const envUrl = process.env.VITE_SUPABASE_URL;
  const safeUrl = envUrl && envUrl.startsWith('http') ? envUrl : DEFAULT_SUPABASE_URL;

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(command === 'serve' ? [previewHomologationPlugin()] : []),
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(safeUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(safeKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
