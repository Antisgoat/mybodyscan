import type { Request, Response, NextFunction } from "express";

export const chain =
  (...fns: Array<(req: Request, res: Response, next: NextFunction) => unknown>) =>
  (req: Request, res: Response, final: () => unknown) => {
    let i = 0;
    const step: NextFunction = () => {
      const fn = fns[i++];
      if (!fn) return final();
      return fn(req, res, step);
    };
    return step();
  };
