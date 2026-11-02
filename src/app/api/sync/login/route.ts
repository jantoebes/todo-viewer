import { NextResponse } from "next/server";
import { getLoginState, startLogin } from "@/lib/loginFlow";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getLoginState());
}

export async function POST(request: Request) {
  const { origin } = await request.json();
  return NextResponse.json(await startLogin(origin));
}
