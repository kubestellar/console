/**
 * Netlify Function: Risk Appetite Summary
 *
 * Returns demo compliance dashboard data for production Netlify deployments.
 */
import { wrapComplianceDemoResponse } from "./_shared/compliance-demo-request";
import { getRiskAppetiteSummaryDemoData } from "./_shared/compliance-demo-data";

export default async (req: Request) => {
  return wrapComplianceDemoResponse(req, getRiskAppetiteSummaryDemoData());
};
