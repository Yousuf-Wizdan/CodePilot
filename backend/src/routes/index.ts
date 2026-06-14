import { Router } from "express";
import authRoute from "./auth.route";
import githubRoutes from "./github.route";
import sessionRoutes from "./session.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/github", githubRoutes);
router.use("/session", sessionRoutes)

export default router;