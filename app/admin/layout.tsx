import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

export const metadata = {
  title: "Admin — Helios Dashboards",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";

  if (!email.endsWith("@heliosmarketing.org")) {
    redirect("/admin/not-authorized");
  }

  return (
    <div className="min-h-screen bg-bg-alt font-body">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin">
              <Image
                src="/helios-logo.png"
                alt="Helios Marketing"
                width={80}
                height={26}
                className="h-6 w-auto"
              />
            </Link>
            <span className="hidden text-xs font-semibold uppercase tracking-widest text-fg-muted sm:block">
              Admin
            </span>
            <nav className="flex items-center gap-1">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-bg-alt hover:text-fg-1 transition-colors"
              >
                Projects
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-fg-3 sm:block">{email}</span>
            <SignOutButton redirectUrl="/sign-in">
              <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-2 hover:border-border hover:bg-bg-alt transition-colors">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
