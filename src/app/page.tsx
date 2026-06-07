import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-stone-50 to-emerald-50 px-6">
      <div className="max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
          From This Island
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
          Supply Chain Intelligence
        </h1>
        <p className="mt-4 text-lg text-stone-600">
          Upload sales and stock data, aggregate SKUs into franchises, track
          growth by channel, and plan replenishment with demand forecasting.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/dashboard">
            <Button size="lg">
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
