import {
  LandingPage,
  PressureCheckPage,
  ProviderFilterPage,
  ProvidersPage,
  StoriesPage,
  ToolsPage,
} from './pages';

function App() {

  if (window.location.pathname === '/pressure-check') {
    return <PressureCheckPage />;
  }

  if (window.location.pathname === '/providers') {
    return <ProvidersPage />;
  }

  if (window.location.pathname === '/provider-filter') {
    return <ProviderFilterPage />;
  }

  if (window.location.pathname === '/tools') {
    return <ToolsPage />;
  }

  if (window.location.pathname === '/stories') {
    return <StoriesPage />;
  }

  return <LandingPage />;
}

export default App;
