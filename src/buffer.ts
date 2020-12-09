export function base64ToBuffer(text: string): Uint8Array {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

export function base64ToString(text: string): string {
  return bufferToString(base64ToBuffer(text));
}

export function bufferToString(buffer: Uint8Array): string {
  return new TextDecoder().decode(buffer);
}

export function bufferToBase64(buffer: Uint8Array): string {
  const result = [];
  for (let i = 0; i < buffer.length; ++i) {
    result.push(String.fromCharCode(buffer[i]));
  }
  return btoa(result.join(''));
}

export function stringToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function stringToBase64(text: string): string {
  return bufferToBase64(stringToBuffer(text));
}
