
import React, { useEffect, useMemo, useState } from 'react';
import ChatBot from './components/ChatBot';
import { SparklesIcon } from './components/Icons';
import AuthModal from './components/AuthModal';
import { StoredUser, getCurrentUser, listenToAuthChanges, signIn, signOut, signUp } from './utils/auth';

const App: React.FC = () => {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    setIsSidebarOpen(false);
  };

  const displayName = user?.name ?? user?.email ?? null;

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
            <ChatBot hasMemory={isAuthenticated} userName={displayName} userId={user?.id ?? null} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;