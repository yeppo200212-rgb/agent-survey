'use client';
import { useEffect, useState, use } from 'react';
import { surveys, responses, rewards, Survey, Response, RewardBatchResult } from '@/lib/api';
import AdminKeyGuard from '@/components/AdminKeyGuard';

function QualityBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500 text-xs">—</span>;
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-300">{score.toFixed(0)}</span>
    </div>
  );
}

function ResponseCard({ response, questions }: { response: Response; questions: Survey['questions'] }) {
  const [expanded, setExpanded] = useState(false);
  const qMap = new Map(questions.map((q) => [q.id, q]));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-medium">{response.agent_name}</span>
          <span className="text-xs text-gray-500">{response.processing_ms ? `${(response.processing_ms / 1000).toFixed(1)}s` : '—'}</span>
        </div>
        <div className="flex items-center gap-4">
          <QualityBar score={response.quality_score} />
          {response.reward_amount !== null && (
            <span className="text-xs text-green-400">${Number(response.reward_amount).toFixed(2)}</span>
          )}
          <span className="text-xs text-gray-500">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-4">
          {response.answers.map((a, i) => {
            const q = qMap.get(a.questionId);
            return (
              <div key={i}>
                <p className="text-xs text-gray-400 mb-1">{q?.text || a.questionId}</p>
                <p className="text-sm font-medium text-white">
                  {Array.isArray(a.value) ? a.value.join(', ') : String(a.value)}
                </p>
                {a.reasoning && (
                  <p className="text-xs text-gray-400 mt-1 italic">"{a.reasoning}"</p>
                )}
                <p className="text-xs text-gray-600 mt-0.5">confidence: {(a.confidence * 100).toFixed(0)}%</p>
              </div>
            );
          })}

          {response.quality_breakdown && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Quality Breakdown</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {Object.entries(response.quality_breakdown).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-gray-400">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                    <div className="text-sm font-mono text-indigo-300">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responseList, setResponseList] = useState<Response[]>([]);
  const [rewardSummary, setRewardSummary] = useState<RewardBatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    Promise.all([surveys.get(id), responses.list(id)])
      .then(([s, r]) => {
        setSurvey(s);
        setResponseList(r.responses);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDeliver = async () => {
    setAction('delivering');
    try {
      const res = await surveys.deliver(id);
      alert(`Delivered to ${res.delivered} agents.`);
      setSurvey((s) => s ? { ...s, status: 'active' } : s);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delivery failed');
    } finally {
      setAction('');
    }
  };

  const handleScore = async () => {
    setAction('scoring');
    try {
      const res = await responses.score(id);
      alert(`Scored ${res.scored} responses.`);
      const updated = await responses.list(id);
      setResponseList(updated.responses);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setAction('');
    }
  };

  const handleRewards = async () => {
    setAction('rewarding');
    try {
      const summary = await rewards.batch(id);
      setRewardSummary(summary);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Reward batch failed');
    } finally {
      setAction('');
    }
  };

  if (loading) return <AdminKeyGuard><p className="text-gray-500">Loading...</p></AdminKeyGuard>;
  if (error || !survey) return <AdminKeyGuard><p className="text-red-400">Error: {error || 'Survey not found'}</p></AdminKeyGuard>;

  const pendingCount = responseList.filter((r) => r.status === 'pending').length;
  const scoredCount = responseList.filter((r) => r.status === 'scored').length;

  return (
    <AdminKeyGuard>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <a href="/" className="text-xs text-gray-500 hover:text-gray-300">← Surveys</a>
          <h1 className="text-2xl font-bold mt-1">{survey.title}</h1>
          {survey.description && <p className="text-gray-400 text-sm mt-1">{survey.description}</p>}
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium shrink-0 ${
          survey.status === 'active' ? 'bg-green-900 text-green-300' :
          survey.status === 'closed' ? 'bg-yellow-900 text-yellow-300' :
          'bg-gray-700 text-gray-300'
        }`}>
          {survey.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Base Reward', value: `$${Number(survey.reward_base).toFixed(2)}` },
          { label: 'Deposit', value: `$${Number(survey.client_deposit).toFixed(2)}` },
          { label: 'Responses', value: responseList.length },
          { label: 'Scored', value: scoredCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {survey.status === 'draft' && (
          <button
            onClick={handleDeliver}
            disabled={!!action}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {action === 'delivering' ? 'Delivering...' : 'Deliver to Agents'}
          </button>
        )}
        {pendingCount > 0 && (
          <button
            onClick={handleScore}
            disabled={!!action}
            className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {action === 'scoring' ? 'Scoring...' : `Score ${pendingCount} Responses`}
          </button>
        )}
        {scoredCount > 0 && !rewardSummary && (
          <button
            onClick={handleRewards}
            disabled={!!action}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {action === 'rewarding' ? 'Calculating...' : 'Calculate Rewards'}
          </button>
        )}
      </div>

      {/* Reward Summary */}
      {rewardSummary && (
        <div className="bg-gray-900 border border-green-800 rounded-xl p-5 mb-8">
          <h3 className="font-semibold text-green-300 mb-3">Reward Summary</h3>
          <p className="text-sm text-gray-400 mb-3">
            Total: <span className="text-white font-bold">${Number(rewardSummary.totalAmount).toFixed(2)} USDC</span>
            {' '}across {rewardSummary.rewardCount} responses
          </p>
          <div className="space-y-2">
            {rewardSummary.rewards.map((r) => (
              <div key={r.rewardId} className="flex justify-between text-sm">
                <span className="text-gray-500 font-mono text-xs">{r.agentId.slice(0, 8)}…</span>
                <span className="text-green-400">${Number(r.amountUsdc).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responses */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          Responses <span className="text-gray-500 font-normal text-base">({responseList.length})</span>
        </h2>
        {responseList.length === 0 ? (
          <p className="text-gray-500 text-sm">No responses yet.</p>
        ) : (
          <div className="space-y-2">
            {responseList.map((r) => (
              <ResponseCard key={r.id} response={r} questions={survey.questions} />
            ))}
          </div>
        )}
      </div>
    </AdminKeyGuard>
  );
}
