import { requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { TutorialVideo } from "@/components/guide/tutorial-video";
import { tutorials } from "@/lib/guide/tutorials";

export const metadata = { title: "使用說明" };
export default async function GuidePage() {
  const actor = await requireActor();
  const admin = canAccessZoneManagement(actor);
  return <div className="content guide-content">
    <PageHeader title="使用說明" description="操作教學影片；點選章節可直接跳到該段。" />
    {tutorials.filter((tutorial) => admin || !tutorial.adminOnly).map((tutorial) => <TutorialVideo key={tutorial.id} tutorial={tutorial} />)}
  </div>;
}
