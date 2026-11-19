/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  hasAuthSensitiveUrlParameters,
  LEGAL_DOCUMENTS_REGISTRY,
  LegalDocumentId,
  resolveLegalDocumentFromLocation
} from '../legal/legalConfig';

interface LegalNavigationContextValue {
  activeLegalDocument: LegalDocumentId | null;
  openLegalDocument: (docId: LegalDocumentId) => void;
  closeLegalDocument: () => void;
}

const LegalNavigationContext = createContext<LegalNavigationContextValue>({
  activeLegalDocument: null,
  openLegalDocument: () => {},
  closeLegalDocument: () => {}
});

function readInitialLegalDocumentFromWindow(): LegalDocumentId | null {
  if (typeof window === 'undefined') return null;
  try {
    return resolveLegalDocumentFromLocation(
      window.location.pathname || '/',
      window.location.hash || '',
      window.location.search || ''
    );
  } catch {
    return null;
  }
}

export const LegalNavigationProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentId | null>(() =>
    readInitialLegalDocumentFromWindow()
  );
  const returnUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromLocation = () => {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      if (hasAuthSensitiveUrlParameters(search, hash)) {
        return;
      }
      const nextDoc = resolveLegalDocumentFromLocation(
        window.location.pathname || '/',
        hash,
        search
      );
      setActiveLegalDocument(nextDoc);
    };

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  const openLegalDocument = useCallback((docId: LegalDocumentId) => {
    if (typeof window !== 'undefined') {
      const currentResolved = resolveLegalDocumentFromLocation(
        window.location.pathname || '/',
        window.location.hash || '',
        window.location.search || ''
      );
      if (!currentResolved && !returnUrlRef.current) {
        returnUrlRef.current = `${window.location.pathname || '/'}${window.location.search || ''}${
          window.location.hash || ''
        }`;
      }

      const targetPath = LEGAL_DOCUMENTS_REGISTRY[docId].routePath;
      try {
        if (!hasAuthSensitiveUrlParameters(window.location.search || '', window.location.hash || '')) {
          window.history.pushState({ legalDoc: docId }, '', targetPath);
        }
      } catch {
        // Fallback silencioso em ambientes com history restrito
      }
    }
    setActiveLegalDocument(docId);
  }, []);

  const closeLegalDocument = useCallback(() => {
    setActiveLegalDocument(null);
    if (typeof window !== 'undefined') {
      const currentResolved = resolveLegalDocumentFromLocation(
        window.location.pathname || '/',
        window.location.hash || '',
        window.location.search || ''
      );
      if (currentResolved) {
        const restoreTarget = returnUrlRef.current || '/';
        returnUrlRef.current = null;
        try {
          window.history.replaceState(null, '', restoreTarget);
        } catch {
          // Fallback silencioso
        }
      }
    }
  }, []);

  return (
    <LegalNavigationContext.Provider
      value={{
        activeLegalDocument,
        openLegalDocument,
        closeLegalDocument
      }}
    >
      {children}
    </LegalNavigationContext.Provider>
  );
};

export const useLegalNavigation = () => useContext(LegalNavigationContext);
