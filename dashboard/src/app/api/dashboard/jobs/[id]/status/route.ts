import { NextResponse } from "next/server";
import { HttpError, updateJobStatusWithFallback } from "@/server/dashboard-data";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await req.json().catch(() => ({}));
    const status = typeof payload?.status === "string" ? payload.status : "";

    const data = await updateJobStatusWithFallback(id, status);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to update status" },
      { status: 500 },
    );
  }
}
