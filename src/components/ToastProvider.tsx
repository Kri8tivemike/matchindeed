"use client";

/**
 * ToastProvider — Global toast notification system
 *
 * Provides a context-based toast API available anywhere in the component tree.
 *
 * Usage:
 *   import { useToast } from "@/components/ToastProvider";
 *   const { toast } = useToast();
 *   toast.success("Profile saved!");
 *   toast.error("Something went wrong");
 *   toast.info("Check your email");
 *   toast.match("It's a match! You and Sarah both like each other!");
 *   toast.warning("Your session will expire soon");
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  Heart,
  X,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
export type ToastType = "success" | "error" | "info" | "warning" | "match";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    match: (message: string, duration?: number) => void;
    /** Generic — specify type explicitly */
    show: (type: ToastType, message: string, duration?: number) => void;
  };
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ---------------------------------------------------------------
// Context
// ---------------------------------------------------------------
const ToastContext = createContext<ToastContextValue | null>(null);

/** Hook to access toast API. Must be used inside <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------
// Toast styling per type
// ---------------------------------------------------------------
const toastConfig: Record<
  ToastType,
  {
    icon: React.ElementType;
    bg: string;
    border: string;
    text: string;
    iconColor: string;
    progressColor: string;
  }
> = {
  success: {
    icon: CheckCircle,
    bg: "bg-white",
    border: "border-green-200",
    text: "text-gray-800",
    iconColor: "text-green-500",
    progressColor: "bg-green-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-white",
    border: "border-red-200",
    text: "text-gray-800",
    iconColor: "text-red-500",
    progressColor: "bg-red-500",
  },
  info: {
    icon: Info,
    bg: "bg-white",
    border: "border-blue-200",
    text: "text-gray-800",
    iconColor: "text-blue-500",
    progressColor: "bg-blue-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-white",
    border: "border-amber-200",
    text: "text-gray-800",
    iconColor: "text-amber-500",
    progressColor: "bg-amber-500",
  },
  match: {
    icon: Heart,
    bg: "bg-gradient-to-r from-pink-500 to-rose-500",
    border: "border-pink-400",
    text: "text-white",
    iconColor: "text-white",
    progressColor: "bg-white/40",
  },
};

// Default auto-dismiss duration (ms)
const DEFAULT_DURATION = 4000;
const MATCH_DURATION = 5000;

// ---------------------------------------------------------------
// Single toast component
// ---------------------------------------------------------------
function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const config = toastConfig[item.type];
  const Icon = config.icon;
  const duration = item.duration ?? (item.type === "match" ? MATCH_DURATION : DEFAULT_DURATION);

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enter animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (duration <= 0) return;
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border shadow-lg transition-all duration-300 ${
        config.bg
      } ${config.border} ${
        visible && !exiting
          ? "translate-x-0 opacity-100"
          : "translate-x-8 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.iconColor}`} />
        <p className={`flex-1 text-sm leading-snug ${config.text}`}>
          {item.message}
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className={`-mr-1 -mt-0.5 flex-shrink-0 rounded-full p-1 transition-colors ${
            item.type === "match"
              ? "hover:bg-white/20 text-white/80"
              : "hover:bg-gray-100 text-gray-400"
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="h-0.5 w-full overflow-hidden bg-black/5">
          <div
            className={`h-full ${config.progressColor} origin-left`}
            style={{
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------
let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => {
        // Limit to 5 visible toasts — remove oldest if exceeded
        const next = [...prev, { id, type, message, duration }];
        return next.length > 5 ? next.slice(-5) : next;
      });
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = {
    success: (message: string, duration?: number) =>
      addToast("success", message, duration),
    error: (message: string, duration?: number) =>
      addToast("error", message, duration),
    info: (message: string, duration?: number) =>
      addToast("info", message, duration),
    warning: (message: string, duration?: number) =>
      addToast("warning", message, duration),
    match: (message: string, duration?: number) =>
      addToast("match", message, duration),
    show: addToast,
  };

  return (
    <ToastContext.Provider value={{ toast, dismiss, dismissAll }}>
      {children}

      {/* Toast container — fixed top-right */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>

      {/* Keyframe for progress bar animation */}
      <style jsx global>{`
        @keyframes toast-progress {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
