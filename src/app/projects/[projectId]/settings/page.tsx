import { listApiKeys } from "@/server/apiKeys";
import { CreateApiKeyForm } from "@/components/CreateApiKeyForm";
import { formatRelativeTime } from "@/lib/format";

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const keys = await listApiKeys(projectId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="text-sm font-medium text-muted">API keys</h2>
        {keys.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted">
            No API keys yet. Generate one to start sending traces with the SDK.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Public key</th>
                  <th className="px-4 py-2.5 font-medium">Secret</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs">{k.publicKey}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">sk-tw-…{k.secretKeyPreview}</td>
                    <td className="px-4 py-3 text-muted">{formatRelativeTime(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateApiKeyForm projectId={projectId} />
    </div>
  );
}
