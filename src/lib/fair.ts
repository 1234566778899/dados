/**
 * Cara de 1 a 6 con probabilidad exactamente uniforme.
 * Se descartan los bytes >= 252 porque 256 no es multiplo de 6: usar `% 6`
 * directamente favoreceria a las caras 1-4.
 */
export function fairFace(randomBytes: (out: Uint8Array) => void = defaultBytes): number {
  const byte = new Uint8Array(1);
  for (;;) {
    randomBytes(byte);
    if (byte[0] < 252) return (byte[0] % 6) + 1;
  }
}

function defaultBytes(out: Uint8Array) {
  crypto.getRandomValues(out);
}
