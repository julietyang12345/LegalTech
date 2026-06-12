import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const THEME_KEY = 'peakmind-theme';
const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;

if (storedTheme === 'light') {
  document.documentElement.classList.add('theme-light');
  document.documentElement.classList.remove('theme-dark');
} else {
  document.documentElement.classList.add('theme-dark');
  document.documentElement.classList.remove('theme-light');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
