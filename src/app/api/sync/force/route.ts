import { NextResponse } from "next/server";
import { forceFullSync } from "@/lib/forceSync";

export async function POST() {
  return NextResponse.json({ results: await forceFullSync() });
}
