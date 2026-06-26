/**
 * Netlify Function: Supply Chain License Categories
 *
 * Returns static demo license category aggregates for the supply chain license
 * dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { name: "Permissive (Allowed)", count: 3214, risk: "allowed", examples: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"] },
    { name: "Weak Copyleft (Warn)", count: 24, risk: "warn", examples: ["LGPL-2.1", "LGPL-3.0", "MPL-2.0", "EUPL-1.2"] },
    { name: "Strong Copyleft (Denied)", count: 9, risk: "denied", examples: ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0"] },
    { name: "Public Domain", count: 600, risk: "allowed", examples: ["CC0-1.0", "Unlicense", "WTFPL"] },
  ]);
};
