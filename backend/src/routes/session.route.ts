import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
    getUserSessionController,
    getSessionBySlugIdController,
    createPullRequestController,
    sessionChatController
} from "../controllers/session.controller";

const sessionRoutes = Router()
    .get("/all", passportAuthenticateJwt, getUserSessionController)
    .post("/:slugId/pr", passportAuthenticateJwt, createPullRequestController)
    .get("/:slugId", passportAuthenticateJwt, getSessionBySlugIdController)
    .post("/chat", passportAuthenticateJwt, sessionChatController);

export default sessionRoutes;