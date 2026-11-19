/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { HomologationApp } from './HomologationApp';

createRoot(document.getElementById('homolog-root')!).render(
  <StrictMode>
    <HomologationApp />
  </StrictMode>
);
