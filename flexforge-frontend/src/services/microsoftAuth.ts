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

const toMicrosoftAuthMessage = (error: unknown): string => {
  const fallback = 'Microsoft login failed. Please try again.';
  if (!error || typeof error !== 'object') return fallback;

  const maybe = error as { errorCode?: string; message?: string };
  const code = (maybe.errorCode || '').toLowerCase();
  if (code.includes('popup_window_error') || code.includes('popup_window_closed')) {
    return 'Microsoft login popup was closed before completion.';
  }
  if (code.includes('user_cancelled')) {
    return 'Microsoft login was cancelled.';
  }
  if (code.includes('no_tokens_found')) {
    return 'Microsoft login did not return an access token. Please try again.';
  }
  if (code.includes('network_error')) {
    return 'Microsoft login network error. Please check your connection and try again.';
  }

  if (maybe.message?.trim()) return maybe.message;
  return fallback;
};

export const getMicrosoftAccessToken = async (): Promise<string> => {
  try {
    const msal = await getClient();
    const scopes = ['User.Read', 'openid', 'profile', 'email'];

    const loginResult = await msal.loginPopup({
      scopes,
      prompt: 'select_account',
    });

    const account = pickAccount(loginResult.account, msal.getAllAccounts());
    msal.setActiveAccount(account);

    const silent = await msal.acquireTokenSilent({
      account,
      scopes: ['User.Read'],
    });
    return silent.accessToken;
  } catch (error) {
    try {
      const msal = await getClient();
      const active = msal.getActiveAccount();
      if (!active) {
        throw error;
      }
      const interactive = await msal.acquireTokenPopup({
        account: active,
        scopes: ['User.Read'],
      });
      return interactive.accessToken;
    } catch (interactiveError) {
      throw new Error(toMicrosoftAuthMessage(interactiveError));
    }
  }
};
