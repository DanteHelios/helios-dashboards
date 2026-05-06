import { notFound } from "next/navigation";
import { getAdminProject, getAllClients } from "@/lib/admin-data";
import EditProjectForm from "./EditProjectForm";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, clients] = await Promise.all([
    getAdminProject(id),
    getAllClients(),
  ]);

  if (!project) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-fg-1">
          {project.name}
        </h1>
        <p className="mt-1 text-sm font-light text-fg-3">{project.client.name}</p>
      </div>
      <EditProjectForm project={project} clients={clients} />
    </div>
  );
}
