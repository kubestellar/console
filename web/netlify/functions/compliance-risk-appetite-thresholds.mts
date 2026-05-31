/**
 * Netlify Function: Risk Appetite Thresholds
 *
 * Returns demo compliance dashboard data for production Netlify deployments.
 */
import { wrapComplianceDemoResponse } from "./_shared/compliance-demo-request";
import { getRiskAppetiteThresholdsDemoData } from "./_shared/compliance-demo-data";

export default async (req: Request) => {
  return wrapComplianceDemoResponse(req, getRiskAppetiteThresholdsDemoData());
};
