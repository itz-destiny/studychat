import { supabase } from './supabaseClient';

export interface StoredUser {
  id: string;
  email: string;
  name: string | null;
}

export const signUp = async (payload: { name: string; email: string; password: string }) => {
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        name: payload.name,
      },
    },
  });

  if (error) {
    throw error;
  }

  const user = data.user;
  if (!user) {
    throw new Error('Sign up succeeded but no user was returned.');
  }

  if (payload.name) {
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      name: payload.name,
    });
    if (profileError) {
      throw profileError;
    }
  }

  return mapUser(user);
};

export const signIn = async (payload: { email: string; password: string }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error) {
    throw error;
  }

  const user = data.user;
  if (!user) {
    throw new Error('Login failed. Please try again.');
  }

  return mapUser(user);
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

export const getCurrentUser = async (): Promise<StoredUser | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return mapUser(data.user);
};

export const listenToAuthChanges = (handler: (user: StoredUser | null) => void) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user ? mapUser(session.user) : null;
    handler(nextUser);
  });
};

const mapUser = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): StoredUser => {
  const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata?.name : null;
  return {
    id: user.id,
    email: user.email ?? '',
    name: metadataName,
  };
};

