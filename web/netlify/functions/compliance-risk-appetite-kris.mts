/**
 * Netlify Function: Risk Appetite KRIs
 *
 * Returns demo compliance dashboard data for production Netlify deployments.
 */
import { wrapComplianceDemoResponse } from "./_shared/compliance-demo-request";
import { getRiskAppetiteKrisDemoData } from "./_shared/compliance-demo-data";

export default async (req: Request) => {
  return wrapComplianceDemoResponse(req, getRiskAppetiteKrisDemoData());
};
