import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { openApiDocument } from "@/lib/openapi/document";

export async function GET() {
  try {
    await requireActor();
    return Response.json(openApiDocument, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
