import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <section className="bg-primary/25 flex h-dvh flex-col items-center justify-center">
      <h2 className="text-4xl font-bold">Forbidden</h2>
      <p className="mt-4 mb-2 text-2xl">You are not authorized to access this resource.</p>
      <Button asChild className="cursor-pointer">
        <Link href="/">Return Home</Link>
      </Button>
    </section>
  );
}
