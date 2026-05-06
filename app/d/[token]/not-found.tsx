import Image from "next/image";
import Eyebrow from "@/components/Eyebrow";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-page px-6 text-center font-body">
      <Image
        src="/helios-logo.png"
        alt="Helios Marketing"
        width={100}
        height={32}
        className="mb-10 h-7 w-auto opacity-60"
      />
      <Eyebrow color="orange" className="mb-4">404</Eyebrow>
      <h1 className="font-heading mb-4 text-3xl font-bold tracking-tight text-fg-1">
        Dashboard not found
      </h1>
      <p className="max-w-sm text-body font-light text-fg-2">
        This link may be expired or incorrect. Contact your project lead for the correct URL.
      </p>
    </div>
  );
}
