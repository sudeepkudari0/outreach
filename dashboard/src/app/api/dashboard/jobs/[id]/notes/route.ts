import { NextResponse } from "next/server";
import { HttpError, updateJobNotesWithFallback } from "@/server/dashboard-data";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await req.json().catch(() => ({}));
    const notes = typeof payload?.notes === "string" ? payload.notes : "";

    const data = await updateJobNotesWithFallback(id, notes);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Failed to update notes" },
      { status: 500 },
    );
  }
}
