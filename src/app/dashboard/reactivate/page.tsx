'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ReactivationForm } from '@/components/profile/reactivation-form';

interface ReactivationStatus {
  has_pending_request: boolean;
  status?: string;
  created_at?: string;
  custom_reason?: string;
  reactivation_reason?: string;
}

export default function ReactivatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ReactivationStatus | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const checkReactivationStatus = async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        if (authError || !session) {
          router.push('/login');
          return;
        }

        const response = await fetch('/api/profile/reactivate', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (err) {
        console.error('Failed to fetch reactivation status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkReactivationStatus();
  }, []);

  const handleSubmit = async (reason: string, customReason?: string) => {
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/profile/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          custom_reason: customReason,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit reactivation request');
      }

      setSuccess('Reactivation request submitted successfully! Your partner will be notified.');
      const statusRes = await fetch('/api/profile/reactivate', { method: 'GET' });
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit reactivation request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Reactivation</h1>
          <p className="text-gray-600">Request to reactivate your profile after taking a break from dating.</p>
        </div>

        {status?.has_pending_request && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Pending Request</h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p><strong>Status:</strong> {status.status || 'Pending'}</p>
              <p><strong>Submitted:</strong> {status.created_at ? new Date(status.created_at).toLocaleDateString() : 'Unknown'}</p>
              {status.reactivation_reason && (
                <p><strong>Reason:</strong> {status.reactivation_reason}</p>
              )}
              <p className="mt-4 text-xs">Your partner will have 7 days to respond. After that, your request will be automatically approved.</p>
            </div>
          </div>
        )}

        {!status?.has_pending_request && (
          <ReactivationForm
            onSubmit={handleSubmit}
            isLoading={submitting}
            error={error}
            success={success}
          />
        )}

        {status?.has_pending_request === false && !success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">No pending reactivation requests. Your profile is active or fully reactivated.</p>
          </div>
        )}
      </div>
    </div>
  );
}
