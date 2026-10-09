import { collectionEntryRoutes } from "#/src/cms/api.ts";

/** Deletes the published entry, and its draft. */
export const DELETE = collectionEntryRoutes.remove;
