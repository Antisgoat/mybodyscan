export interface BuildResult {
  output: unknown[];
}

export declare function build(): Promise<BuildResult>;
export declare function createServer(): Promise<{
  listen: () => void;
  close: () => void;
}>;

declare const _default: {
  build: typeof build;
};

export default _default;
