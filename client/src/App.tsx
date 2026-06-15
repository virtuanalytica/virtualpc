import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Backlog from './pages/Backlog';
import Issues from './pages/Issues';
import Memory from './pages/Memory';
import Settings from './pages/Settings';
import VirtuAnalytica from './pages/VirtuAnalytica';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { TeamCollaboration } from './pages/TeamCollaboration';
import { TerminalCoordination } from './pages/TerminalCoordination';
import { DailyManagementOverview } from './pages/DailyManagementOverview';

type PageType = 'dashboard' | 'backlog' | 'issues' | 'memory' | 'settings' | 'analytics' | 'team' | 'terminal-coordination' | 'daily-management' | 'virtuanalytica';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [systemHealth, setSystemHealth] = useState<any>(null);

  useEffect(() => {
    // Check system health on load
    fetch('/api/health')
      .then((r: any) => r.json())
      .then((data: any) => setSystemHealth(data))
      .catch((err: any) => console.error('Health check failed:', err));
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard systemHealth={systemHealth} />;
      case 'backlog':
        return <Backlog />;
      case 'issues':
        return <Issues />;
      case 'memory':
        return <Memory />;
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'team':
        return <TeamCollaboration />;
      case 'terminal-coordination':
        return <TerminalCoordination />;
      case 'daily-management':
        return <DailyManagementOverview />;
      case 'virtuanalytica':
        return <VirtuAnalytica />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard systemHealth={systemHealth} />;
    }
  };

  return (
    <div className="app">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
