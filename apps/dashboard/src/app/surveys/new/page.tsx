'use client';
import { useState } from 'react';
import { surveys, Question, CreateSurveyInput } from '@/lib/api';
import AdminKeyGuard from '@/components/AdminKeyGuard';

const QUESTION_TYPES = ['multiple_choice', 'likert', 'open'] as const;

function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: Question;
  index: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
}) {
  const addOption = () => onChange({ ...question, options: [...(question.options || []), ''] });
  const updateOption = (i: number, val: string) => {
    const opts = [...(question.options || [])];
    opts[i] = val;
    onChange({ ...question, options: opts });
  };
  const removeOption = (i: number) => {
    const opts = (question.options || []).filter((_, idx) => idx !== i);
    onChange({ ...question, options: opts });
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium">Q{index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-400">Remove</button>
      </div>

      <input
        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-indigo-500"
        placeholder="Question text"
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
      />

      <select
        className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm mb-3 focus:outline-none focus:border-indigo-500"
        value={question.type}
        onChange={(e) => onChange({ ...question, type: e.target.value as Question['type'], options: [] })}
      >
        {QUESTION_TYPES.map((t) => (
          <option key={t} value={t}>{t.replace('_', ' ')}</option>
        ))}
      </select>

      {question.type === 'multiple_choice' && (
        <div className="space-y-2">
          {(question.options || []).map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
              />
              <button onClick={() => removeOption(i)} className="text-gray-500 hover:text-red-400 text-xs px-2">✕</button>
            </div>
          ))}
          <button
            onClick={addOption}
            className="text-xs text-indigo-400 hover:text-indigo-300 mt-1"
          >
            + Add option
          </button>
        </div>
      )}

      {question.type === 'likert' && (
        <p className="text-xs text-gray-500">Scale: 1 (strongly disagree) → 5 (strongly agree)</p>
      )}
    </div>
  );
}

export default function NewSurveyPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [surveyType, setSurveyType] = useState('product_evaluation');
  const [rewardBase, setRewardBase] = useState('5');
  const [clientDeposit, setClientDeposit] = useState('100');
  const [createdBy, setCreatedBy] = useState('');
  const [deadline, setDeadline] = useState('');
  const [questions, setQuestions] = useState<Question[]>([
    { id: crypto.randomUUID(), type: 'likert', text: '', options: [] },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addQuestion = () =>
    setQuestions([...questions, { id: crypto.randomUUID(), type: 'open', text: '', options: [] }]);

  const updateQuestion = (i: number, q: Question) => {
    const updated = [...questions];
    updated[i] = q;
    setQuestions(updated);
  };

  const removeQuestion = (i: number) => setQuestions(questions.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!title || !createdBy || questions.length === 0) {
      setError('Title, created by, and at least one question are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload: CreateSurveyInput = {
        title,
        description,
        surveyType,
        questions,
        rewardBase: parseFloat(rewardBase),
        clientDeposit: parseFloat(clientDeposit),
        createdBy,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      };
      const survey = await surveys.create(payload);
      window.location.href = `/surveys/${survey.id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create survey');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminKeyGuard>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">New Survey</h1>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title *</label>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Uniswap v4 Protocol Evaluation"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Survey purpose and context for agents"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Survey Type</label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={surveyType}
                onChange={(e) => setSurveyType(e.target.value)}
              >
                <option value="market_research">Market Research</option>
                <option value="governance">Governance</option>
                <option value="ux_test">UX Test</option>
                <option value="risk_assessment">Risk Assessment</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Created By *</label>
              <input
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="client@protocol.xyz"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Base Reward (USDC)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={rewardBase}
                onChange={(e) => setRewardBase(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Client Deposit (USDC)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={clientDeposit}
                onChange={(e) => setClientDeposit(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Deadline</label>
              <input
                type="datetime-local"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Questions</h2>
            <button
              onClick={addQuestion}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              + Add Question
            </button>
          </div>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={i}
                onChange={(updated) => updateQuestion(i, updated)}
                onRemove={() => removeQuestion(i)}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Survey'}
          </button>
          <a href="/" className="text-gray-400 hover:text-white px-4 py-2 text-sm">Cancel</a>
        </div>
      </div>
    </AdminKeyGuard>
  );
}
