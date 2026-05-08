"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import {
  Image as ImageIcon,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Eye,
  RefreshCw,
} from "lucide-react";

/**
 * Photo moderation item type
 */
type PhotoModerationItem = {
  id: string;
  user_id: string;
  photo_url: string;
  status: "pending" | "approved" | "rejected";
  review_reason: string | null;
  created_at: string;
  user: {
    email: string;
    display_name: string | null;
  } | null;
};

type PhotoModerationQueryRow = {
  id: string;
  user_id: string;
  photo_url: string;
  status: "pending" | "approved" | "rejected";
  review_reason: string | null;
  created_at: string;
  accounts:
    | {
        email: string;
        display_name: string | null;
      }
    | {
        email: string;
        display_name: string | null;
      }[]
    | null;
};

/**
 * AdminModerationPage - Photo moderation queue
 * 
 * Features:
 * - View pending profile photos
 * - Approve or reject with reason
 * - Filter by status
 */
export default function AdminModerationPage() {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<PhotoModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"approved" | "rejected" | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoModerationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<string[]>([]);

  const pageSize = 12;
  const totalPages = Math.ceil(totalItems / pageSize);
  const queueDescriptions: Record<
    "approved" | "rejected" | "all",
    string
  > = {
    approved: "Approved photos stay here as moderation history.",
    rejected:
      "Rejected photos stay here as moderation history and are not visible on user profiles.",
    all: "This view combines pending, approved, and rejected moderation history.",
  };

  const applyModerationResult = useCallback(
    (
      photoId: string,
      nextStatus: "approved" | "rejected",
      nextReason?: string | null
    ) => {
      setPhotos((prev) => {
        const nextItems = prev
          .map((item) =>
            item.id === photoId
              ? {
                  ...item,
                  status: nextStatus,
                  review_reason:
                    nextStatus === "rejected"
                      ? nextReason || item.review_reason
                      : item.review_reason,
                }
              : item
          )
          .filter((item) => statusFilter === "all" || item.status === statusFilter);

        return nextItems;
      });

      if (statusFilter !== "all" && statusFilter !== nextStatus) {
        setTotalItems((prev) => Math.max(0, prev - 1));
      }

      setSelectedPhoto((prev) =>
        prev?.id === photoId
          ? {
              ...prev,
              status: nextStatus,
              review_reason:
                nextStatus === "rejected"
                  ? nextReason || prev.review_reason
                  : prev.review_reason,
            }
          : prev
      );
    },
    [statusFilter]
  );

  /**
   * Fetch photos from moderation queue
   */
  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("photo_moderation")
        .select(`
          id,
          user_id,
          photo_url,
          status,
          review_reason,
          created_at,
          accounts!user_id (
            email,
            display_name
          )
        `, { count: "exact" });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching photos:", error);
        return;
      }

      const transformedData: PhotoModerationItem[] = ((data as PhotoModerationQueryRow[] | null) || []).map((item) => ({
        id: item.id,
        user_id: item.user_id,
        photo_url: item.photo_url,
        status: item.status,
        review_reason: item.review_reason,
        created_at: item.created_at,
        user: Array.isArray(item.accounts) ? item.accounts[0] || null : item.accounts,
      }));

      setPhotos(transformedData);
      setTotalItems(count || 0);
      setBrokenPhotoIds([]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage]);

  const markPhotoBroken = useCallback((photoId: string) => {
    setBrokenPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  /**
   * Handle photo approval
   */
  const handleApprove = async (photoId: string) => {
    setActionLoading(photoId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Your admin session expired. Please log in again.");
      }

      const { error } = await supabase
        .from("photo_moderation")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", photoId);

      if (error) throw error;

      // Log admin action
      await supabase.from("admin_logs").insert({
        admin_id: user.id,
        action: "photo_approved",
        meta: { photo_id: photoId },
      });

      applyModerationResult(photoId, "approved");
      toast.success("Photo approved successfully.");
      setSelectedPhoto(null);
    } catch (error) {
      console.error("Error approving photo:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to approve photo."
      );
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handle photo rejection
   */
  const handleReject = async (photoId: string) => {
    if (!rejectReason.trim()) {
      toast.warning("Please provide a reason for rejection");
      return;
    }

    setActionLoading(photoId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Your admin session expired. Please log in again.");
      }

      const { error } = await supabase
        .from("photo_moderation")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          review_reason: rejectReason,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", photoId);

      if (error) throw error;

      // Log admin action
      await supabase.from("admin_logs").insert({
        admin_id: user.id,
        action: "photo_rejected",
        meta: { photo_id: photoId, reason: rejectReason },
      });

      applyModerationResult(photoId, "rejected", rejectReason);
      toast.success("Photo rejected successfully.");
      setSelectedPhoto(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting photo:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reject photo."
      );
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Get status badge styling
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-amber-100 text-amber-700";
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photo Moderation</h1>
          <p className="text-gray-500">{totalItems} photos {statusFilter !== "all" ? statusFilter : "total"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchPhotos()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-wrap gap-2">
          {(["approved", "rejected", "all"] as const).map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? "bg-[#1f419a] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {queueDescriptions[statusFilter]}
        </p>
      </div>

      {/* Photo Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        </div>
      ) : photos.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <ImageIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No photos in the {statusFilter} queue</p>
        </div>
      ) : (
        <>
          <div className="max-h-[68vh] overflow-auto pr-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 md:gap-5">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm group"
              >
                {/* Photo */}
                <div className="relative h-56 bg-gray-100 sm:h-64 lg:h-72">
                  {brokenPhotoIds.includes(photo.id) ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 p-4 text-center">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Image unavailable</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          This older moderation record no longer has a retrievable image file.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Image
                      src={photo.photo_url}
                      alt="User photo"
                      fill
                      className="w-full h-full object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 280px"
                      unoptimized
                      onError={() => markPhotoBroken(photo.id)}
                    />
                  )}
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      onClick={() => setSelectedPhoto(photo)}
                      className="rounded-full bg-white/90 p-2 text-gray-700 hover:bg-white"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {photo.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(photo.id)}
                          disabled={actionLoading === photo.id}
                          className="rounded-full bg-green-500 p-2 text-white hover:bg-green-600 disabled:opacity-50"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setSelectedPhoto(photo)}
                          disabled={actionLoading === photo.id}
                          className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className={`absolute right-2 top-2 rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(photo.status)}`}>
                    {photo.status}
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 sm:p-4">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {photo.user?.display_name || photo.user?.email || "Unknown user"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    {new Date(photo.created_at).toLocaleDateString()}
                  </p>
                  {photo.review_reason ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {photo.review_reason}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, totalItems)} of {totalItems}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <label className="sr-only" htmlFor="moderation-page-select">
                  Select moderation page
                </label>
                <select
                  id="moderation-page-select"
                  value={currentPage}
                  onChange={(event) => setCurrentPage(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  {Array.from({ length: totalPages }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <option key={pageNumber} value={pageNumber}>
                        Page {pageNumber} of {totalPages}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden">
            {/* Photo */}
            <div className="relative aspect-square bg-gray-100">
              {brokenPhotoIds.includes(selectedPhoto.id) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 p-6 text-center">
                  <ImageIcon className="h-10 w-10 text-gray-400" />
                  <div>
                    <p className="text-base font-medium text-gray-700">Image unavailable</p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      This moderation record exists, but the stored image file is no longer available to preview.
                    </p>
                  </div>
                </div>
              ) : (
                <Image
                  src={selectedPhoto.photo_url}
                  alt="User photo"
                  fill
                  className="w-full h-full object-cover"
                  sizes="(max-width: 1024px) 90vw, 600px"
                  unoptimized
                  onError={() => markPhotoBroken(selectedPhoto.id)}
                />
              )}
            </div>

            {/* Info */}
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedPhoto.user?.display_name || "Unknown"}
                  </p>
                  <p className="text-sm text-gray-500">{selectedPhoto.user?.email}</p>
                </div>
                <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedPhoto.status)}`}>
                  {selectedPhoto.status}
                </span>
              </div>

              {selectedPhoto.status === "pending" && (
                <>
                  {/* Reject Reason */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rejection Reason (required to reject)
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g., Photo contains inappropriate content..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none resize-none h-20"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSelectedPhoto(null);
                        setRejectReason("");
                      }}
                      className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReject(selectedPhoto.id)}
                      disabled={actionLoading === selectedPhoto.id || !rejectReason.trim()}
                      className="flex-1 py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === selectedPhoto.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(selectedPhoto.id)}
                      disabled={actionLoading === selectedPhoto.id}
                      className="flex-1 py-2.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === selectedPhoto.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                  </div>
                </>
              )}

              {selectedPhoto.status !== "pending" && (
                <>
                  {selectedPhoto.review_reason && (
                    <div className="p-3 rounded-lg bg-gray-50 mb-4">
                      <p className="text-sm text-gray-600">
                        <strong>Reason:</strong> {selectedPhoto.review_reason}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
