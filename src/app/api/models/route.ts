import { NextResponse } from "next/server";
import { listAllModels } from "@/lib/storage/models";
import { apiHandler } from "@/lib/api/handlers";

export const GET = apiHandler(async () => {
  const models = await listAllModels();
  return NextResponse.json({ models });
});
