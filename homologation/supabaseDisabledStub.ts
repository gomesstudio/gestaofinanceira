/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stub de isolamento absoluto da Etapa P2.6A.
 * Substitui `src/utils/supabase` no servidor de homologação isolada para impedir qualquer
 * leitura de credenciais, inicialização de cliente Supabase ou acesso a sessões reais.
 */
export const SUPABASE_PROJECT_URL = 'https://homologacao-isolada.invalid';

const blockedAction = async () => {
  throw new Error(
    'Homologação P2.6A isolada: chamadas ao Supabase estão bloqueadas neste ambiente.'
  );
};

export const supabase = {
  auth: {
    getSession: blockedAction,
    getUser: blockedAction,
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => undefined
        }
      }
    })
  },
  from: () => ({
    select: blockedAction,
    upsert: blockedAction,
    insert: blockedAction,
    update: blockedAction,
    delete: blockedAction
  })
};
