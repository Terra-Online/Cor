import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AtlosReportPage from './AtlosReportPage';
import UserReportPage from './UserReportPage';
import TranslationReportPage from './TranslationReportPage';

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const RootView = path === '/report'
  ? AtlosReportPage
  : path === '/report/users'
    ? UserReportPage
    : path === '/report/translations'
      ? TranslationReportPage
      : App;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootView />
  </React.StrictMode>,
);
