export interface PromptAnswers {
  [key: string]: unknown;
}

export declare function prompt(): Promise<PromptAnswers>;
export declare function createPromptModule(): typeof prompt;
export declare const Separator: () => void;

declare const _default: {
  prompt: typeof prompt;
  createPromptModule: typeof createPromptModule;
};

export default _default;
