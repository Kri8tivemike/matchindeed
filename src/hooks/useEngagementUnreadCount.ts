"use client";

import { useCallback, useEffect, useState } from "react";
import { ENGAGEMENT_UNREAD_UPDATED_EVENT } from "@/lib/engagement-notifications";
import {
  isAbortLikeError,
  isTransientRequestError,
  shouldSkipBackgroundRequest,
} from "@/lib/request-errors";
import {
  isRealtimeFailureStatus,
  noteRealtimeFailure,
  noteRealtimeSubscribed,
  removeRealtimeChannelSafely,
  shouldUseRealtime,
} from "@/lib/realtime-fallback";
import { supabase } from "@/lib/supabase";

export function useEngagementUnreadCount(enabled = true) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (shouldSkipBackgroundRequest()) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setCount(0);
        return;
      }

      const response = await fetch(
        "/api/notifications?engagement_summary=true",
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal,
        }
      );
      if (!response.ok) return;

      const data = await response.json().catch(() => null);
      const total = data?.engagement_unread?.total;
      setCount(typeof total === "number" ? total : 0);
    } catch (error) {
      if (isAbortLikeError(error) || isTransientRequestError(error)) return;
      console.error("Error fetching unread engagement count:", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    let controller: AbortController | null = null;

    const refreshCount = () => {
      controller?.abort();
      controller = new AbortController();
      void refresh(controller.signal);
    };

    const setupRealtime = async () => {
      if (!shouldUseRealtime()) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || disposed) return;

      channel = supabase
        .channel(`engagement-unread-${user.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          refreshCount
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            noteRealtimeSubscribed();
            return;
          }

          if (isRealtimeFailureStatus(status) && noteRealtimeFailure(status)) {
            removeRealtimeChannelSafely(supabase, channel);
          }
        });
    };

    refreshCount();
    void setupRealtime();
    window.addEventListener(ENGAGEMENT_UNREAD_UPDATED_EVENT, refreshCount);
    window.addEventListener("focus", refreshCount);
    const interval = window.setInterval(refreshCount, 60000);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener(ENGAGEMENT_UNREAD_UPDATED_EVENT, refreshCount);
      window.removeEventListener("focus", refreshCount);
      removeRealtimeChannelSafely(supabase, channel);
    };
  }, [enabled, refresh]);

  return count;
}
