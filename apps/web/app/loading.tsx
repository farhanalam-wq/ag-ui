import { Skeleton } from "@/components/ui/skeleton";

// Phase F: instant skeleton shell for route transitions. Never blank.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-[280px] lg:col-span-2" />
        <Skeleton className="h-[280px]" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
