/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEGAL_CONTROLLER_INFO, LEGAL_DOCUMENTS_REGISTRY } from './legalConfig';

export interface LegalSectionItem {
  id: string;
  number: string;
  title: string;
  summary: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: {
    tone: 'info' | 'warning';
    title: string;
    text: string;
  };
}

export interface LegalDocumentContent {
  id: 'terms_of_use' | 'privacy_policy';
  title: string;
  subtitle: string;
  version: string;
  updatedAtBr: string;
  highlights: string[];
  sections: LegalSectionItem[];
}

export const TERMS_OF_USE_CONTENT: LegalDocumentContent = {
  id: 'terms_of_use',
  title: LEGAL_DOCUMENTS_REGISTRY.terms_of_use.title,
  subtitle:
    'Regras de utilização, responsabilidades, condições comerciais dos planos e transparência sobre o funcionamento do Gestão Financeira Pro.',
  version: LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version,
  updatedAtBr: LEGAL_DOCUMENTS_REGISTRY.terms_of_use.updatedAtBr,
  highlights: [
    'Ferramenta de organização e controle financeiro pessoal — não é banco, corretora ou consultoria de investimentos.',
    'Planos comerciais Mensal (30 dias) e Anual (12 meses), com contratação e renovação realizadas pelo WhatsApp oficial, sem cobrança automática.',
    'Após o término de uma assinatura, você preserva o direito de visualizar e exportar seus próprios dados em arquivo JSON.'
  ],
  sections: [
    {
      id: 'objeto-e-finalidade',
      number: '1',
      title: 'Finalidade do Aplicativo e Objeto',
      summary: 'O Gestão Financeira Pro é uma aplicação web de organização financeira pessoal.',
      paragraphs: [
        'Estes Termos de Uso regulam o acesso e a utilização do aplicativo Gestão Financeira Pro, ferramenta digital voltada exclusivamente para o registro, acompanhamento, categorização e planejamento de finanças pessoais pelo próprio usuário.',
        'Por meio da plataforma, o usuário autenticado pode cadastrar contas, cartões de crédito, lançamentos de entradas e despesas, dívidas, metas financeiras, visualizar calendários e gráficos analíticos, bem como exportar cópias de seus registros em formatos JSON, Excel (.xlsx) e PDF.'
      ]
    },
    {
      id: 'nao-instituicao-financeira',
      number: '2',
      title: 'Esclarecimento Essencial: Não Somos Instituição Financeira',
      summary: 'O aplicativo não movimenta dinheiro real e não presta consultoria financeira regulada.',
      paragraphs: [
        'O Gestão Financeira Pro não é banco, instituição de pagamento, financeira, corretora de valores, fintech de crédito nem prestador de consultoria de investimentos regulada pelo Banco Central do Brasil ou pela Comissão de Valores Mobiliários (CVM).',
        'O aplicativo não realiza transferências bancárias, pagamentos, concessão de empréstimos, custódia de recursos, leitura automática de contas bancárias (Open Finance) ou execução de ordens financeiras. Todos os saldos, faturas e projeções exibidos refletem exclusivamente as informações inseridas, importadas ou restauradas pelo próprio usuário.'
      ],
      callout: {
        tone: 'warning',
        title: 'Ausência de recomendação ou garantia de resultado',
        text: 'Relatórios, indicadores e cálculos de poder de compra são recursos informativos de apoio à organização pessoal e não constituem aconselhamento financeiro, contábil, jurídico ou tributário, nem garantem rentabilidade ou quitação de dívidas.'
      }
    },
    {
      id: 'cadastro-e-credenciais',
      number: '3',
      title: 'Cadastro, Conta Individual e Proteção de Credenciais',
      summary: 'Cada conta é individual, protegida por autenticação oficial via Supabase Auth.',
      paragraphs: [
        'Para utilizar a sincronização em nuvem e manter seus dados vinculados à sua conta, é necessário autenticar-se com conta individual utilizando e-mail e senha, link/código enviado ao e-mail ou provedor GitHub OAuth (quando escolhido pelo usuário).',
        'Em fluxos de solicitação de acesso comercial, podem ser solicitados nome completo, número de WhatsApp com DDD, e-mail e indicação do plano de interesse (Mensal ou Anual).'
      ],
      bullets: [
        'O usuário é responsável pela veracidade e atualização das informações fornecidas no cadastro e nos lançamentos financeiros.',
        'As credenciais de acesso (senha, links mágicos e códigos de uso único) são pessoais e intransferíveis. Recomenda-se utilizar senha forte e exclusiva.',
        'Ao utilizar computadores públicos ou dispositivos compartilhados, recomenda-se encerrar a sessão escolhendo a opção de limpeza dos dados locais do navegador.'
      ]
    },
    {
      id: 'planos-e-condicoes-comerciais',
      number: '4',
      title: 'Planos, Assinaturas e Condições de Acesso',
      summary: 'Modalidades Mensal (30 dias) e Anual (12 meses) com atendimento direto e portabilidade após vencimento.',
      paragraphs: [
        'Quando o controle comercial de assinaturas estiver habilitado no ambiente de produção, a utilização completa do aplicativo depende de assinatura ativa vinculada à conta autenticada, nas modalidades públicas Plano Mensal (vigência de 30 dias) ou Plano Anual (vigência de 12 meses), além de modalidades especiais exclusivamente administrativas quando aplicável.',
        `Não há cobrança automática por cartão nem checkout integrado dentro da interface do aplicativo. A consulta de condições, contratação inicial e renovação ocorrem mediante atendimento direto pelo canal oficial de WhatsApp (${LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}), com posterior liberação administrativa da assinatura.`,
        'Se a assinatura expirar ou não for renovada, novas criações, edições e exclusões de dados financeiros são bloqueadas para preservar a integridade comercial, mas o usuário mantém acesso para leitura e exportação de cópia de segurança completa em arquivo JSON com seus dados.'
      ]
    },
    {
      id: 'uso-autorizado-e-deveres',
      number: '5',
      title: 'Uso Autorizado e Responsabilidades do Usuário',
      summary: 'Condutas esperadas para preservação de segurança, integridade e conformidade legal.',
      paragraphs: [
        'O usuário compromete-se a utilizar o Gestão Financeira Pro apenas para fins lícitos e de organização financeira legítima, respeitando os limites técnicos do sistema.'
      ],
      bullets: [
        'Não tentar contornar mecanismos de autenticação, políticas de controle de acesso no banco de dados (RLS), validações de assinatura ou fluxos administrativos.',
        'Não inserir códigos maliciosos em arquivos importados ou nos campos textuais e conferir manualmente planilhas exportadas antes de abri-las ou compartilhá-las com terceiros.',
        'Manter cópias de segurança externas (.json) periódicas de seus dados relevantes e adotar precauções adequadas de proteção do seu próprio dispositivo (antivírus, bloqueio de tela e navegador atualizado).',
        'Não reproduzir, revender, copiar ou explorar comercialmente o código-fonte, layout ou marca do aplicativo sem autorização expressa do titular.'
      ]
    },
    {
      id: 'propriedade-intelectual',
      number: '6',
      title: 'Propriedade Intelectual e Titularidade dos Dados',
      summary: 'A plataforma pertence ao seu titular; os registros financeiros inseridos pertencem ao usuário.',
      paragraphs: [
        'A estrutura, design, textos, fluxos, marca e software que compõem o Gestão Financeira Pro são protegidos pelas leis de propriedade intelectual aplicáveis. O uso do aplicativo concede ao usuário uma licença pessoal, não exclusiva, revogável e intransferível para usufruir da ferramenta enquanto vigente seu acesso.',
        'Todos os dados financeiros, descrições, metas e históricos inseridos pelo usuário pertencem exclusivamente ao usuário titular da conta, podendo ser exportados a qualquer momento nos formatos oferecidos pela interface.'
      ]
    },
    {
      id: 'disponibilidade-e-limitacao',
      number: '7',
      title: 'Disponibilidade, Manutenções e Limitação Razoável de Responsabilidade',
      summary: 'Compromisso de diligência técnica com transparência sobre falhas de rede e terceiros.',
      paragraphs: [
        'O Gestão Financeira Pro busca manter operação estável e segura, mas, como qualquer software baseado em nuvem e navegador web, está sujeito a janelas de manutenção preventiva, atualizações de segurança e eventuais indisponibilidades decorrentes de provedores de infraestrutura, conexão à internet ou configurações locais do dispositivo do usuário.',
        'Na máxima extensão permitida pela legislação brasileira aplicável — sem afastar direitos inderrogáveis do consumidor ou responsabilidades decorrentes de dolo ou culpa grave —, o responsável pelo aplicativo não se responsabiliza por decisões financeiras pessoais tomadas pelo usuário, por perda de dados exclusivamente locais provocada por limpeza manual do navegador sem sincronização ou backup prévio, ou por indisponibilidades externas fora de seu controle direto.'
      ]
    },
    {
      id: 'suspensao-e-encerramento',
      number: '8',
      title: 'Suspensão, Encerramento de Acesso e Exclusão',
      summary: 'Critérios objetivos para suspensão ou encerramento da conta.',
      paragraphs: [
        'O acesso às funcionalidades de edição pode ser suspenso ou encerrado ao término da vigência da assinatura contratada, por solicitação de cancelamento do próprio usuário ou em casos de violação comprovada destes Termos de Uso, tentativa de fraude ou comprometimento de segurança da plataforma.',
        'Em situações de término de vigência comercial, preserva-se o direito de exportação dos registros financeiros pelo usuário. Para solicitações formais de encerramento definitivo de conta e tratamento de dados pessoais, utilize o canal de atendimento informado na Seção 9 e observe os prazos e limitações técnicas descritos na Política de Privacidade.'
      ]
    },
    {
      id: 'atualizacoes-e-contato',
      number: '9',
      title: 'Alterações nos Termos e Canal de Atendimento',
      summary: 'Versionamento transparente e contato oficial com pendências formais declaradas.',
      paragraphs: [
        'Estes Termos de Uso podem ser atualizados para refletir evoluções técnicas, ajustes comerciais ou adequações legais. Cada alteração relevante receberá novo número de versão e data de atualização visíveis nesta página, e eventuais fluxos futuros de aceite considerarão a versão vigente à época.',
        `Atualmente, dúvidas sobre estes Termos de Uso, suporte de conta ou assuntos comerciais podem ser encaminhadas pelo WhatsApp oficial: ${LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}.`
      ],
      callout: {
        tone: 'info',
        title: 'Transparência sobre dados cadastrais jurídicos pendentes',
        text: 'Antes da operação comercial definitiva em larga escala, os campos formais do titular/controlador (nome ou Razão Social, CPF ou CNPJ, e-mail jurídico dedicado e foro contratual) devem ser preenchidos na configuração jurídica oficial da plataforma para exibição completa nesta seção.'
      }
    }
  ]
};
