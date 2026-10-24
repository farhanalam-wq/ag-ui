import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in — ag-ui",
  description: "Sign in to ag-ui, your Company Intelligence workspace.",
};

/**
 * Auth layout: fixed 50/50 split. Forms live on the left (form-first reading
 * order, keyboard starts in the right place); the crowd image covers the right
 * half at full height and drops out below `lg`, where a single centered
 * column keeps sign-in reachable on phones.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Left: brand + form */}
      <div className="flex flex-col px-6 py-10 sm:px-16 lg:justify-center">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            A
          </span>
          ag-ui
        </Link>
        <div className="mt-10 w-full max-w-sm lg:mt-0">{children}</div>
      </div>

      {/* Right: full-height image */}
      <div className="relative hidden border-l lg:block">
        <Image
          src="/crowd.webp"
          alt="A crowd at a product launch event"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent"
        />
        <p className="absolute bottom-8 left-8 max-w-sm text-sm leading-relaxed text-foreground/90 drop-shadow-sm">
          Company intelligence for the teams behind the product — every answer
          grounded in your own knowledge base.
        </p>
      </div>
    </div>
  );
}
