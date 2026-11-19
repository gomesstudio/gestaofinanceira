/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import './initPreviewSandbox';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HomologationApp } from './HomologationApp';
import {
  getPreviewSandboxIdbFactory,
  setSandboxLocalStorageWriteFailure
} from './initPreviewSandbox';

const rootEl = document.getElementById('homolog-root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <HomologationApp
        sandboxMode="opaque_preview"
        indexedDBFactory={getPreviewSandboxIdbFactory()}
        onToggleLocalStorageFailure={setSandboxLocalStorageWriteFailure}
      />
    </StrictMode>
  );
}
