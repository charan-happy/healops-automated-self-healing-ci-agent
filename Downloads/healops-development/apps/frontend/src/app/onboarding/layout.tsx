export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background bg-grid-pattern bg-ambient-glow p-4">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
