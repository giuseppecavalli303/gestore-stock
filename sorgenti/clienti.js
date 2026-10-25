/* ---------- nomi dei clienti: arrivano cifrati (agente/nomi.js), si leggono solo con la chiave del dispositivo ---------- */
const b64Byte = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
async function decifraClienti(data, chiave, subtle) {
  if (!chiave || !data || !data.cars || !subtle) return 0;
  let key, n = 0;
  try { key = await subtle.importKey('raw', b64Byte(chiave), 'AES-GCM', false, ['decrypt']); } catch (e) { return 0; }
  for (const c of data.cars) {
    if (!c.acqX) continue;
    try { const b = b64Byte(c.acqX); c.acq = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12))); n++; } catch (e) { /* chiave sbagliata: niente nome */ }
  }
  return n;
}
