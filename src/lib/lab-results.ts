import "server-only";
import { getSettings } from "@/lib/settings";
import {
  DEFAULT_LAB_RESULTS,
  LAB_RESULTS_KEY,
  sanitizeLabResults,
  type LabResultsContent,
} from "@/lib/lab-results-data";

/** The Lab Results page content, cleaned; the defaults when nothing is saved yet. */
export async function getLabResults(): Promise<LabResultsContent> {
  const raw = (await getSettings())[LAB_RESULTS_KEY];
  if (!raw) return DEFAULT_LAB_RESULTS;
  try {
    return sanitizeLabResults(JSON.parse(raw));
  } catch {
    return DEFAULT_LAB_RESULTS;
  }
}
