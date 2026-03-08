import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';

const microsoftClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID || '';
const microsoftTenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID || 'common';
const authority = `https://login.microsoftonline.com/${microsoftTenantId}`;

let client: PublicClientApplication | null = null;

const getClient = async () => {
  if (!microsoftClientId) {
    throw new Error('Microsoft login is not configured');
  }

  if (!client) {
    client = new PublicClientApplication({
      auth: {
        clientId: microsoftClientId,
        authority,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    });
    await client.initialize();
  }

  return client;
};

const pickAccount = (
  loginAccount: AccountInfo | null,
  knownAccounts: AccountInfo[],
): AccountInfo => {
  if (loginAccount) return loginAccount;
  if (knownAccounts.length > 0) return knownAccounts[0];
  throw new Error('No Microsoft account was selected');
};

export const getMicrosoftAccessToken = async (): Promise<string> => {
  const msal = await getClient();
  const scopes = ['User.Read', 'openid', 'profile', 'email'];

  const loginResult = await msal.loginPopup({
    scopes,
    prompt: 'select_account',
  });

  const account = pickAccount(loginResult.account, msal.getAllAccounts());
  msal.setActiveAccount(account);

  try {
    const silent = await msal.acquireTokenSilent({
      account,
      scopes: ['User.Read'],
    });
    return silent.accessToken;
  } catch {
    const interactive = await msal.acquireTokenPopup({
      account,
      scopes: ['User.Read'],
    });
    return interactive.accessToken;
  }
};

