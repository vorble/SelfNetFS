export function uuidgen(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0F) | 0x40;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;
  let i = 0;
  return 'XXXX-XX-XX-XX-XXXXXX'.replace(/X/g, () => {
    const o = bytes[i++].toString(16);
    return o.length == 1 ? '0' + o : o;
  });
}
