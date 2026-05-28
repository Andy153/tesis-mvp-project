export const DEMO_CLERK_USER_ID = 'user_3EKOXB9Y8W3DFAyIbTGvOOTAJsu';

export function isDemoUser(userId: string | null | undefined): boolean {
  return userId === DEMO_CLERK_USER_ID;
}
