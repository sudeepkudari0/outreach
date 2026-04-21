import { NextResponse } from "next/server";
import { getStatsWithFallback, HttpError } from "@/server/dashboard-data";

export async function GET() {
  try {
    const data = await getStatsWithFallback();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
