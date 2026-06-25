declare module "bwip-js" {
  interface BwipOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    dpi?: number;
  }

  function toBuffer(options: BwipOptions): Promise<Buffer>;

  export default { toBuffer };
}
