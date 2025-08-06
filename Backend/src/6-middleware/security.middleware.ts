import { NextFunction, Request, Response } from "express";
import { cyber } from "../2-utils/cyber";
import { ForbiddenError } from "../3-models/client-errors";
import striptags from "striptags";



class SecurityMiddleware {
    public verifyToken(request: Request, response: Response, next: NextFunction): void {
        const authHeader = request.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

        if (!token || !cyber.verifyToken(token)) {
            const err = new ForbiddenError("You are not logged-in.");
            next(err);
            return;
        }

        // Attach user to request (for use in controllers)
        const user = cyber.getUserFromToken(token);
        (request as any).user = user;
        next();
    }



    public preventXssAttack(request: Request, response: Response, next: NextFunction): void {

        //Run on body object:
        for (const prop in request.body) {

            //Take one value:
            const value = request.body[prop];

            //If string:
            if (typeof value === "string") {

                //Remove tags:
                request.body[prop] = striptags(value);
            }
        }
        next();
    }

}

export const securityMiddleware = new SecurityMiddleware();