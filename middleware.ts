import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    await auth.protect();
  }
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === "/__debug") {
    return new Response(
      JSON.stringify(
        {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
          CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
          NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "(not set)",
          NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL || "(not set)",
          NODE_ENV: process.env.NODE_ENV,
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json" } }
    );
  }

  try {
    return await clerk(req, event);
  } catch (e: unknown) {
    const err = e as { message?: string; stack?: string };
    return new Response(
      "MW ERROR: " + (err?.message ?? String(e)) + "\n\n" + (err?.stack ?? ""),
      { status: 500, headers: { "content-type": "text/plain" } }
    );
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
