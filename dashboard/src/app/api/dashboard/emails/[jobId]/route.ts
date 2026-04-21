import { NextResponse } from "next/server";
import { getDraftWithFallback, HttpError } from "@/server/dashboard-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const data = await getDraftWithFallback(jobId);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to fetch draft" },
      { status: 500 },
    );
  }
}
