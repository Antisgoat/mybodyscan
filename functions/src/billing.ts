import expressModule from "express";
import type { Request, Response } from "express";

import {
  handleCreateCheckout,
  handleCustomerPortal,
} from "./http/checkout.js";

const express = expressModule as any;

// Keep the aggregate `/api/billing/*` routes on the same implementation as the
// standalone Hosting rewrites. A previous duplicate router depended on
// unpopulated PRICE_* environment variables and rejected valid live prices.
export const billingRouter = express.Router();
billingRouter.use(express.json());
billingRouter.post(
  "/create-checkout-session",
  (req: Request, res: Response) => {
    void handleCreateCheckout(req, res);
  }
);
billingRouter.post("/portal", (req: Request, res: Response) => {
  void handleCustomerPortal(req, res);
});
billingRouter.post("/customer-portal", (req: Request, res: Response) => {
  void handleCustomerPortal(req, res);
});
