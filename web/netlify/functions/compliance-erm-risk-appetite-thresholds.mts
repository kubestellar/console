/**
 * Netlify Function: Compliance ERM Risk Appetite Thresholds
 *
 * Returns static demo risk appetite threshold data for the enterprise risk appetite
 * dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { category: "Operational", appetite_level: 12, actual_exposure: 10, tolerance_max: 15, status: "green", statement: "We accept moderate operational disruption risk provided failover and DR plans are tested quarterly.", trend_quarters: [8, 9, 11, 10] },
    { category: "Strategic", appetite_level: 10, actual_exposure: 9, tolerance_max: 14, status: "green", statement: "We pursue calculated strategic risks that align with 3-year growth targets.", trend_quarters: [7, 8, 10, 9] },
    { category: "Financial", appetite_level: 8, actual_exposure: 10, tolerance_max: 12, status: "amber", statement: "We maintain conservative financial risk appetite with FX hedging for all major exposures.", trend_quarters: [6, 7, 9, 10] },
    { category: "Compliance", appetite_level: 5, actual_exposure: 8, tolerance_max: 7, status: "red", statement: "Zero tolerance for compliance breaches. All regulatory requirements must be met with evidence.", trend_quarters: [3, 4, 6, 8] },
    { category: "Technology", appetite_level: 12, actual_exposure: 14, tolerance_max: 16, status: "amber", statement: "We accept technology risk proportional to innovation velocity, with mandatory security gates.", trend_quarters: [10, 11, 13, 14] },
    { category: "Reputational", appetite_level: 6, actual_exposure: 5, tolerance_max: 8, status: "green", statement: "We protect brand reputation aggressively with proactive communication and transparency.", trend_quarters: [4, 5, 5, 5] },
  ]);
};
