# Roteiro Controlado de Homologação Isolada — P2.6A

## Garantias de Isolamento
- **Feature flag global:** `ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY` permanece **`false`** em produção (`src/utils/recoverySnapshotAdapter.ts`).
- **Origem de navegador separada:** executa exclusivamente em `http://127.0.0.1:4173` (fora da porta `3000` de produção/preview). O navegador particiona `localStorage` e `IndexedDB` por origem (`scheme + host + port`).
- **Zero acesso ao Supabase:** `homologation/vite.homolog.config.ts` substitui `src/utils/supabase.ts` por `homologation/supabaseDisabledStub.ts`. Nenhuma credencial, URL real, chave ou sessão Supabase é carregada.
- **UUIDs fictícios:** utiliza exclusivamente `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` (Usuário A) e `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` (Usuário B).
- **Fora do bundle de produção:** `npm run build` compila apenas `index.html` na raiz; `homologation/` não é importado em `src/App.tsx` nem empacotado em `dist/`.

## Como Iniciar em Navegador Real (Sem Contas Reais)
1. Inicie o servidor isolado de homologação:
   `npm run homolog`
2. Abra `http://127.0.0.1:4173` em uma janela do navegador (preferencialmente perfil/janela anônima para máxima limpeza).
3. Para testar concorrência real entre duas abas, abra `http://127.0.0.1:4173` em uma **segunda aba** do mesmo navegador.

## Checklist de Homologação (10 Verificações)
Clique em **"Executar Roteiro Completo (10 Testes)"** ou valide manualmente pelos botões da bancada:
1. **Criação de pontos preventivos:** confirmar gravação simultânea em `localStorage` e IndexedDB apenas via override local do ambiente de homologação, com flag global mantida `false`.
2. **Retenção máxima de 5 snapshots:** criar 7 versões e confirmar que apenas as 5 mais recentes permanecem para o Usuário A.
3. **Deduplicação de estados consecutivos:** gravar o mesmo estado novamente e confirmar `deduplicated === true` mantendo 5 registros.
4. **Ordenação por data:** confirmar ordenação decrescente do mais recente ao mais antigo.
5. **Visualização de detalhes:** abrir modal somente leitura via **Visualizar Detalhes** (sem botões de restaurar/excluir).
6. **Download individual JSON:** clicar em **Baixar + Validar JSON** e conferir o download de `ponto_recuperacao_*.json` contendo `snapshotId`, `savedAt`, `reason`, `ownerUserId` e `state` íntegro.
7. **Compatibilidade JSON com validação de restauração (Dry-Run):** confirmar que o JSON exportado é validado como `recovery_snapshot` para o mesmo usuário, bloqueado quando mais antigo que a referência atual e rejeitado (`owner_mismatch`) quando avaliado para o Usuário B — **sem executar restauração real**.
8. **Falhas simuladas do IndexedDB:** confirmar tratamento controlado de `idb_unavailable` e `quota_exceeded` preservando o snapshot legado sem vazar dados.
9. **Proteção contra troca de usuário:** confirmar abortamento quando `isSessionStillValid()` retorna `false` e isolamento total entre Usuário A (`aaaa...`) e Usuário B (`bbbb...`).
10. **Concorrência entre abas:** com duas abas abertas em `http://127.0.0.1:4173`, clicar em **"Simular Concorrência Multi-Aba"** e validar retenção `<= 5` e sincronização visual entre abas via `BroadcastChannel` e `IndexedDB`.

## Encerramento
Clique em **"Limpar Dados desta Origem"** ao concluir os testes manuais e feche o processo `npm run homolog`.
