import Image from "next/image";
import { SignOutButton } from "@clerk/nextjs";
import Eyebrow from "@/components/Eyebrow";

export default function NotAuthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-page px-6 text-center font-body">
      <Image
        src="/helios-logo.png"
        alt="Helios Marketing"
        width={100}
        height={32}
        className="mb-10 h-7 w-auto opacity-60"
      />
      <Eyebrow color="orange" className="mb-4">Access Denied</Eyebrow>
      <h1 className="font-heading mb-4 text-3xl font-bold tracking-tight text-fg-1">
        Not authorized
      </h1>
      <p className="mb-8 max-w-sm text-body font-light text-fg-2">
        Admin access requires a <strong>@heliosmarketing.org</strong> account.
        Sign in with a different account or contact Lucas.
      </p>
      <SignOutButton redirectUrl="/sign-in">
        <button className="rounded-pill bg-[#FF5E1A] px-5 py-2.5 text-sm font-semibold text-white shadow-cta-glow hover:bg-[#E54E0F] transition-colors">
          Sign out and try again
        </button>
      </SignOutButton>
    </div>
  );
}
