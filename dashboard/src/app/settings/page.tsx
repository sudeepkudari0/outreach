"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import CrawlLog from "@/components/CrawlLog";
import { Play, Loader2, Clock, FileText } from "lucide-react";

type ScrapeTarget = "linkedin" | "naukri" | "all";
type DateFilter = "r86400" | "r259200" | "r604800" | "r2592000";
type SourceType = "emails" | "manual";

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "r86400", label: "Last 24 hours" },
  { value: "r259200", label: "Last 3 days" },
  { value: "r604800", label: "Last 7 days" },
  { value: "r2592000", label: "Last month" },
];

const LOCATIONS = [
  { value: "bengaluru", label: "Bengaluru" },
  { value: "hyderabad", label: "Hyderabad" },
  { value: "pune", label: "Pune" },
  { value: "mumbai", label: "Mumbai" },
  { value: "delhi", label: "Delhi" },
];

export default function SettingsPage() {
  const [scrapeTarget, setScrapeTarget] = useState<ScrapeTarget>("linkedin");
  const [dateFilter, setDateFilter] = useState<DateFilter>("r86400");
  const [sourceType, setSourceType] = useState<SourceType>("manual");
  const [location, setLocation] = useState<string>("bangalore");
  const [limit, setLimit] = useState<number>(5);

  const scrapeMutation = useMutation({
    mutationFn: () =>
      api.jobs.scrape(scrapeTarget, {
        dateFilter,
        sourceType,
        limit,
        location,
      }),
  });

  const getButtonLabel = () => {
    if (scrapeMutation.isPending) {
      if (scrapeTarget === "all") return "Scraping LinkedIn + Naukri...";
      if (scrapeTarget === "linkedin") return "Scraping LinkedIn...";
      return "Scraping Naukri...";
    }
    return "Run Scraper";
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Manual Scrape
        </h1>
        <p className="text-neutral-400">
          Scrape jobs from LinkedIn. For manual mode, links are saved for you to
          apply manually.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={scrapeTarget}
          onChange={(e) => setScrapeTarget(e.target.value as ScrapeTarget)}
          disabled={scrapeMutation.isPending}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-neutral-200 disabled:opacity-50"
        >
          <option value="linkedin">LinkedIn Only</option>
          <option value="naukri">Naukri Only</option>
          <option value="all">All Sites (LinkedIn + Naukri)</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          disabled={scrapeMutation.isPending}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-neutral-200 disabled:opacity-50"
        >
          {DATE_FILTERS.map((df) => (
            <option key={df.value} value={df.value}>
              {df.label}
            </option>
          ))}
        </select>

        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType)}
          disabled={scrapeMutation.isPending}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-neutral-200 disabled:opacity-50"
        >
          <option value="emails">Extract Emails</option>
          <option value="manual">Manual (Save Links Only)</option>
        </select>

        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={scrapeMutation.isPending}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-neutral-200 disabled:opacity-50"
        >
          {LOCATIONS.map((loc) => (
            <option key={loc.value} value={loc.value}>
              {loc.label}
            </option>
          ))}
        </select>

        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          disabled={scrapeMutation.isPending}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors text-neutral-200 disabled:opacity-50"
        >
          <option value={5}>5 Records</option>
          <option value={10}>10 Records</option>
          <option value={20}>20 Records</option>
          <option value={30}>30 Records</option>
        </select>

        <button
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Loader2
            className={`w-4 h-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`}
          />
          {getButtonLabel()}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <CrawlLog />
      </div>
    </div>
  );
}
