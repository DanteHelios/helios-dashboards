import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
// Client-facing token routes: viewed with no login by anyone holding the URL.
// `/d/(.*)` is the dashboard page; `/api/deck/(.*)` is the deck PDF its iframe loads.
const isPublicRoute = createRouteMatcher(["/d(.*)", "/api/deck(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Never run auth.protect() for public token routes, regardless of any other rule.
  if (isPublicRoute(req)) return;
  if (isAdminRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
