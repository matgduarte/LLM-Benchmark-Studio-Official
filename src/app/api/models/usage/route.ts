import { getModelUsage } from "@/lib/storage/executions-index";
import { apiHandler, json } from "@/lib/api/handlers";

/**
 * Models that actually have executions on disk, with counts per model. Feeds
 * the model picker of the cross-batch search — a model configured in a batch
 * that never ran has no execution to return, so it is not listed.
 */
export const GET = apiHandler(async () => {
  return json(await getModelUsage());
});
