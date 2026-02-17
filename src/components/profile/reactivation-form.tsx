'use client';

import { useState } from 'react';
import { REACTIVATION_REASONS, getWordCount, validateCustomReason } from '@/lib/reactivation-reasons';

interface ReactivationFormProps {
  onSubmit: (reason: string, customReason?: string) => Promise<void>;
  isLoading?: boolean;
  error?: string;
  success?: string;
}

export function ReactivationForm({ onSubmit, isLoading = false, error, success }: ReactivationFormProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [localError, setLocalError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const minWords = 200;
  const wordCount = getWordCount(customReason);
  const isCustomReasonSelected = selectedReason === '26' || selectedReason === 'other';
  const isCustomReasonValid = !isCustomReasonSelected || validateCustomReason(customReason, minWords);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    // Validate
    if (!selectedReason) {
      setLocalError('Please select a reason for reactivation');
      return;
    }

    if (isCustomReasonSelected && !isCustomReasonValid) {
      setLocalError(`Custom reason must be at least ${minWords} words (currently ${wordCount} words)`);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(selectedReason, isCustomReasonSelected ? customReason : undefined);
      setSelectedReason('');
      setCustomReason('');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to submit reactivation request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white rounded-lg shadow">
      <div>
        <h2 className="text-2xl font-bold mb-4">Request Profile Reactivation</h2>
        <p className="text-gray-600 mb-6">Tell us why you'd like to reactivate your profile. Your partner will be notified, and if they don't respond, your request will be auto-approved after 7 days.</p>
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
          Reactivation Reason <span className="text-red-500">*</span>
        </label>
        <select
          id="reason"
          value={selectedReason}
          onChange={(e) => setSelectedReason(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select a reason --</option>
          {REACTIVATION_REASONS.map((reason) => (
            <option key={reason.id} value={reason.id.toString()}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      {selectedReason && selectedReason !== '26' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            {REACTIVATION_REASONS.find(r => r.id.toString() === selectedReason)?.description}
          </p>
        </div>
      )}

      {isCustomReasonSelected && (
        <div>
          <label htmlFor="customReason" className="block text-sm font-medium text-gray-700 mb-2">
            Please explain your reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="customReason"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Please provide detailed information..."
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className={`mt-2 text-sm ${isCustomReasonValid ? 'text-gray-600' : 'text-red-500'}`}>
            Word count: {wordCount} / {minWords}
          </div>
        </div>
      )}

      {(error || localError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error || localError}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || isSubmitting || !selectedReason || !isCustomReasonValid}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg"
      >
        {isLoading || isSubmitting ? 'Submitting...' : 'Submit Request'}
      </button>
    </form>
  );
}
