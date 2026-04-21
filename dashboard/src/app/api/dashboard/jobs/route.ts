import { NextResponse } from "next/server";
import { getJobsWithFallback, HttpError } from "@/server/dashboard-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const data = await getJobsWithFallback({
      status: searchParams.get("status") || undefined,
      site: searchParams.get("site") || undefined,
      sourceType: searchParams.get("source_type") || undefined,
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}
