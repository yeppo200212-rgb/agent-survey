import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentMind Dashboard',
  description: 'AI Agent Survey Marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-lg font-bold text-indigo-400 tracking-tight">
            AgentMind
          </a>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/" className="hover:text-white transition-colors">Surveys</a>
            <a href="/surveys/new" className="hover:text-white transition-colors">+ New Survey</a>
            <a href="/agents" className="hover:text-white transition-colors">Agents</a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
