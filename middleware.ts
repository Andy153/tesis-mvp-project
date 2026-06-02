import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { checkSubscriptionStatus } from '@/lib/subscription';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-up/secretaria(.*)',
  '/activacion-pendiente',
  // PWA estáticos (el matcher de abajo no excluye .json ni /sw.js de forma fiable)
  '/manifest.json',
  '/sw.js',
  // Cron endpoints must bypass Clerk auth (they use Authorization: Bearer <CRON_SECRET>)
  '/api/cron(.*)',
  // Supabase Database Webhooks (x-webhook-secret: SUPABASE_WEBHOOK_SECRET)
  '/api/webhooks(.*)',
  // Push API: auth en cada route handler (401 JSON). Sin esto, auth.protect() puede
  // redirigir POST a sign-in → el cliente sigue con GET → 405 Method Not Allowed.
  '/api/push(.*)',
]);

const skipSubscriptionCheck = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/activacion-pendiente',
  '/api/webhooks(.*)',
  '/api/cron(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  if (!isPublicRoute(request) && !skipSubscriptionCheck(request)) {
    const { userId } = await auth();
    if (userId) {
      try {
        const { allowed } = await checkSubscriptionStatus(userId);
        if (!allowed) {
          return NextResponse.redirect(new URL('/activacion-pendiente', request.url));
        }
      } catch (err) {
        console.warn(
          '[TRAZA] middleware:subscription_check_failed',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
