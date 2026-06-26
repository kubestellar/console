/**
 * Netlify Function: Compliance ERM Risk Matrix Heatmap
 *
 * Returns static demo risk heatmap cells for the enterprise risk matrix dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { likelihood: 4, impact: 5, count: 1, risks: ["RSK-002"] },
    { likelihood: 4, impact: 4, count: 1, risks: ["RSK-017"] },
    { likelihood: 4, impact: 3, count: 1, risks: ["RSK-006"] },
    { likelihood: 4, impact: 2, count: 1, risks: ["RSK-012"] },
    { likelihood: 3, impact: 5, count: 2, risks: ["RSK-001", "RSK-008"] },
    { likelihood: 3, impact: 4, count: 2, risks: ["RSK-004", "RSK-013"] },
    { likelihood: 3, impact: 3, count: 2, risks: ["RSK-005", "RSK-015"] },
    { likelihood: 2, impact: 5, count: 3, risks: ["RSK-003", "RSK-010", "RSK-016"] },
    { likelihood: 2, impact: 4, count: 2, risks: ["RSK-007", "RSK-014"] },
    { likelihood: 2, impact: 3, count: 1, risks: ["RSK-009"] },
    { likelihood: 1, impact: 5, count: 2, risks: ["RSK-011", "RSK-018"] },
  ]);
};
