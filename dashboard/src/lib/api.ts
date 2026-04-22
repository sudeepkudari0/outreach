const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const DASHBOARD_API_BASE = "/api/dashboard";

type Job = {
  id: string;
  title: string;
  company: string | null;
  recruiter_name: string | null;
  email: string;
  source_site: string;
  source_url: string;
  company_domain?: string | null;
  raw_post_text: string;
  source_type: "emails" | "manual" | "agent";
  notes: string | null;
  status: string;
  created_at: string;
};

type Draft = {
  id: string;
  job_id: string;
  subject: string | null;
  body: string | null;
  edited: boolean;
  sent_at: string | null;
  replied_at: string | null;
};

type JobWithDraft = Job & { draft: Draft | null };

export const api = {
  jobs: {
    list: async (
      status?: string,
      site?: string,
      source_type?: string,
    ): Promise<Job[]> => {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (site) params.append("site", site);
      if (source_type) params.append("source_type", source_type);

      const res = await fetch(
        `${DASHBOARD_API_BASE}/jobs?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },

    get: async (id: string): Promise<JobWithDraft> => {
      const res = await fetch(`${DASHBOARD_API_BASE}/jobs/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch job");
      return res.json();
    },

    updateStatus: async (id: string, status: string): Promise<Job> => {
      const res = await fetch(`${DASHBOARD_API_BASE}/jobs/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update status");
      }
      return res.json();
    },

    updateNotes: async (id: string, notes: string): Promise<Job> => {
      const res = await fetch(`${DASHBOARD_API_BASE}/jobs/${id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update notes");
      }
      return res.json();
    },

    scrape: async (
      site: "linkedin" | "naukri" | "all",
      options?: {
        dateFilter?: "r86400" | "r259200" | "r604800" | "r2592000";
        sourceType?: "emails" | "manual";
      },
    ) => {
      const res = await fetch(`${API_BASE_URL}/jobs/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          date_filter: options?.dateFilter,
          source_type: options?.sourceType,
        }),
      });
      if (!res.ok) throw new Error("Failed to start scrape");
      return res.json();
    },
  },

  emails: {
    getDraft: async (jobId: string): Promise<Draft> => {
      const res = await fetch(`${DASHBOARD_API_BASE}/emails/${jobId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch draft");
      return res.json();
    },

    updateDraft: async (
      jobId: string,
      subject: string,
      body: string,
    ): Promise<Draft> => {
      const res = await fetch(`${API_BASE_URL}/emails/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) throw new Error("Failed to update draft");
      return res.json();
    },

    regenerate: async (jobId: string): Promise<Draft> => {
      const res = await fetch(`${API_BASE_URL}/emails/${jobId}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to regenerate draft");
      return res.json();
    },

    approve: async (jobId: string) => {
      const res = await fetch(`${API_BASE_URL}/emails/${jobId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve draft");
      return res.json();
    },

    send: async (jobId: string, toEmail?: string) => {
      const res = await fetch(`${API_BASE_URL}/emails/${jobId}/send`, {
        method: "POST",
        headers: toEmail ? { "Content-Type": "application/json" } : undefined,
        body: toEmail ? JSON.stringify({ to_email: toEmail }) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send email");
      }
      return res.json();
    },

    sendAllApproved: async () => {
      const res = await fetch(`${API_BASE_URL}/emails/send-all-approved`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send approved emails");
      }
      return res.json();
    },
  },

  stats: {
    get: async () => {
      const res = await fetch(`${DASHBOARD_API_BASE}/stats`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  },

  settings: {
    uploadResume: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/upload-resume`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload resume");
      return res.json();
    },
  },

  agent: {
    run: async (linkedinUrl: string, jobId?: string) => {
      const res = await fetch(`${API_BASE_URL}/agent/find-and-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          linkedin_url: linkedinUrl,
          ...(jobId ? { job_id: jobId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Agent workflow failed");
      }
      return res.json();
    },

    verifyKey: async () => {
      const res = await fetch(`${API_BASE_URL}/agent/verify-key`, {
        method: "GET",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to verify key");
      }
      return res.json();
    },
  },
};

export type { Job, Draft, JobWithDraft };
