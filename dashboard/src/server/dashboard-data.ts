"use server";

import { ObjectId } from "mongodb";
import { getMongoDb } from "@/server/mongodb";

const BACKEND_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const DEFAULT_DAILY_LIMIT = Number(process.env.DAILY_SEND_LIMIT || "20");

export type DashboardJob = {
  id: string;
  title: string;
  company: string | null;
  recruiter_name: string | null;
  email: string;
  source_site: string;
  source_url: string;
  raw_post_text: string;
  source_type: "emails" | "manual";
  notes: string | null;
  status: string;
  created_at: string;
};

export type DashboardDraft = {
  id: string;
  job_id: string;
  subject: string | null;
  body: string | null;
  edited: boolean;
  sent_at: string | null;
  replied_at: string | null;
};

export type DashboardJobWithDraft = DashboardJob & {
  draft: DashboardDraft | null;
};

export type DashboardStats = {
  total_found: number;
  total_drafted: number;
  total_sent: number;
  total_replied: number;
  reply_rate: number;
  sent_today: number;
  daily_limit: number;
  by_site: Record<string, { found: number; sent: number }>;
  sent_per_day: Array<{ date: string; count: number }>;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchBackendJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_API_BASE}${path}`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    if (res.status < 500) {
      const body = await res.json().catch(() => ({}));
      const message =
        typeof body?.detail === "string"
          ? body.detail
          : `Backend request failed (${res.status})`;
      throw new HttpError(res.status, message);
    }

    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    return null;
  }
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(0).toISOString();
}

function mapJobDoc(doc: Record<string, unknown>): DashboardJob {
  return {
    id: String(doc._id),
    title: String(doc.title || ""),
    company: (doc.company as string | null) ?? null,
    recruiter_name: (doc.recruiter_name as string | null) ?? null,
    email: String(doc.email || ""),
    source_site: String(doc.source_site || ""),
    source_url: String(doc.source_url || ""),
    raw_post_text: String(doc.raw_post_text || ""),
    source_type: (doc.source_type as "emails" | "manual") || "emails",
    notes: (doc.notes as string | null) ?? null,
    status: String(doc.status || "found"),
    created_at: toIsoString(doc.created_at),
  };
}

function mapDraftDoc(doc: Record<string, unknown>): DashboardDraft {
  return {
    id: String(doc._id),
    job_id: String(doc.job_id || ""),
    subject: (doc.subject as string | null) ?? null,
    body: (doc.body as string | null) ?? null,
    edited: Boolean(doc.edited),
    sent_at: doc.sent_at ? toIsoString(doc.sent_at) : null,
    replied_at: doc.replied_at ? toIsoString(doc.replied_at) : null,
  };
}

export async function getJobsWithFallback(filters: {
  status?: string;
  site?: string;
  sourceType?: string;
}): Promise<DashboardJob[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.site) params.set("site", filters.site);
  if (filters.sourceType) params.set("source_type", filters.sourceType);

  const backendData = await fetchBackendJson<DashboardJob[]>(
    `/jobs?${params.toString()}`,
  );
  if (backendData) {
    return backendData;
  }

  const db = await getMongoDb();
  const query: Record<string, string> = {};

  if (filters.status) query.status = filters.status;
  if (filters.site) query.source_site = filters.site;
  if (filters.sourceType) query.source_type = filters.sourceType;

  const jobs = await db
    .collection("jobs")
    .find(query)
    .sort({ created_at: -1 })
    .toArray();

  return jobs.map((job) => mapJobDoc(job as unknown as Record<string, unknown>));
}

export async function getJobWithDraftFallback(
  jobId: string,
): Promise<DashboardJobWithDraft> {
  const backendData = await fetchBackendJson<DashboardJobWithDraft>(`/jobs/${jobId}`);
  if (backendData) {
    return backendData;
  }

  if (!ObjectId.isValid(jobId)) {
    throw new HttpError(404, "Job not found");
  }

  const db = await getMongoDb();
  const job = await db
    .collection("jobs")
    .findOne({ _id: new ObjectId(jobId) });

  if (!job) {
    throw new HttpError(404, "Job not found");
  }

  const draft = await db.collection("email_drafts").findOne({ job_id: jobId });

  return {
    ...mapJobDoc(job as unknown as Record<string, unknown>),
    draft: draft
      ? mapDraftDoc(draft as unknown as Record<string, unknown>)
      : null,
  };
}

export async function getDraftWithFallback(jobId: string): Promise<DashboardDraft> {
  const backendData = await fetchBackendJson<DashboardDraft>(`/emails/${jobId}`);
  if (backendData) {
    return backendData;
  }

  const db = await getMongoDb();
  const draft = await db.collection("email_drafts").findOne({ job_id: jobId });

  if (!draft) {
    throw new HttpError(404, "Draft not found for this job");
  }

  return mapDraftDoc(draft as unknown as Record<string, unknown>);
}

function utcDayStart(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function getStatsWithFallback(): Promise<DashboardStats> {
  const backendData = await fetchBackendJson<DashboardStats>("/stats");
  if (backendData) {
    return backendData;
  }

  const db = await getMongoDb();
  const jobs = db.collection("jobs");
  const drafts = db.collection("email_drafts");

  const [totalFound, totalDrafted, totalSent, totalReplied] = await Promise.all([
    jobs.countDocuments({}),
    jobs.countDocuments({ status: "drafted" }),
    jobs.countDocuments({ status: "sent" }),
    jobs.countDocuments({ status: "replied" }),
  ]);

  const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;

  const todayStart = utcDayStart();
  const sentToday = await drafts.countDocuments({
    sent_at: { $gte: todayStart, $ne: null },
  });

  const bySite: Record<string, { found: number; sent: number }> = {};
  for (const site of ["linkedin", "naukri", "instahyre"]) {
    const [found, sent] = await Promise.all([
      jobs.countDocuments({ source_site: site }),
      jobs.countDocuments({ source_site: site, status: "sent" }),
    ]);

    if (found > 0) {
      bySite[site] = { found, sent };
    }
  }

  const sentPerDay: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i -= 1) {
    const dayStart = utcDayStart(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const count = await drafts.countDocuments({
      sent_at: { $gte: dayStart, $lt: nextDay },
    });

    sentPerDay.push({
      date: dayStart.toISOString().slice(0, 10),
      count,
    });
  }

  return {
    total_found: totalFound,
    total_drafted: totalDrafted,
    total_sent: totalSent,
    total_replied: totalReplied,
    reply_rate: Number(replyRate.toFixed(1)),
    sent_today: sentToday,
    daily_limit: DEFAULT_DAILY_LIMIT,
    by_site: bySite,
    sent_per_day: sentPerDay,
  };
}

export { HttpError };
