import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCodes } from "../utils/app-error";
import { HTTPSTATUS } from "../config/http-status.config";

function formatZodError(error: ZodError) {
    return error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message
    }));
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
    console.log("Error Occured: ", err);
    if (err instanceof ZodError) {
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
            message: "Validation Failed",
            errorCode: "ERR_VALIDATION",
            errors: formatZodError(err)
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            message: err.message,
            errorCode: err.errorCode,
        });
    }

    return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
        message: "Internal Server Error",
        errorCode: ErrorCodes.ERR_INTERNAL,
        error: err.message
    })

}