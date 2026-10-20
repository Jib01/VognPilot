import CameraScanner from '@/components/CameraScanner';

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-zinc-50 text-zinc-900 dark:bg-[#0b0b0e] dark:text-zinc-100 transition-colors">
      <CameraScanner />
    </main>
  );
}
