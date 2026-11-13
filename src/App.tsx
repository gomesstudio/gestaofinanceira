/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthLockScreen } from './components/auth/AuthLockScreen';
import { FinanceProvider } from './context/FinanceContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { MobileDrawer } from './components/layout/MobileDrawer';
import { MobileModuleBar } from './components/layout/MobileModuleBar';
import { QuickEntryModal } from './components/quick-entry/QuickEntryModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { TransactionsView } from './components/transactions/TransactionsView';
import { IncomesView } from './components/transactions/IncomesView';
import { ExpensesView } from './components/transactions/ExpensesView';
import { DebtsView } from './components/debts/DebtsView';
import { CardsView } from './components/cards/CardsView';
import { PowerOfPurchaseView } from './components/power-of-purchase/PowerOfPurchaseView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { GoalsView } from './components/goals/GoalsView';
import { FinancialCalendarView } from './components/calendar/FinancialCalendarView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';

const MainAppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const renderActiveView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView setCurrentTab={setCurrentTab} />;
      case 'transactions':
        return <TransactionsView />;
      case 'incomes':
        return <IncomesView />;
      case 'expenses':
        return <ExpensesView />;
      case 'debts':
        return <DebtsView />;
      case 'cards':
        return <CardsView />;
      case 'power-of-purchase':
        return <PowerOfPurchaseView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'goals':
        return <GoalsView />;
      case 'calendar':
        return <FinancialCalendarView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView setCurrentTab={setCurrentTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300">
      {/* Desktop Sidebar */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Sticky Header with Hamburger button on mobile */}
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* Dedicated Horizontal Mobile Module Selector Ribbon */}
        <MobileModuleBar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 animate-in fade-in duration-150">
          {renderActiveView()}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Mobile Drawer Menu for full module list */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />

      {/* Global Quick Entry Modal (+ NOVO LANÇAMENTO) */}
      <QuickEntryModal />
    </div>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // A tela de entrada do usuário é a AuthLockScreen com a senha local
  if (!isAuthenticated) {
    return <AuthLockScreen />;
  }

  return <MainAppContent />;
};

export default function App() {
  return (
    <AuthProvider>
      <FinanceProvider>
        <AuthenticatedApp />
      </FinanceProvider>
    </AuthProvider>
  );
}
