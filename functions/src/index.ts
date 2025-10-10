import * as functions from "firebase-functions/v2/https";
import express from "express";
import { appCheckSoft } from "./middleware/appCheck.js";
import { submitScan } from "./scan/submit.js";
import { nutritionSearch } from "./nutritionSearch.js";
import { coachChat } from "./coachChat.js";
import { createCheckoutHandler as createCheckout } from "./payments.js";
import { systemHealth } from "./system/health.js";

const app = express();
app.use((express as any).json({ limit: "10mb" }));
app.use(appCheckSoft);

app.get("/system/health", systemHealth);
app.post("/submitScan", submitScan);
app.post("/nutritionSearch", nutritionSearch);
app.post("/coachChat", coachChat);
app.post("/createCheckout", createCheckout);

export const http = functions.onRequest({ cors: true, timeoutSeconds: 60 }, app);
