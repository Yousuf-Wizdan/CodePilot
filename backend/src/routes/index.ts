import { Router } from "express";
import authRoute from "./auth.route";
import githubRoutes from "./github.route";

const router = Router();

router.use("/auth", authRoute);
router.use("/github", githubRoutes);

export default router;