import React, { useState } from 'react';

interface AuthModalProps {
  mode: 'login' | 'signup';
  onAuthenticate: (payload: { name?: string; email: string; password: string }) => Promise<void>;
  onClose: () => void;
}

const inputClassName =
  'w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

const AuthModal: React.FC<AuthModalProps> = ({ mode, onAuthenticate, onClose }) => {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: 'name' | 'email' | 'password', value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formState.email || !formState.password || (mode === 'signup' && !formState.name)) {
      setError('Please complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAuthenticate({
        name: formState.name.trim(),
        email: formState.email.toLowerCase().trim(),
        password: formState.password,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unable to authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'login' ? 'Welcome back' : 'Create your study space'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {mode === 'login'
              ? 'Log in to unlock persistent study memory across sessions.'
              : 'Sign up to keep your study chats, notes, and plans in one place.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={formState.name}
                onChange={event => handleChange('name', event.target.value)}
                placeholder="Your full name"
                className={inputClassName}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={formState.email}
              onChange={event => handleChange('email', event.target.value)}
              placeholder="you@example.edu"
              className={inputClassName}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={formState.password}
              onChange={event => handleChange('password', event.target.value)}
              placeholder="Enter a secure password"
              className={inputClassName}
            />
            <p className="mt-1 text-xs text-gray-400">Use at least 6 characters.</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;

