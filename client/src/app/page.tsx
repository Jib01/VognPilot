import CameraScanner from '@/components/CameraScanner';

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-zinc-100 dark:bg-[#050507] sm:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] sm:from-emerald-100/70 sm:via-zinc-100 sm:to-zinc-100 dark:sm:from-emerald-950/35 dark:sm:via-[#060609] dark:sm:to-[#050507] text-zinc-900 dark:text-zinc-100 transition-colors flex items-center justify-center">
      <CameraScanner />
    </main>
  );
}
