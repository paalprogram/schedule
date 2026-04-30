"use client";
import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  variant?: "danger" | "default";
  // For irreversible actions: the user must type this exact string before the
  // confirm button enables. Acts as a friction step against accidental clicks.
  requireTypedText?: string;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: async () => false,
});

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);

  const confirm = useCallback(
    (opts: ConfirmOptions | string): Promise<boolean> => {
      const normalized = typeof opts === "string" ? { message: opts } : opts;
      setOptions(normalized);
      setTyped("");
      return new Promise((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [],
  );

  function respond(value: boolean) {
    resolveRef.current?.(value);
    setOptions(null);
    setTyped("");
  }

  const typedOk = !options?.requireTypedText || typed === options.requireTypedText;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {options.title || "Are you sure?"}
            </h3>
            <p className="text-sm text-gray-600 mb-4 whitespace-pre-line">{options.message}</p>
            {options.requireTypedText && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Type <span className="font-mono font-semibold">{options.requireTypedText}</span> to confirm
                </label>
                <input
                  autoFocus
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => respond(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => respond(true)}
                disabled={!typedOk}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                  options.variant === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {options.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
