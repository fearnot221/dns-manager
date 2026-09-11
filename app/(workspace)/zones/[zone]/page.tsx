import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RecordsWorkbench } from "@/components/records/records-workbench";
import { PageHeader } from "@/components/ui";
import { canManageZone } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import { normalizeZoneName } from "@/lib/dns/names";
import { notFound } from "next/navigation";

export default async function ZonePage({ params }: PageProps<"/zones/[zone]">) {
  const actor = await requireActor();
  const { zone } = await params;
  const zoneName = normalizeZoneName(zone);
  if (!canManageZone(actor, zoneName)) notFound();

  return (
    <div className="content">
      <Link href="/zones" className="back-link"><ArrowLeft size={14} />所有 Zone</Link>
      <PageHeader title={zone} description="查詢、分類與維護這個網域的 DNS 紀錄。" />
      <RecordsWorkbench key={zoneName} zoneName={zoneName} />
    </div>
  );
}
