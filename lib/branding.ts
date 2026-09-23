/**
 * Mule Barber branding and constants.
 * Color palette, typography, messaging.
 */

export const BRANDING = {
  name: 'Mule Barber',
  tagline: 'Queue Management',

  // Color palette
  colors: {
    // Primary: warm amber/gold (barber shop classic)
    primary: '#D97706', // amber-600
    primaryDark: '#B45309', // amber-700
    primaryLight: '#FCD34D', // amber-300

    // Neutral: slate (clean, professional)
    neutral: '#1E293B', // slate-900
    neutralLight: '#F1F5F9', // slate-100

    // Accent: emerald (positive, growth)
    success: '#059669', // emerald-600
    error: '#DC2626', // red-600
    warning: '#D97706', // amber-600
  },

  // Typography
  fonts: {
    heading: 'system-ui, -apple-system, sans-serif',
    body: 'system-ui, -apple-system, sans-serif',
  },

  // Messaging
  messages: {
    // Success states
    completedCustomer: '✓ Customer marked complete',
    skippedCustomer: '⊘ Customer skipped',
    cancelledCustomer: '✗ Customer cancelled',
    requeued: '↻ Customer requeued to the back',
    queueToggled: 'Queue status updated',

    // Loading states
    savingChanges: 'Saving...',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',

    // Errors (human-friendly)
    somethingWrong: 'Something went wrong. Please try again.',
    networkError: 'Network error. Check your connection and try again.',
    authRequired: 'You need to sign in to access this.',
    accessDenied: 'You do not have permission to do this.',
    notFound: 'That entry was not found. It may have been removed.',
    alreadyExists: 'This entry already exists.',
    actionFailed: 'The action could not be completed. Please try again.',

    // Empty states
    queueEmpty: 'Queue is empty',
    noSkipped: 'No skipped customers today',

    // Info messages
    connectionLost: 'Connection lost',
    manualRefresh: 'Manual Refresh',
  },
};

/**
 * Map error codes to human-friendly messages.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address.',
  'auth/user-not-found': 'Email not found. Check your spelling.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many sign-in attempts. Please try again later.',
  'network/timeout': 'Request timed out. Please check your connection.',
  'network/failed': 'Network request failed.',
  'queue/duplicate-entry': 'You are already in the queue.',
  'queue/shop-closed': 'The shop is not accepting new queue entries right now.',
  'queue/entry-not-found': 'That queue entry was not found.',
  'queue/invalid-action': 'That action is not valid.',
  'default': 'Something went wrong. Please try again.',
};

/**
 * Generate a request ID for error logging.
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get human-friendly error message.
 */
export function getErrorMessage(error: unknown, requestId?: string): string {
  let code = 'default';
  let message = BRANDING.messages.somethingWrong;

  if (error instanceof Error) {
    code = error.message;
    if (ERROR_MESSAGES[code]) {
      message = ERROR_MESSAGES[code];
    }
  } else if (typeof error === 'string') {
    code = error;
    if (ERROR_MESSAGES[code]) {
      message = ERROR_MESSAGES[code];
    }
  }

  if (requestId) {
    message += ` (${requestId})`;
  }

  return message;
}
