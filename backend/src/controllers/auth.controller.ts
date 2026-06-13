import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { clearJwtAuthCookie, setJwtAuthCookie } from "../utils/cookie";
import { HTTPSTATUS } from "../config/http-status.config";
import { loginSchema, registerSchema } from "../validators/auth.validator";
import { loginService, registerService } from "../services/auth.service";

export const registerController = asyncHandler(
    async (req: Request, res: Response) => {
        const body = registerSchema.parse(req.body);
        const user = await registerService(body);
        const userId = user._id.toString();

        return setJwtAuthCookie({ res, userId }).status(HTTPSTATUS.CREATED).json({
            message: "User Registered Successfully!",
            user
        })
    }
);

export const loginController = asyncHandler(
    async (req: Request, res: Response) => {
        const body = loginSchema.parse(req.body);
        const user = await loginService(body);
        const userId = user._id.toString();

        return setJwtAuthCookie({ res, userId }).status(HTTPSTATUS.CREATED).json({
            message: "User Logged in Successfully!",
            user
        })
    }
)

export const logoutController = asyncHandler(async (_req: Request, res: Response) => {
    return clearJwtAuthCookie(res).status(HTTPSTATUS.OK).json({
        message: "User logged out successfully",
    });
});

export const authStatusController = asyncHandler(async (req: Request, res: Response) => {
    res.json({
        message: "Authenticated!",
        user: req.user
    })
})

