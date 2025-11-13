
import React, { useEffect, useMemo, useState } from 'react';
import ChatBot from './components/ChatBot';
import { SparklesIcon } from './components/Icons';
import AuthModal from './components/AuthModal';
import { StoredUser, getCurrentUser, listenToAuthChanges, signIn, signOut, signUp } from './utils/auth';
import { supabase } from './utils/supabaseClient';
import type { Conversation } from './types';

const DEFAULT_CONVERSATION_TITLE = 'New chat';

const App: React.FC = () => {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      const existingUser = await getCurrentUser();
      if (existingUser) {
        setUser(existingUser);
      }
    };
    initialize();

    const { data: listener } = listenToAuthChanges(nextUser => {
      setUser(nextUser);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadConversations = async () => {
      if (!user) {
        setConversations([]);
        setActiveConversationId(null);
        return;
      }

      setIsConversationsLoading(true);
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('id, title, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          const created = await createConversation(user.id, DEFAULT_CONVERSATION_TITLE);
          if (created) {
            setConversations([created]);
            setActiveConversationId(created.id);
          }
        } else {
          setConversations(data);
          setActiveConversationId(prev => prev ?? data[0].id);
        }
      } catch (error) {
        console.error('Failed to load conversations', error);
      } finally {
        setIsConversationsLoading(false);
      }
    };

    loadConversations();
  }, [user]);

  const isAuthenticated = useMemo(() => user !== null, [user]);

  const openAuthModal = (mode: 'login' | 'signup') => setAuthMode(mode);
  const closeAuthModal = () => setAuthMode(null);

  const handleAuthenticate = async (payload: { name?: string; email: string; password: string }) => {
    if (!authMode) return;

    if (authMode === 'signup') {
      if (!payload.name) {
        throw new Error('Please share your name so we can personalize your study space.');
      }
      const signedUpUser = await signUp({
        name: payload.name,
        email: payload.email,
        password: payload.password,
      });
      setUser(signedUpUser);
    } else {
      const signedInUser = await signIn({
        email: payload.email,
        password: payload.password,
      });
      setUser(signedInUser);
    }

    closeAuthModal();
    setIsSidebarOpen(false);
  };

  const handleTrainModel = () => {
    setIsTraining(true);
    setTimeout(() => setIsTraining(false), 1500);
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setConversations([]);
    setActiveConversationId(null);
    setIsSidebarOpen(false);
  };

  const handleCreateConversation = async () => {
    if (!user) return;
    try {
      const created = await createConversation(user.id, DEFAULT_CONVERSATION_TITLE);
      if (created) {
        setConversations(prev => [created, ...prev]);
        setActiveConversationId(created.id);
        setIsSidebarOpen(false);
      }
    } catch (error) {
      console.error('Failed to create conversation', error);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setIsSidebarOpen(false);
  };

  const updateConversationTitle = async (conversationId: string, firstMessage: string) => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    if (!conversation || conversation.title !== DEFAULT_CONVERSATION_TITLE) return;

    const cleanedTitle = generateTitleFromMessage(firstMessage);
    setConversations(prev =>
      prev.map(conv => (conv.id === conversationId ? { ...conv, title: cleanedTitle } : conv)),
    );

    try {
      await supabase.from('conversations').update({ title: cleanedTitle }).eq('id', conversationId);
    } catch (error) {
      console.error('Failed to update conversation title', error);
    }
  };

  const displayName = user?.name ?? user?.email ?? null;
  const activeConversation = conversations.find(conv => conv.id === activeConversationId) ?? null;
  const showHistoryPlaceholder = !isConversationsLoading && isAuthenticated && conversations.length === 0;

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans">
      {authMode && (
        <AuthModal mode={authMode} onAuthenticate={handleAuthenticate} onClose={closeAuthModal} />
      )}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-gray-200 bg-white shadow-lg transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="border-b border-gray-100 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">VibeChat</h1>
              <p className="text-sm text-gray-500">AI assistant for students with memory.</p>
            </div>
          </div>
          {!isAuthenticated && (
            <div className="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              Sign up to enable long-term chat memory.
            </div>
          )}
          {isAuthenticated && displayName && (
            <div className="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              Welcome back, {displayName.split(' ')[0]}! Your study memory is active.
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-2 px-6 py-6 text-sm">
          <button className="w-full rounded-lg px-4 py-3 text-left font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
            Summarize History
          </button>
          <button
            onClick={handleTrainModel}
            className="w-full rounded-lg px-4 py-3 text-left font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          >
            Train Model
          </button>
          <p className="mt-6 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
            Without signing up, there&apos;s no memory. Training will just act like it&apos;s learning from this session.
          </p>
        </nav>
        <div className="border-t border-gray-100 px-6 py-5 text-sm">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
            <span>History</span>
            {isAuthenticated && (
              <button
                onClick={handleCreateConversation}
                className="rounded-lg border border-indigo-200 px-2 py-1 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                New
              </button>
            )}
          </div>
          {isConversationsLoading ? (
            <p className="text-xs text-gray-400">Loading conversations…</p>
          ) : showHistoryPlaceholder ? (
            <p className="text-xs text-gray-500">Start a new chat to see it here.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`w-full rounded-lg px-4 py-3 text-left transition-colors ${
                    conversation.id === activeConversationId
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  <p className="truncate text-sm font-medium">
                    {conversation.title || 'Untitled chat'}
                  </p>
                  <p className={`text-xs ${conversation.id === activeConversationId ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {formatTimestamp(conversation.created_at)}
                  </p>
                </button>
              ))}
              {!isAuthenticated && (
                <p className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
                  Sign in to keep a history of your chats.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-3 px-6 pb-6">
          {isAuthenticated && displayName ? (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                <p className="font-semibold text-gray-900">{displayName}</p>
                {user?.email && <p className="text-xs text-gray-500">{user.email}</p>}
              </div>
              <button
                onClick={handleLogout}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  openAuthModal('login');
                  setIsSidebarOpen(false);
                }}
                className="w-full rounded-lg border border-indigo-200 bg-white px-4 py-3 text-sm font-medium text-indigo-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
              >
                Login
              </button>
              <button
                onClick={() => {
                  openAuthModal('signup');
                  setIsSidebarOpen(false);
                }}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </aside>
      <main className="relative flex flex-1 flex-col bg-gray-50">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-indigo-600 transition hover:bg-indigo-50"
          >
            ☰
          </button>
          <span className="text-sm font-semibold text-gray-800">VibeChat</span>
          <div className="h-10 w-10" />
        </header>
        {isTraining && (
          <div className="flex items-center justify-end border-b border-gray-200 bg-white px-4 py-4 md:px-10">
            <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600">
              Training model on your current chats…
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden px-4 pb-8 pt-6 md:px-6">
          <div className="mx-auto h-full w-full max-w-4xl">
            <ChatBot
              hasMemory={isAuthenticated}
              userName={displayName}
              userId={user?.id ?? null}
              conversationId={isAuthenticated ? activeConversationId : null}
              conversationTitle={activeConversation?.title ?? null}
              onFirstUserMessage={content => {
                if (activeConversationId) {
                  updateConversationTitle(activeConversationId, content);
                }
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

const createConversation = async (userId: string, title: string): Promise<Conversation | null> => {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title })
    .select('id, title, created_at')
    .single();

  if (error) {
    console.error('Failed to create conversation', error);
    return null;
  }

  return data;
};

const generateTitleFromMessage = (message: string): string => {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (!cleaned) return DEFAULT_CONVERSATION_TITLE;
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return capitalized + (cleaned.split(' ').length > 6 ? '…' : '');
};

const formatTimestamp = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (error) {
    return '';
  }
};