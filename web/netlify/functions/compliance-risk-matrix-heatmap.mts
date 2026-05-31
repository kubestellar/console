/**
 * Netlify Function: Risk Matrix Heatmap
 *
 * Returns demo compliance dashboard data for production Netlify deployments.
 */
import { wrapComplianceDemoResponse } from "./_shared/compliance-demo-request";
import { getRiskMatrixHeatmapDemoData } from "./_shared/compliance-demo-data";

export default async (req: Request) => {
  return wrapComplianceDemoResponse(req, getRiskMatrixHeatmapDemoData());
};
