import { NextResponse } from "next/server";
import { getJobWithDraftFallback, HttpError } from "@/server/dashboard-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await getJobWithDraftFallback(id);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to fetch job" },
      { status: 500 },
    );
  }
}
