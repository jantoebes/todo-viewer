import { NextResponse } from "next/server";
import { createList, isValidListName, listAvailableLists } from "@/lib/dataStore";
import { loadSyncConfig } from "@/lib/syncConfig";

function primaryList(): string | undefined {
  try {
    return loadSyncConfig().primaryList;
  } catch {
    return undefined;
  }
}

export async function GET() {
  return NextResponse.json({ lists: listAvailableLists(), primaryList: primaryList() });
}

export async function POST(req: Request) {
  const { name } = (await req.json()) as { name: string };
  if (!isValidListName(name)) {
    return NextResponse.json({ error: "Ongeldige lijstnaam (alleen letters, cijfers, - en _)" }, { status: 400 });
  }
  createList(name);
  return NextResponse.json({ lists: listAvailableLists() });
}
