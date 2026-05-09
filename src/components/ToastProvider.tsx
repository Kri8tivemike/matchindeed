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

import Link from "next/link";
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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

type ToastPlacement = "top-right" | "center";

type ToastAction = {
  label: string;
  href: string;
};

export interface ToastItem {
  id: string;
  title?: string;
  type: ToastType;
  message: string;
  placement?: ToastPlacement;
  actions?: ToastAction[];
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    errorAction: (
      message: string,
      actionLabel: string,
      actionHref: string,
      duration?: number
    ) => void;
    errorActions: (
      message: string,
      actions: ToastAction[],
      duration?: number
    ) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    warningAction: (
      message: string,
      actionLabel: string,
      actionHref: string,
      duration?: number
    ) => void;
    warningActions: (
      message: string,
      actions: ToastAction[],
      duration?: number
    ) => void;
    centerError: (message: string, duration?: number, title?: string) => void;
    centerWarning: (message: string, duration?: number) => void;
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
  }
> = {
  success: {
    icon: CheckCircle,
    bg: "bg-white",
    border: "border-green-200",
    text: "text-gray-800",
    iconColor: "text-green-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-white",
    border: "border-red-200",
    text: "text-gray-800",
    iconColor: "text-red-500",
  },
  info: {
    icon: Info,
    bg: "bg-white",
    border: "border-blue-200",
    text: "text-gray-800",
    iconColor: "text-blue-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-white",
    border: "border-amber-200",
    text: "text-gray-800",
    iconColor: "text-amber-500",
  },
  match: {
    icon: Heart,
    bg: "bg-gradient-to-r from-pink-500 to-rose-500",
    border: "border-pink-400",
    text: "text-white",
    iconColor: "text-white",
  },
};

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
  const isCentered = item.placement === "center";
  const actions = item.actions || [];

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  // Enter animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss after duration (default 5 s for regular, 6.5 s for centered)
  useEffect(() => {
    const ms = item.duration ?? (isCentered ? 6500 : 5000);
    const timer = setTimeout(handleDismiss, ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`pointer-events-auto relative w-full overflow-hidden border transition-all duration-300 ${
        config.bg
      } ${config.border} ${
        isCentered
          ? "max-w-md rounded-[28px] shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
          : "max-w-sm rounded-2xl shadow-xl"
      } ${
        visible && !exiting
          ? isCentered
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-x-0 opacity-100"
          : isCentered
            ? "translate-y-2 scale-[0.98] opacity-0"
            : "translate-x-8 opacity-0"
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`flex items-start ${
          isCentered ? "gap-4 px-5 py-5 sm:px-6 sm:py-5" : "gap-3 px-4 py-3"
        }`}
      >
        <div
          className={`flex flex-shrink-0 items-center justify-center rounded-full ${
            isCentered ? "mt-0.5 h-10 w-10 bg-red-50" : ""
          }`}
        >
          <Icon
            className={`flex-shrink-0 ${
              isCentered ? "h-5.5 w-5.5" : "mt-0.5 h-5 w-5"
            } ${config.iconColor}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`${
              isCentered
                ? "pr-1 text-[15px] font-medium leading-6 sm:text-base sm:leading-7"
                : "text-sm leading-snug"
            } ${config.text}`}
          >
            {isCentered && item.title ? (
              <span className="flex flex-col gap-1">
                <span className="text-[0.95rem] font-semibold tracking-[-0.01em] text-slate-900 sm:text-base">
                  {item.title}
                </span>
                <span className="text-[0.95rem] font-medium leading-6 text-slate-600 sm:text-[15px] sm:leading-6">
                  {item.message}
                </span>
              </span>
            ) : (
              item.message
            )}
          </p>
          {actions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((action) => (
                <Link
                  key={`${item.id}-${action.href}-${action.label}`}
                  href={action.href}
                  onClick={handleDismiss}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    item.type === "match"
                      ? "bg-white/20 text-white hover:bg-white/30"
                      : "bg-[#eef2ff] text-[#1f419a] hover:bg-[#dfe7ff]"
                  }`}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className={`flex-shrink-0 rounded-full transition-colors ${
            isCentered ? "h-9 w-9 p-2" : "-mr-1 -mt-0.5 p-1"
          } ${
            item.type === "match"
              ? "hover:bg-white/20 text-white/80"
              : "text-gray-400 hover:bg-gray-100"
          }`}
        >
          <X className={isCentered ? "h-5 w-5" : "h-3.5 w-3.5"} />
        </button>
      </div>

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
    (
      type: ToastType,
      message: string,
      duration?: number,
      placement: ToastPlacement = "top-right",
      title?: string,
      actions?: ToastAction[]
    ) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => {
        // Deduplicate: skip if an identical type+message is already visible
        if (prev.some((t) => t.type === type && t.message === message)) {
          return prev;
        }
        const next = [
          ...prev,
          { id, type, message, placement, title, actions, duration },
        ];
        const regular = next.filter((item) => item.placement !== "center").slice(-5);
        const centered = next.filter((item) => item.placement === "center").slice(-1);
        return [...regular, ...centered];
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
    errorAction: (
      message: string,
      actionLabel: string,
      actionHref: string,
      duration?: number
    ) =>
      addToast("error", message, duration, "top-right", undefined, [
        { label: actionLabel, href: actionHref },
      ]),
    errorActions: (
      message: string,
      actions: ToastAction[],
      duration?: number
    ) => addToast("error", message, duration, "top-right", undefined, actions),
    info: (message: string, duration?: number) =>
      addToast("info", message, duration),
    warning: (message: string, duration?: number) =>
      addToast("warning", message, duration),
    warningAction: (
      message: string,
      actionLabel: string,
      actionHref: string,
      duration?: number
    ) =>
      addToast("warning", message, duration, "top-right", undefined, [
        { label: actionLabel, href: actionHref },
      ]),
    warningActions: (
      message: string,
      actions: ToastAction[],
      duration?: number
    ) => addToast("warning", message, duration, "top-right", undefined, actions),
    centerError: (message: string, duration?: number, title?: string) =>
      addToast("error", message, duration ?? 6500, "center", title),
    centerWarning: (message: string, duration?: number) =>
      addToast("warning", message, duration ?? 6500, "center"),
    match: (message: string, duration?: number) =>
      addToast("match", message, duration),
    show: addToast,
  };

  const regularToasts = toasts.filter((item) => item.placement !== "center");
  const centeredToasts = toasts.filter((item) => item.placement === "center");

  return (
    <ToastContext.Provider value={{ toast, dismiss, dismissAll }}>
      {children}

      {/* Toast container — fixed top-right */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {regularToasts.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>

      {centeredToasts.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[6px]" />
          <div className="pointer-events-none relative z-10 flex w-full max-w-md flex-col gap-3">
            {centeredToasts.map((item) => (
              <ToastCard
                key={item.id}
                item={item}
                onDismiss={() => dismiss(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
