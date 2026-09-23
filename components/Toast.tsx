/**
 * Toast notification component.
 * Shows success/error/info messages to the user.
 */
'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 4000
}

// Global toast store (simple context alternative)
let toasts: Toast[] = [];
let listeners: ((toasts: Toast[]) => void)[] = [];

function notifyListeners() {
  listeners.forEach((listener) => listener([...toasts]));
}

export function addToast(type: ToastType, message: string, duration = 4000) {
  const id = `toast_${Date.now()}_${Math.random()}`;
  const toast: Toast = { id, type, message, duration };

  toasts.push(toast);
  notifyListeners();

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }

  return id;
}

export function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
}

export function useToasts() {
  const [displayToasts, setDisplayToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setDisplayToasts);
    setDisplayToasts([...toasts]);

    return () => {
      listeners = listeners.filter((l) => l !== setDisplayToasts);
    };
  }, []);

  return displayToasts;
}

/**
 * Toast container component.
 * Render this once in your layout.
 */
export function ToastContainer() {
  const toasts = useToasts();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm animate-in slide-in-from-right ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-blue-600 text-white'
          }`}
        >
          <span>
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'info' && 'ℹ'}
          </span>
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-auto text-sm opacity-80 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
