import Link from "next/link";
import Image from "next/image";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      {/* Minimal header */}
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3.5">
          <Link href="/" aria-label="Book My Tech — home" className="flex items-center">
            <Image src="/logo-cropped.png" alt="Book My Tech" width={1463} height={368} priority className="h-9 w-auto sm:h-10" />
          </Link>
          <a
            href="tel:+441234567890"
            className="text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Need help? Call us
          </a>
        </div>
      </header>

      {/* Step content */}
      <main className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
