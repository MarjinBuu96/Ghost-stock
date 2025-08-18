import { listAlerts } from "@/lib/mockStore";

export async function GET() {
  return Response.json({ alerts: listAlerts() });
}
