import {
  LandingPage,
  PressureCheckPage,
  PrivateMatchPage,
  ProviderBenefitsPage,
  ProviderFilterPage,
  ProviderJoinPage,
  ProvidersPage,
  StoriesPage,
  SupportOptionsPage,
  ToolsPage,
} from './pages';

function App() {

  if (window.location.pathname === '/pressure-check') {
    return <PressureCheckPage />;
  }

  if (window.location.pathname === '/private-match') {
    return <PrivateMatchPage />;
  }

  if (window.location.pathname === '/providers') {
    return <ProvidersPage />;
  }

  if (window.location.pathname === '/for-providers') {
    return <ProviderBenefitsPage />;
  }

  if (window.location.pathname === '/provider-join') {
    return <ProviderJoinPage />;
  }

  if (window.location.pathname === '/support-options') {
    return <SupportOptionsPage />;
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
