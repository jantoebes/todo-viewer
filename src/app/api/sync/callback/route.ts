import { NextResponse } from "next/server";
import { completeLogin } from "@/lib/loginFlow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  await completeLogin(params.get("code"), params.get("state"), params.get("error_description"));
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
