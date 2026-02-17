"use client";

/**
 * MeetingReportForm — Host Reports Component
 * 
 * Allows hosts to report issues with meetings, guests, or platform problems.
 * Includes form validation, error handling, and success notifications.
 */

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Send } from "lucide-react";

interface MeetingReportFormProps {
  meetingId?: string;
  guestId?: string;
  onSuccess?: () => void;
}

const REPORT_TYPES = [
  { value: "guest_behavior", label: "Guest Behavior Issue" },
  { value: "meeting_issue", label: "Meeting Technical Issue" },
  { value: "payment_problem", label: "Payment Problem" },
  { value: "technical_issue", label: "Platform Technical Issue" },
  { value: "safety_concern", label: "Safety Concern" },
  { value: "other", label: "Other" },
];

const SEVERITY_LEVELS = [
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-800" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
];

export function MeetingReportForm({
  meetingId,
  guestId,
  onSuccess,
}: MeetingReportFormProps) {
  const [formData, setFormData] = useState({
    report_type: "guest_behavior",
    title: "",
    description: "",
    severity: "medium",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
      setError(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/host/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            meeting_id: meetingId,
            guest_id: guestId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Failed to submit report");
          return;
        }

        setSuccess(true);
        setFormData({
          report_type: "guest_behavior",
          title: "",
          description: "",
          severity: "medium",
        });

        setTimeout(() => {
          setSuccess(false);
          onSuccess?.();
        }, 2000);
      } catch (err) {
        setError("An error occurred while submitting the report");
        console.error("[MeetingReportForm]", err);
      } finally {
        setLoading(false);
      }
    },
    [formData, meetingId, guestId, onSuccess]
  );

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Report an Issue</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-800 text-sm">Report submitted successfully. Thank you for your feedback.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Report Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Report Type *
          </label>
          <select
            name="report_type"
            value={formData.report_type}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {REPORT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Brief summary of the issue"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            minLength={5}
            maxLength={100}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{formData.title.length}/100</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Provide detailed information about the issue"
            rows={5}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            minLength={10}
            maxLength={2000}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{formData.description.length}/2000</p>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Severity Level
          </label>
          <div className="flex gap-2">
            {SEVERITY_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, severity: level.value }))
                }
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  formData.severity === level.value
                    ? `${level.color} ring-2 ring-offset-2`
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || success}
          className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Submit Report
            </>
          )}
        </button>
      </form>
    </div>
  );
}
