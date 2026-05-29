const NOTIFICATION_VIEWS = new Set([
  'documents',
  'alerts',
  'errors',
  'dashboard',
  'upload',
  'cobros',
  'settings',
]);

/** Resuelve metadata.navigate_to al id de vista de TrazaApp. */
export function resolveNotificationView(nav: unknown, fallback = 'documents'): string {
  if (nav === 'profile') return 'settings';
  if (typeof nav === 'string' && NOTIFICATION_VIEWS.has(nav)) return nav;
  return fallback;
}
