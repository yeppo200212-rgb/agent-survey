'use client';
import { useEffect, useState } from 'react';
import { surveys, Survey } from '@/lib/api';
import AdminKeyGuard from '@/components/AdminKeyGuard';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  active: 'bg-green-900 text-green-300',
  closed: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-blue-900 text-blue-300',
};

function SurveyCard({ survey }: { survey: Survey }) {
  return (
    <a
      href={`/surveys/${survey.id}`}
      className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{survey.title}</h3>
          <p className="text-sm text-gray-400 mt-1 line-clamp-2">{survey.description}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[survey.status] || STATUS_COLORS.draft}`}>
          {survey.status}
        </span>
      </div>
      <div className="mt-4 flex gap-6 text-xs text-gray-500">
        <span>Reward: <span className="text-gray-300">${Number(survey.reward_base).toFixed(2)}</span></span>
        <span>Deposit: <span className="text-gray-300">${Number(survey.client_deposit).toFixed(2)}</span></span>
        <span>Questions: <span className="text-gray-300">{survey.questions?.length || 0}</span></span>
        {survey.deadline && (
          <span>Deadline: <span className="text-gray-300">{new Date(survey.deadline).toLocaleDateString()}</span></span>
        )}
      </div>
    </a>
  );
}

function SurveyList() {
  const [list, setList] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    surveys.list()
      .then((res) => setList(res.surveys))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (list.length === 0) return (
    <div className="text-center py-20 text-gray-500">
      <p className="text-lg">No surveys yet.</p>
      <a href="/surveys/new" className="mt-3 inline-block text-indigo-400 hover:underline">Create your first survey →</a>
    </div>
  );

  return (
    <div className="grid gap-4">
      {list.map((s) => <SurveyCard key={s.id} survey={s} />)}
    </div>
  );
}

export default function HomePage() {
  return (
    <AdminKeyGuard>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Surveys</h1>
        <a
          href="/surveys/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Survey
        </a>
      </div>
      <SurveyList />
    </AdminKeyGuard>
  );
}
