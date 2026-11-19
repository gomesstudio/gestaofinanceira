/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEGAL_CONTROLLER_INFO, LEGAL_DOCUMENTS_REGISTRY } from './legalConfig';
import type { LegalDocumentContent } from './termsOfUseContent';

export const PRIVACY_POLICY_CONTENT: LegalDocumentContent = {
  id: 'privacy_policy',
  title: LEGAL_DOCUMENTS_REGISTRY.privacy_policy.title,
  subtitle:
    'Como coletamos, utilizamos, armazenamos e protegemos seus dados pessoais e financeiros no Gestão Financeira Pro em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).',
  version: LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version,
  updatedAtBr: LEGAL_DOCUMENTS_REGISTRY.privacy_policy.updatedAtBr,
  highlights: [
    'Seus lançamentos financeiros ficam associados ao seu identificador individual (UUID) com políticas de isolamento (RLS) no banco de dados e não são exibidos na gestão comercial.',
    'Transparência técnica: os dados na nuvem não possuem criptografia de ponta a ponta (E2E) e administradores com acesso privilegiado de infraestrutura possuem alcance técnico ao banco.',
    'Você controla seus dados locais no navegador (opção de limpar no logout), pode exportar cópias a qualquer momento e exercer seus direitos da LGPD.'
  ],
  sections: [
    {
      id: 'controlador-e-contato',
      number: '1',
      title: 'Identificação do Controlador e Canal de Privacidade',
      summary: 'Quem responde pelo tratamento dos dados e quais dados jurídicos ainda aguardam definição formal.',
      paragraphs: [
        'O tratamento dos dados pessoais realizados no âmbito do aplicativo Gestão Financeira Pro é conduzido pelo titular/operador responsável pela plataforma, com canal oficial atualmente disponível via WhatsApp: ' +
          LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay +
          '.',
        'Por transparência e rigor jurídico, registramos expressamente abaixo os dados cadastrais formais que ainda estão pendentes de preenchimento oficial pelo responsável antes da publicação comercial definitiva, sem utilização de valores fictícios:'
      ],
      bullets: [
        `Nome completo ou Razão Social do controlador: ${
          LEGAL_CONTROLLER_INFO.legalHolderName ?? 'Pendente de definição formal pelo responsável'
        }`,
        `CPF ou CNPJ do controlador: ${
          LEGAL_CONTROLLER_INFO.taxIdCpfOrCnpj ?? 'Pendente de definição formal pelo responsável'
        }`,
        `E-mail oficial para assuntos de privacidade/LGPD: ${
          LEGAL_CONTROLLER_INFO.privacyEmail ?? 'Pendente de definição formal (canal atual via WhatsApp oficial)'
        }`,
        `Encarregado pelo Tratamento de Dados (DPO): ${
          LEGAL_CONTROLLER_INFO.dpoName ?? 'Pendente de indicação ou avaliação de dispensa legal (ANPD)'
        }`
      ]
    },
    {
      id: 'dados-tratados',
      number: '2',
      title: 'Categorias de Dados Efetivamente Tratados',
      summary: 'Apenas os dados realmente utilizados pelo código e pela infraestrutura do aplicativo.',
      paragraphs: [
        'O Gestão Financeira Pro trata exclusivamente as informações necessárias ao funcionamento das telas e fluxos existentes no sistema:'
      ],
      bullets: [
        'Dados de autenticação e identificação da conta (Supabase Auth): endereço de e-mail, senha gerenciada pelo serviço de autenticação, identificador único do usuário (UUID), nome de exibição e dados básicos de perfil autorizados se você optar pelo login com GitHub OAuth.',
        'Dados cadastrais e comerciais de solicitação/assinatura: nome completo, número de WhatsApp com DDD, plano de interesse selecionado (Mensal ou Anual), status da solicitação/assinatura, vigência, registro administrativo de pagamentos e escolha explícita de consentimento para contato via WhatsApp.',
        'Dados financeiros pessoais inseridos ou importados por você: receitas, despesas, transferências, contas bancárias/carteiras, cartões de crédito, dívidas e histórico de pagamentos, objetivos financeiros, categorias personalizadas e valor desejado de reserva de segurança (armazenados na estrutura JSONB vinculada ao seu UUID).',
        'Preferências e dados técnicos locais de sessão: escolha de tema claro/escuro, cópia preventiva local de recuperação e estado temporário da sessão ativa no navegador.'
      ],
      callout: {
        tone: 'info',
        title: 'O que NÃO coletamos nem processamos',
        text: 'O aplicativo não realiza leitura automática de contas bancárias (Open Finance), não coleta biometria, não monitora geolocalização GPS contínua e não envia seus dados financeiros para modelos de inteligência artificial generativa.'
      }
    },
    {
      id: 'finalidades-e-bases-legais',
      number: '3',
      title: 'Finalidades e Bases Legais de Tratamento (LGPD Art. 7º)',
      summary: 'Cada operação possui fundamento jurídico próprio; os Termos de Uso não funcionam como consentimento genérico.',
      paragraphs: [
        'Em respeito à LGPD, as finalidades de tratamento apoiam-se em bases legais distintas e proporcionais, não sendo utilizado o aceite de Termos de Uso como consentimento genérico para todas as operações:'
      ],
      bullets: [
        'Execução de contrato ou de procedimentos preliminares (Art. 7º, V): autenticação de acesso, gravação e sincronização multi-dispositivo dos dados financeiros, controle de vigência dos planos contratados, processamento de backups/restaurações solicitados e atendimento a solicitações de cadastro.',
        'Legítimo interesse (Art. 7º, IX): proteção contra fraudes e acessos indevidos, prevenção contra injeção de fórmulas maliciosas em planilhas exportadas, diagnóstico básico de sincronização e manutenção da estabilidade do serviço.',
        'Cumprimento de obrigação legal ou regulatória (Art. 7º, II): manutenção de registros comerciais mínimos de faturamento/pagamentos ou atendimento a requisições legais válidas.',
        'Consentimento específico do titular (Art. 7º, I): autorização expressa e opcional marcada pelo próprio usuário antes de compartilhar nome, WhatsApp, e-mail e plano solicitado com o canal comercial pelo WhatsApp.'
      ]
    },
    {
      id: 'armazenamento-local-e-nuvem',
      number: '4',
      title: 'Armazenamento Local no Navegador e Sincronização na Nuvem',
      summary: 'Explicação clara sobre localStorage, IndexedDB, sessionStorage e banco PostgreSQL.',
      paragraphs: [
        'Para oferecer agilidade de uso e proteção contra perda acidental de alterações, o aplicativo combina armazenamento remoto na nuvem (PostgreSQL gerenciado via Supabase) e caches locais particionados pelo identificador da conta (UUID) no navegador:'
      ],
      bullets: [
        'localStorage (chaves escopadas finance_pro_app_state_<uuid> e finance_pro_recovery_<uuid>): mantém cópia local isolada para a conta conectada, além de preferência de tema (finance_theme) e solicitação pendente temporária (gfp_pending_access_request:<email>) até a confirmação do cadastro.',
        'IndexedDB (gestao_financeira_recovery_db): armazena localmente até 5 pontos de recuperação preventiva por usuário antes de restaurações ou sincronizações importantes.',
        'sessionStorage: utilizado apenas de forma transitória durante a sessão aberta e limpo no encerramento explícito da sessão.',
        'Controle no logout: ao encerrar a sessão manualmente, você pode optar por "Limpar dados locais" (removendo estado financeiro local, snapshots de recuperação, IndexedDB e sessionStorage da conta no dispositivo) ou manter cópia offline local apenas se estiver em dispositivo pessoal confiável. Se outra conta entrar no mesmo navegador, os dados locais pertencentes ao usuário anterior são removidos.'
      ]
    },
    {
      id: 'operadores-e-transferencia-internacional',
      number: '5',
      title: 'Serviços Externos Utilizados e Transferência Internacional',
      summary: 'Relação exata dos operadores técnicos envolvidos e transparência sobre infraestrutura em nuvem.',
      paragraphs: [
        'Para viabilizar a operação técnica do aplicativo, utilizamos exclusivamente os serviços externos abaixo descritos:'
      ],
      bullets: [
        'Supabase (Auth e PostgreSQL): autenticação, controle de sessão e banco de dados em nuvem com políticas RLS.',
        'Cloudflare (Assets estáticos e borda HTTPS): hospedagem e distribuição segura dos arquivos da interface web.',
        'GitHub OAuth (opcional): acionado apenas quando você escolhe autenticar-se usando sua conta GitHub.',
        'WhatsApp (opcional e externo): acionado exclusivamente por clique voluntário seu para conversar com o atendimento oficial (+55 33 99103-1052).'
      ],
      callout: {
        tone: 'info',
        title: 'Transferência internacional de dados',
        text: 'Dependendo da região do projeto Supabase, dos nós de rede da Cloudflare e de serviços opcionais escolhidos por você (como GitHub ou WhatsApp), dados técnicos ou registros hospedados podem transitar ou ser processados em servidores fora do Brasil, utilizando criptografia em trânsito (HTTPS/TLS).'
      }
    },
    {
      id: 'compartilhamento-e-segregacao',
      number: '6',
      title: 'Compartilhamento de Dados e Segregação Administrativa',
      summary: 'Não vendemos dados pessoais nem exibimos lançamentos financeiros privados no painel comercial.',
      paragraphs: [
        'O Gestão Financeira Pro não vende, aluga ou comercializa dados pessoais ou financeiros dos usuários com terceiros, corretoras ou redes de publicidade.',
        'No acesso comercial e administrativo, o painel Master gerencia exclusivamente cadastros de solicitação de acesso, status de assinaturas, registros comerciais de pagamento e trilhas de auditoria administrativa, sem exibir seus lançamentos, contas bancárias, dívidas ou objetivos financeiros privados na interface comercial.'
      ]
    },
    {
      id: 'seguranca-e-limitacoes-honestas',
      number: '7',
      title: 'Segurança da Informação e Limitações Técnicas Reais',
      summary: 'Medidas adotadas hoje e declaração honesta dos limites técnicos existentes.',
      paragraphs: [
        'Adotamos medidas técnicas razoáveis e compatíveis com a arquitetura atual do aplicativo: autenticação via Supabase Auth, transporte protegido por HTTPS/TLS, políticas de isolamento por linha no PostgreSQL (RLS vinculando auth.uid() = user_id), remoção de permissões anônimas nas tabelas sensíveis, ausência de chaves privilegiadas (service_role) no código do navegador, isolamento de armazenamento local por UUID, limpeza de parâmetros sensíveis em URLs de autenticação e neutralização de fórmulas em exportações Excel.',
        'Contudo, por compromisso estrito com a transparência e proibição de promessas irreais, declaramos expressamente as seguintes limitações técnicas:'
      ],
      bullets: [
        'Os dados financeiros gravados no banco de dados na nuvem NÃO contam com criptografia de ponta a ponta (E2E) gerenciada exclusivamente por chave do cliente.',
        'Administradores com acesso privilegiado de infraestrutura ao projeto de banco de dados (ou provedores de nuvem com acesso operacional ao servidor PostgreSQL) possuem alcance técnico potencial ao banco de dados, razão pela qual controles administrativos e chaves secretas ficam restritos fora do aplicativo cliente.',
        'Nenhum sistema conectado à internet ou armazenamento em navegador está imune a riscos ou pode prometer segurança absoluta; recomenda-se proteção do dispositivo pessoal, senha forte e backups periódicos.'
      ],
      callout: {
        tone: 'warning',
        title: 'Sem promessas irreais de segurança',
        text: 'Não afirmamos anonimização irreversível dos lançamentos nem impossibilidade técnica absoluta de acesso de infraestrutura ao banco de dados. Trabalhamos com segregação por usuário (RLS), mínimo privilégio no frontend e transparência contínua.'
      }
    },
    {
      id: 'retencao-exportacao-e-exclusao',
      number: '8',
      title: 'Retenção, Exportação, Exclusão de Dados e Backups',
      summary: 'Como você exporta seus registros e como funciona a exclusão hoje.',
      paragraphs: [
        'Os dados financeiros e cadastrais permanecem armazenados enquanto sua conta estiver ativa ou pelo período necessário ao cumprimento de finalidades contratuais, comerciais e obrigações legais aplicáveis.',
        'Você pode exportar todos os seus registros a qualquer momento em JSON (inclusive para portabilidade após eventual vencimento de assinatura), bem como gerar planilhas Excel (.xlsx) e relatórios PDF diretamente pelo navegador.',
        'Sobre a exclusão de dados e backups, esclarecemos com honestidade o funcionamento atual:'
      ],
      bullets: [
        'Dados locais no navegador: você pode removê-los imediatamente ao sair da conta selecionando "Limpar dados locais", ou pelas configurações de armazenamento do seu navegador.',
        'Exclusão da conta e dados na nuvem: atualmente não existe botão automatizado de autoexclusão definitiva de conta diretamente na interface do aplicativo. Solicitações de exclusão de conta ou eliminação de dados devem ser encaminhadas pelo canal oficial de atendimento (+55 33 99103-1052) e passam por verificação de titularidade.',
        'Backups de infraestrutura: eventuais backups automáticos mantidos pelo provedor de banco de dados em nuvem (Supabase) seguem o ciclo técnico de retenção e rotação da infraestrutura, não sendo possível garantir remoção instantânea em cópias de redundância já geradas pelo provedor.'
      ]
    },
    {
      id: 'direitos-do-titular',
      number: '9',
      title: 'Direitos do Titular de Dados (LGPD Art. 18) e Contato',
      summary: 'Seus direitos previstos em lei e como exercê-los.',
      paragraphs: [
        'Nos termos da LGPD, você pode solicitar, mediante confirmação de identidade: confirmação da existência de tratamento; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; portabilidade (já apoiada pela exportação completa em JSON); eliminação ou bloqueio quando aplicável; informação sobre compartilhamentos realizados; e revogação de consentimentos anteriormente concedidos.',
        `Enquanto o e-mail jurídico dedicado de privacidade estiver em processo de definição formal, as solicitações relacionadas à LGPD e proteção de dados podem ser encaminhadas pelo canal oficial de WhatsApp: ${LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}.`
      ]
    },
    {
      id: 'atualizacoes-politica',
      number: '10',
      title: 'Atualizações desta Política de Privacidade',
      summary: 'Controle de versão e transparência em alterações futuras.',
      paragraphs: [
        'Esta Política de Privacidade será atualizada sempre que houver alterações relevantes no tratamento de dados, inclusão de novos operadores técnicos, preenchimento dos dados formais do controlador ou implantação de mecanismos adicionais de controle e registro de consentimento.',
        'A versão em vigor e a data da última atualização ficam permanentemente visíveis no cabeçalho desta página e na seção de Documentos Legais das Configurações.'
      ]
    }
  ]
};
