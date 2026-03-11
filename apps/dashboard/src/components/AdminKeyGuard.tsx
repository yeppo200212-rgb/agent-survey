'use client';
import { useEffect, useState } from 'react';

export default function AdminKeyGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState('');
  const [input, setInput] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('admin_key') || '';
    setKey(stored);
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!key) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-sm">
          <h2 className="text-lg font-semibold mb-4">Admin Key Required</h2>
          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:border-indigo-500"
            placeholder="Enter ADMIN_KEY"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input) {
                localStorage.setItem('admin_key', input);
                setKey(input);
              }
            }}
          />
          <button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
            onClick={() => {
              if (input) {
                localStorage.setItem('admin_key', input);
                setKey(input);
              }
            }}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
