declare module "heic-convert" {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }

  function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer | Buffer | Uint8Array>;

  export default heicConvert;
}

