import { LandingPage, PressureCheckPage, ProvidersPage, ToolsPage } from './pages';

function App() {
  if (window.location.pathname === '/pressure-check') {
    return <PressureCheckPage />;
  }

  if (window.location.pathname === '/providers') {
    return <ProvidersPage />;
  }

  if (window.location.pathname === '/tools') {
    return <ToolsPage />;
  }

  return <LandingPage />;
}

export default App;
