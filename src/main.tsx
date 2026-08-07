import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AtlosReportPage from './AtlosReportPage';
import UserReportPage from './UserReportPage';
import TranslationReportPage from './TranslationReportPage';
import { ReportLocaleProvider } from './reportLocale';

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isReportPage = path === '/report'
  || path === '/report/users'
  || path === '/report/translations';
const RootView = path === '/report'
  ? AtlosReportPage
  : path === '/report/users'
    ? UserReportPage
    : path === '/report/translations'
      ? TranslationReportPage
      : App;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isReportPage ? (
      <ReportLocaleProvider><RootView /></ReportLocaleProvider>
    ) : (
      <RootView />
    )}
  </React.StrictMode>,
);
