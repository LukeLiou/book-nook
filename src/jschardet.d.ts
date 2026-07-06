declare module 'jschardet' {
  interface DetectResult {
    encoding?: string;
    confidence?: number;
  }
  export function detect(buffer: Buffer | Uint8Array): DetectResult;
}
