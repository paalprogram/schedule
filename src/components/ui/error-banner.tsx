"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-800">
            {message || "Something went wrong loading this data."}
          </p>
          <p className="text-xs text-red-600 mt-0.5">Check your connection and try again.</p>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 shrink-0"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
