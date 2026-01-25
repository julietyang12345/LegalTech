import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ overflowX: 'clip', width: '100%', minHeight: '100vh' }}>
      <App />
    </div>
  </React.StrictMode>
);
