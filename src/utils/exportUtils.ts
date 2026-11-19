/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BankAccount, CreditCard, Debt, FinancialGoal, Transaction } from '../types/finance';
import { formatCurrency, formatDateBR } from './formatters';

export interface ExportDataParams {
  periodLabel: string;
  transactions: Transaction[];
  accounts: BankAccount[];
  creditCards: CreditCard[];
  debts: Debt[];
  goals: FinancialGoal[];
  kpis: {
    totalBankBalance: number;
    totalIncome: number;
    totalExpense: number;
    fixedExpense: number;
    variableExpense: number;
    activeDebts: number;
    freeMoney: number;
    committedPercent: number;
    savedAmount: number;
  };
}

// Caracteres de controle ASCII inseguros (exclui \t, \r, \n que são tratados na regra de prefixo)
const UNSAFE_CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_FORMULA_START_REGEX = /^[=+\-@\t\r\n]/;
const LEADING_WHITESPACE_FORMULA_REGEX = /^[\s\u00A0\uFEFF]+[=+\-@]/;

/**
 * Neutraliza textos potencialmente interpretáveis como fórmulas em planilhas (Excel/LibreOffice/Sheets/CSV),
 * removendo caracteres de controle inseguros e prefixando com apóstrofo literal (') payloads iniciados
 * por =, +, -, @, tabulação, quebra de linha ou espaços seguidos de gatilho de fórmula.
 */
export function sanitizeExcelTextCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const withoutUnsafeControlChars = String(value).replace(UNSAFE_CONTROL_CHARS_REGEX, '');
  if (!withoutUnsafeControlChars) return '';

  if (
    DANGEROUS_FORMULA_START_REGEX.test(withoutUnsafeControlChars) ||
    LEADING_WHITESPACE_FORMULA_REGEX.test(withoutUnsafeControlChars)
  ) {
    return `'${withoutUnsafeControlChars}`;
  }

  return withoutUnsafeControlChars;
}

/**
 * Formata datas para planilha preservando o marcador legítimo '-' quando ausente,
 * mas neutralizando strings inválidas/injetadas que eventualmente venham de dados importados.
 */
export function sanitizeDateCellForExcel(dateString: string | undefined | null): string {
  if (!dateString) return '-';
  const formatted = formatDateBR(dateString);
  if (formatted === '-') return '-';
  return sanitizeExcelTextCell(formatted);
}

function sanitizePdfText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

function sanitizeFileNameSegment(label: string): string {
  const cleaned = sanitizePdfText(label)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'Periodo';
}

function buildSafeWorksheetFromAoa(rows: (string | number)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const cell = ws[key] as XLSX.CellObject | undefined;
    if (!cell) continue;
    if ('f' in cell) {
      delete cell.f;
    }
    if (typeof cell.v === 'string') {
      cell.t = 's';
      cell.v = cell.v.replace(UNSAFE_CONTROL_CHARS_REGEX, '');
    }
  }
  return ws;
}

export function buildExcelWorkbook({
  periodLabel,
  transactions,
  accounts,
  creditCards,
  debts,
  goals,
  kpis
}: ExportDataParams): { workbook: XLSX.WorkBook; fileName: string } {
  const wb = XLSX.utils.book_new();
  const safePeriodLabel = sanitizeExcelTextCell(periodLabel);

  // 1. Dashboard e Resumo
  const summaryData: (string | number)[][] = [
    ['RELATÓRIO FINANCEIRO PESSOAL - RESUMO EXECUTIVO'],
    ['Período:', safePeriodLabel],
    ['Gerado em:', new Date().toLocaleString('pt-BR')],
    [],
    ['INDICADOR', 'VALOR'],
    ['Saldo Bancário Total (Todas as Contas)', kpis.totalBankBalance],
    ['Total de Entradas', kpis.totalIncome],
    ['Total de Despesas', kpis.totalExpense],
    ['Despesas Fixas', kpis.fixedExpense],
    ['Despesas Variáveis', kpis.variableExpense],
    ['Total de Dívidas em Aberto', kpis.activeDebts],
    ['Dinheiro Livre Disponível (Poder de Compra)', kpis.freeMoney],
    ['Percentual da Renda Comprometida (%)', `${kpis.committedPercent.toFixed(1)}%`],
    ['Economias no Período (Sobra)', kpis.savedAmount],
    [],
    ['CONTAS BANCÁRIAS E CARTEIRAS'],
    ['Nome da Conta', 'Tipo', 'Saldo Atual'],
    ...accounts.map(a => [
      sanitizeExcelTextCell(a.name),
      sanitizeExcelTextCell(a.type),
      a.balance
    ])
  ];
  const wsSummary = buildSafeWorksheetFromAoa(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Dashboard e Resumo');

  // 2. Entradas
  const incomes = transactions.filter(t => t.type === 'income');
  const incomesData: (string | number)[][] = [
    ['ID', 'Data', 'Descrição', 'Categoria', 'Conta de Destino', 'Forma', 'Status', 'Valor (R$)', 'Observações'],
    ...incomes.map(t => {
      const accountName = accounts.find(a => a.id === t.accountId)?.name;
      return [
        sanitizeExcelTextCell(t.id),
        sanitizeDateCellForExcel(t.date),
        sanitizeExcelTextCell(t.description),
        sanitizeExcelTextCell(t.category),
        accountName ? sanitizeExcelTextCell(accountName) : '-',
        sanitizeExcelTextCell(t.paymentMethod),
        t.status === 'paid' ? 'Recebido' : 'Pendente',
        t.amount,
        sanitizeExcelTextCell(t.notes || '')
      ];
    })
  ];
  const wsIncomes = buildSafeWorksheetFromAoa(incomesData);
  XLSX.utils.book_append_sheet(wb, wsIncomes, 'Entradas');

  // 3. Despesas (Todas)
  const allExpenses = transactions.filter(t => t.type === 'expense_fixed' || t.type === 'expense_variable');
  const expensesData: (string | number)[][] = [
    ['ID', 'Data', 'Vencimento', 'Descrição', 'Tipo', 'Categoria', 'Forma de Pagamento', 'Conta/Cartão', 'Status', 'Valor (R$)', 'Parcela', 'Observações'],
    ...allExpenses.map(t => {
      const sourceName = t.creditCardId
        ? creditCards.find(c => c.id === t.creditCardId)?.name
        : accounts.find(a => a.id === t.accountId)?.name;
      return [
        sanitizeExcelTextCell(t.id),
        sanitizeDateCellForExcel(t.date),
        sanitizeDateCellForExcel(t.dueDate),
        sanitizeExcelTextCell(t.description),
        t.type === 'expense_fixed' ? 'Fixa' : 'Variável',
        sanitizeExcelTextCell(t.category),
        sanitizeExcelTextCell(t.paymentMethod),
        sourceName ? sanitizeExcelTextCell(sourceName) : '-',
        t.status === 'paid' ? 'Pago' : t.status === 'overdue' ? 'Atrasado' : 'Pendente',
        t.amount,
        t.installmentInfo ? `${t.installmentInfo.current}/${t.installmentInfo.total}` : 'À vista',
        sanitizeExcelTextCell(t.notes || '')
      ];
    })
  ];
  const wsExpenses = buildSafeWorksheetFromAoa(expensesData);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Despesas');

  // 4. Despesas Fixas
  const fixedExpenses = transactions.filter(t => t.type === 'expense_fixed');
  const wsFixed = buildSafeWorksheetFromAoa([
    ['ID', 'Data', 'Vencimento', 'Descrição', 'Categoria', 'Forma', 'Status', 'Valor (R$)', 'Observações'],
    ...fixedExpenses.map(t => [
      sanitizeExcelTextCell(t.id),
      sanitizeDateCellForExcel(t.date),
      sanitizeDateCellForExcel(t.dueDate),
      sanitizeExcelTextCell(t.description),
      sanitizeExcelTextCell(t.category),
      sanitizeExcelTextCell(t.paymentMethod),
      t.status === 'paid' ? 'Pago' : 'Pendente',
      t.amount,
      sanitizeExcelTextCell(t.notes || '')
    ])
  ]);
  XLSX.utils.book_append_sheet(wb, wsFixed, 'Despesas Fixas');

  // 5. Despesas Variáveis
  const varExpenses = transactions.filter(t => t.type === 'expense_variable');
  const wsVar = buildSafeWorksheetFromAoa([
    ['ID', 'Data', 'Descrição', 'Categoria', 'Forma', 'Status', 'Valor (R$)', 'Observações'],
    ...varExpenses.map(t => [
      sanitizeExcelTextCell(t.id),
      sanitizeDateCellForExcel(t.date),
      sanitizeExcelTextCell(t.description),
      sanitizeExcelTextCell(t.category),
      sanitizeExcelTextCell(t.paymentMethod),
      t.status === 'paid' ? 'Pago' : 'Pendente',
      t.amount,
      sanitizeExcelTextCell(t.notes || '')
    ])
  ]);
  XLSX.utils.book_append_sheet(wb, wsVar, 'Despesas Variáveis');

  // 6. Dívidas
  const debtsData: (string | number)[][] = [
    ['Credor / Nome', 'Valor Original (R$)', 'Saldo Devedor Atual (R$)', 'Total Pago (R$)', 'Juros Mensal (%)', 'Parcela Mínima (R$)', 'Prioridade', 'Status', 'Vencimento', 'Observações'],
    ...debts.map(d => [
      sanitizeExcelTextCell(`${d.creditor} - ${d.name}`),
      d.originalAmount,
      d.currentBalance,
      d.totalPaid,
      d.interestRateMonthly || 0,
      d.minimumPayment || 0,
      sanitizeExcelTextCell(d.priority),
      sanitizeExcelTextCell(d.status),
      sanitizeDateCellForExcel(d.dueDate),
      sanitizeExcelTextCell(d.notes || '')
    ])
  ];
  const wsDebts = buildSafeWorksheetFromAoa(debtsData);
  XLSX.utils.book_append_sheet(wb, wsDebts, 'Dívidas');

  // 7. Cartões e Faturas
  const cardsData: (string | number)[][] = [
    ['Nome do Cartão', 'Limite Total (R$)', 'Dia Fechamento', 'Dia Vencimento', 'Conta de Débito Vinculada'],
    ...creditCards.map(c => {
      const linkedName = accounts.find(a => a.id === c.linkedAccountId)?.name;
      return [
        sanitizeExcelTextCell(c.name),
        c.limitTotal,
        c.closingDay,
        c.dueDay,
        linkedName ? sanitizeExcelTextCell(linkedName) : 'Manual'
      ];
    })
  ];
  const wsCards = buildSafeWorksheetFromAoa(cardsData);
  XLSX.utils.book_append_sheet(wb, wsCards, 'Cartões e Faturas');

  // 8. Objetivos Financeiros
  const goalsData: (string | number)[][] = [
    ['Objetivo', 'Categoria', 'Valor Desejado (R$)', 'Valor Acumulado (R$)', 'Progresso (%)', 'Aporte Mensal Planejado (R$)', 'Prazo Final'],
    ...goals.map(g => [
      sanitizeExcelTextCell(g.name),
      sanitizeExcelTextCell(g.category),
      g.targetAmount,
      g.currentAmount,
      g.targetAmount > 0 ? `${((g.currentAmount / g.targetAmount) * 100).toFixed(1)}%` : '0.0%',
      g.monthlyPlannedContribution,
      sanitizeDateCellForExcel(g.deadlineDate)
    ])
  ];
  const wsGoals = buildSafeWorksheetFromAoa(goalsData);
  XLSX.utils.book_append_sheet(wb, wsGoals, 'Objetivos Financeiros');

  // 9. Histórico Completo
  const allHistoryData: (string | number)[][] = [
    ['ID', 'Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Forma Pagamento', 'Status', 'Conta', 'Cartão', 'Observações'],
    ...transactions.map(t => {
      const accountName = accounts.find(a => a.id === t.accountId)?.name || '';
      const cardName = creditCards.find(c => c.id === t.creditCardId)?.name || '';
      return [
        sanitizeExcelTextCell(t.id),
        sanitizeDateCellForExcel(t.date),
        sanitizeExcelTextCell(t.type),
        sanitizeExcelTextCell(t.description),
        sanitizeExcelTextCell(t.category),
        t.amount,
        sanitizeExcelTextCell(t.paymentMethod),
        sanitizeExcelTextCell(t.status),
        sanitizeExcelTextCell(accountName),
        sanitizeExcelTextCell(cardName),
        sanitizeExcelTextCell(t.notes || '')
      ];
    })
  ];
  const wsHistory = buildSafeWorksheetFromAoa(allHistoryData);
  XLSX.utils.book_append_sheet(wb, wsHistory, 'Histórico Completo');

  const fileName = `Controle_Financeiro_${sanitizeFileNameSegment(periodLabel)}_${new Date().toISOString().split('T')[0]}.xlsx`;
  return { workbook: wb, fileName };
}

export function exportToExcel(
  params: ExportDataParams,
  writeWorkbook: (wb: XLSX.WorkBook, fileName: string) => void = XLSX.writeFile
): void {
  const { workbook, fileName } = buildExcelWorkbook(params);
  writeWorkbook(workbook, fileName);
}

export function exportToPDF({
  periodLabel,
  transactions,
  accounts,
  debts,
  kpis
}: ExportDataParams): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Relatório Financeiro Pessoal', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Período de Referência: ${sanitizePdfText(periodLabel)} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

  // Line divider
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 32, pageWidth - 14, 32);

  // Summary Metrics Table
  const summaryRows = [
    ['Saldo Bancário Total (Disponível)', formatCurrency(kpis.totalBankBalance)],
    ['Total de Entradas no Período', formatCurrency(kpis.totalIncome)],
    ['Total de Despesas no Período', formatCurrency(kpis.totalExpense)],
    ['Despesas Fixas', formatCurrency(kpis.fixedExpense)],
    ['Despesas Variáveis', formatCurrency(kpis.variableExpense)],
    ['Dinheiro Livre Disponível (Poder de Compra)', formatCurrency(kpis.freeMoney)],
    ['Dívidas em Aberto (Total Acumulado)', formatCurrency(kpis.activeDebts)],
    ['Percentual da Renda Comprometida', `${kpis.committedPercent.toFixed(1)}%`],
    ['Economias do Período (Sobra Líquida)', formatCurrency(kpis.savedAmount)],
  ];

  autoTable(doc, {
    startY: 36,
    head: [['Indicador de Desempenho', 'Valor']],
    body: summaryRows,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right', fontStyle: 'bold' } }
  });

  // Top Expense Categories
  const categoryMap: { [cat: string]: number } = {};
  transactions
    .filter(t => t.type === 'expense_fixed' || t.type === 'expense_variable')
    .forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });

  const sortedCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  // @ts-ignore
  const nextY = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Maiores Gastos por Categoria', 14, nextY);

  const categoryRows = sortedCategories.map(([cat, amount]) => [
    sanitizePdfText(cat),
    formatCurrency(amount),
    kpis.totalExpense > 0 ? `${((amount / kpis.totalExpense) * 100).toFixed(1)}%` : '0%'
  ]);

  autoTable(doc, {
    startY: nextY + 4,
    head: [['Categoria', 'Total Gasto', '% do Total']],
    body: categoryRows.length > 0 ? categoryRows : [['Sem lançamentos no período', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
  });

  // Debts Table
  if (debts.length > 0) {
    // @ts-ignore
    const debtsY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.text('Dívidas e Pendências em Aberto', 14, debtsY);

    const debtRows = debts.map(d => [
      sanitizePdfText(`${d.creditor} - ${d.name}`),
      formatCurrency(d.currentBalance),
      sanitizePdfText(d.status),
      sanitizeDateCellForExcel(d.dueDate) === '-' ? '-' : formatDateBR(d.dueDate)
    ]);

    autoTable(doc, {
      startY: debtsY + 4,
      head: [['Dívida / Credor', 'Saldo Devedor', 'Status', 'Vencimento']],
      body: debtRows,
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 1: { halign: 'right' } }
    });
  }

  // Footer note
  // @ts-ignore
  const finalY = (doc as any).lastAutoTable.finalY + 14;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Gestão Financeira Pro - Sistema de Controle Financeiro Pessoal', 14, Math.min(finalY, 285));

  const fileName = `Relatorio_Financeiro_${sanitizeFileNameSegment(periodLabel)}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
