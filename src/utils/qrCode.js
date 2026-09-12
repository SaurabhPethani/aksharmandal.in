// Reading a member id out of a scanned QR code, as a LOCAL PRE-FILTER only.
//
// Codes this app generates are SIGNED tokens — `AKC1:{id}:{sig}`, e.g.
// "AKC1:24:hhbc3g22ptpjplb6" (see qr_service.build_qr_token). The signature is
// an HMAC the backend verifies on mark; the browser has no secret to check it
// with, so this NEVER decides who gets marked — the scanner sends the raw code
// and the server verifies it. This only reads the id out of a well-formed
// signed code so the scanner can name the member and reject an obvious
// non-code (a GPay / BHIM / random QR) without a pointless round-trip.
//
// A valid signature is now REQUIRED end to end: the transitional acceptance of
// old unsigned (`AKC1:24`) and bare-number ("24") codes was removed here and in
// qr_service.verify_qr_token once every code had been regenerated with a
// signature. That is what closes the "a number that is a valid id marks that
// member" gap — an unsigned code no longer resolves to anyone.
//
// ⚠ DO NOT re-add an unsigned branch or a "last number in the string" fallback.
// Either one lets an unrelated QR through: a bare number, or a URI stuffed with
// numbers (`upi://pay?pa=…&am=100&tn=…`), would again mark whatever member id
// those digits happened to form.

/**
 * @param raw the decoded QR string
 * @returns the member id as a number for DISPLAY/pre-filter, or null if this is
 *          not a signed code of ours. Not authoritative — the backend verifies.
 */
export function memberIdFromCode(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  // The signed form is the only code we accept: `AKC1:24:<sig>`. The signature
  // is verified by the backend on mark; this just reads the id.
  const signed = /^AKC1:(\d+):[a-z2-7]+$/i.exec(value);
  if (signed) return Number(signed[1]);

  // Anything else — a foreign QR, a bare number, an unsigned/hand-made code —
  // is not one of ours. Reject it rather than guessing an id from its digits.
  return null;
}
