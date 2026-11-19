"use client";

import { AppShell } from "./components/app-shell";
import { BatchesView } from "./components/views/batches-view";
import { CreateBatchView } from "./components/views/create-batch-view";
import { BatchDetailView } from "./components/views/batch-detail-view";
import { ModelSearchView } from "./components/views/model-search-view";
import { UsageView } from "./components/views/usage-view";
import { SettingsView } from "./components/views/settings-view";
import { ExecutionDetailDialog } from "./components/execution-detail-dialog";
import { useAppStore } from "@/lib/store";

export default function Home() {
  const view = useAppStore((s) => s.view);

  return (
    <AppShell>
      {view.kind === "batches" && <BatchesView />}
      {view.kind === "create-batch" && (
        // Remount when the source batch changes so the form re-hydrates.
        <CreateBatchView key={view.duplicateFrom ?? "new"} duplicateFrom={view.duplicateFrom} />
      )}
      {view.kind === "batch-detail" && <BatchDetailView batchId={view.batchId} />}
      {view.kind === "model-search" && <ModelSearchView />}
      {view.kind === "usage" && <UsageView />}
      {view.kind === "settings" && <SettingsView />}
      <ExecutionDetailDialog />
    </AppShell>
  );
}
