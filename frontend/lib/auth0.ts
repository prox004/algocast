/**
 * lib/auth0.ts
 * Auth0 configuration and utilities for Next.js frontend
 */

import { useUser } from '@auth0/nextjs-auth0/client';

// Re-export Auth0 hooks for easy importing
export { useUser };

// Auth0 configuration (automatically loaded from environment variables)
export const auth0Config = {
  domain: process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || '',
  clientId: process.env.AUTH0_CLIENT_ID || '',
  audience: process.env.AUTH0_AUDIENCE || '',
};

// API base URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Auth0 API endpoints
export const auth0Endpoints = {
  profile: `${API_BASE_URL}/auth0/profile`,
  token: `${API_BASE_URL}/auth0/token`,
  me: `${API_BASE_URL}/auth0/me`,
  status: `${API_BASE_URL}/auth0/status`,
  linkWallet: `${API_BASE_URL}/auth0/link-wallet`,
  unlinkWallet: `${API_BASE_URL}/auth0/unlink-wallet`,
};

// Helper function to get Auth0 access token for API calls
export async function getAuth0AccessToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/token');
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.accessToken || null;
  } catch (error) {
    console.error('Failed to get Auth0 access token:', error);
    return null;
  }
}

// Helper function to make authenticated API calls
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuth0AccessToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

// User profile interface
export interface Auth0User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  custodial_address: string;
  balance: number;
  external_wallet?: string;
  external_wallet_verified_at?: number;
  oauth_provider: string;
  created_at: number;
}

// Auth0 profile response interface
export interface Auth0ProfileResponse {
  success: boolean;
  user: Auth0User;
  auth0: {
    sub: string;
    email_verified: boolean;
    updated_at: string;
  };
}

// Hook to get user profile from our API
export async function fetchUserProfile(): Promise<Auth0User | null> {
  try {
    const response = await authenticatedFetch(auth0Endpoints.profile);
    if (!response.ok) return null;
    
    const data: Auth0ProfileResponse = await response.json();
    return data.success ? data.user : null;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }
}

// Check if Auth0 is configured
export const isAuth0Configured = (): boolean => {
  return !!(
    process.env.AUTH0_SECRET &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_ISSUER_BASE_URL &&
    process.env.AUTH0_CLIENT_SECRET
  );
};

export default {
  useUser,
  auth0Config,
  auth0Endpoints,
  getAuth0AccessToken,
  authenticatedFetch,
  fetchUserProfile,
  isAuth0Configured,
};