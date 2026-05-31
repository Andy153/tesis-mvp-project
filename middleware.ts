import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-up/secretaria(.*)',
  // PWA estáticos (el matcher de abajo no excluye .json ni /sw.js de forma fiable)
  '/manifest.json',
  '/sw.js',
  // Cron endpoints must bypass Clerk auth (they use Authorization: Bearer <CRON_SECRET>)
  '/api/cron(.*)',
  // Supabase Database Webhook (x-webhook-secret: SUPABASE_WEBHOOK_SECRET)
  '/api/webhooks/subscription-activated',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
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

