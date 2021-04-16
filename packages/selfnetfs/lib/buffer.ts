// TODO: Write tests for these functions or use a library.
// Didn't use a library for btoa and atob since it's not
// available in the same way in NodeJS and in the browser
// without another dependency.

const B64DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBuffer(text: string): Uint8Array {
  let reg = 0;
  let cnt = 0;
  let i = 0;
  const result: Array<number> = [];
  for ( ; i < text.length; ++i) {
    const c = text.charAt(i);
    if (c == '=') {
      break;
    }
    const j = B64DIGITS.indexOf(c);
    if (j < 0) {
      throw new Error('Invalid digit ' + JSON.stringify(c));
    }
    reg <<= 6;
    reg |= j;
    cnt += 6;
    if (cnt >= 8) {
      const val = reg >> (cnt - 8);
      result.push(val);
      reg = ((1 << (cnt - 8)) - 1) & reg;
      cnt -= 8;
    }
  }
  for ( ; i < text.length; ++i) {
    const c = text.charAt(i);
    if (c != '=') {
      throw new Error('Invalid digit ' + JSON.stringify(c));
    }
  }
  return Uint8Array.from(result);
}

export function base64ToString(text: string): string {
  return bufferToString(base64ToBuffer(text));
}

export function bufferToString(buffer: Uint8Array): string {
  return new TextDecoder().decode(buffer);
}

export function bufferToBase64(buffer: Uint8Array): string {
  const result = [];
  for (let i = 0; i < buffer.length; i += 3) {
    const parts = [-1, -1, -1, -1];
    parts[0] = buffer[i] >> 2;
    parts[1] = (buffer[i] & 0x03) << 4;
    if (i + 1 < buffer.length) {
      parts[1] |= buffer[i + 1] >> 4;
      parts[2] = (buffer[i + 1] & 0x0F) << 2;
      if (i + 2 < buffer.length) {
        parts[2] |= buffer[i + 2] >> 6;
        parts[3] = buffer[i + 2] & 0x3F;
      }
    }
    for (let j = 0; j < parts.length; ++j) {
      if (parts[j] >= 0) {
        result.push(B64DIGITS[parts[j]]);
      }
    }
  }
  while (result.length % 4 != 0) {
    result.push('=');
  }
  return result.join('');
}

export function stringToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function stringToBase64(text: string): string {
  return bufferToBase64(stringToBuffer(text));
}
