/**
 * ponytail: extractPhones must keep real mobiles and drop short/noisy matches.
 * Run: npx tsx lib/extract-phones.check.ts
 */
import { extractPhones } from "./csv";

const text = "Reach HR at +91 98765 43210 or call (415) 555-0199. Fake: 12345.";
const phones = extractPhones(text);

if (phones.length < 2) {
  throw new Error(`expected >=2 phones, got ${JSON.stringify(phones)}`);
}
if (!phones.some((p) => p.includes("98765"))) {
  throw new Error(`missing India mobile: ${JSON.stringify(phones)}`);
}
if (phones.some((p) => (p.match(/\d/g) || []).length < 10)) {
  throw new Error(`kept short number: ${JSON.stringify(phones)}`);
}

console.log("extract-phones.check: ok", phones);
