import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const THEME_KEY = 'peakmind-theme';
const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;

if (storedTheme === 'dark') {
  document.documentElement.classList.add('theme-dark');
  document.documentElement.classList.remove('theme-light');
} else {
  document.documentElement.classList.add('theme-light');
  document.documentElement.classList.remove('theme-dark');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
