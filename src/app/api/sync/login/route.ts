import { NextResponse } from "next/server";
import { getLoginState, startLogin } from "@/lib/loginFlow";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getLoginState());
}

export async function POST() {
  return NextResponse.json(await startLogin());
}
