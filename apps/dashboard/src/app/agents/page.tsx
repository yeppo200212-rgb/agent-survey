'use client';
import { useEffect, useState } from 'react';
import { agents, Agent } from '@/lib/api';
import AdminKeyGuard from '@/components/AdminKeyGuard';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  quarantine: 'bg-yellow-900 text-yellow-300',
  suspended: 'bg-red-900 text-red-300',
};

export default function AgentsPage() {
  const [list, setList] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [activating, setActivating] = useState<string | null>(null);

  const load = (status = filter) => {
    setLoading(true);
    agents.list(status || undefined)
      .then((res) => setList(res.agents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActivate = async (agent: Agent, newStatus: string) => {
    setActivating(agent.id);
    try {
      await agents.activate(agent.id, newStatus);
      setList((prev) => prev.map((a) => a.id === agent.id ? { ...a, status: newStatus } : a));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActivating(null);
    }
  };

  return (
    <AdminKeyGuard>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <select
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); load(e.target.value); }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="quarantine">Quarantine</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && list.length === 0 && (
        <p className="text-gray-500 text-sm">No agents found.</p>
      )}

      <div className="space-y-3">
        {list.map((agent) => (
          <div key={agent.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{agent.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[agent.status] || 'bg-gray-700 text-gray-300'}`}>
                  {agent.status}
                </span>
                {agent.is_ai_panel && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">AI Panel</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {agent.operator_wallet}
                {agent.model_family && ` · ${agent.model_family}`}
                {agent.category && ` · ${agent.category}`}
              </p>
            </div>

            <div className="text-center shrink-0">
              <p className="text-xs text-gray-500">Quality</p>
              <p className="text-lg font-bold text-indigo-400">{Number(agent.quality_score).toFixed(0)}</p>
            </div>

            <div className="flex gap-2 shrink-0">
              {agent.status !== 'active' && (
                <button
                  onClick={() => handleActivate(agent, 'active')}
                  disabled={activating === agent.id}
                  className="text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Activate
                </button>
              )}
              {agent.status === 'active' && (
                <button
                  onClick={() => handleActivate(agent, 'suspended')}
                  disabled={activating === agent.id}
                  className="text-xs bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Suspend
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AdminKeyGuard>
  );
}
