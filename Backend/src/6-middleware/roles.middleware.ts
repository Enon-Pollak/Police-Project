// Role-check middleware: allow only requests from users with one of the given roles.
import { RequestHandler } from "express";

export function requireRole(...roles: Array<"officer" | "volunteer">): RequestHandler {
  return (req, res, next) => {
    const user = (req as any).user;

    // If no user or role mismatch — block request
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    // Role OK — continue to next middleware/handler
    next();
  };
}
