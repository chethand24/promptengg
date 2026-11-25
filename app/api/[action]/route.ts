import { dispatch } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  return dispatch(request, action);
}
