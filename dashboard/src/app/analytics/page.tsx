import StatsCharts from "@/components/StatsCharts";

export default function AnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Analytics Overview
        </h1>
        <p className="text-neutral-400">
          Track your outreach performance, limits, and response rates.
        </p>
      </div>

      <StatsCharts />
    </div>
  );
}
