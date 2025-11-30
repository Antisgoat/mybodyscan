import expressModule from "express";
import { coachChatHandler } from "./coachChat.js";
import { allowCorsAndOptionalAppCheck } from "./http.js";

const express = expressModule as any;

export const coachRouter = express.Router();

coachRouter.use(allowCorsAndOptionalAppCheck);
coachRouter.use(express.json());

coachRouter.post("/chat", coachChatHandler);
