import express, { Request, Response, Router } from "express";
import { StatusCode } from "../3-models/status-code";
import { securityMiddleware } from "../6-middleware/security.middleware";
import { requireRole } from "../6-middleware/roles.middleware";
import { shiftService } from "../4-services/shift-service";
import { ShiftModel } from "../3-models/shift-model";

/**
 * ShiftController
 * - Registers routes for shift CRUD, volunteer actions and officer utilities.
 * - Uses securityMiddleware.verifyToken to attach user info on req.
 */
class ShiftController {
    public router: Router = express.Router();

    public constructor() {
        // Officer CRUD (create / update / delete)
        this.router.post("/api/shifts", securityMiddleware.verifyToken, requireRole("officer"), this.create);
        this.router.put("/api/shifts/:id", securityMiddleware.verifyToken, requireRole("officer"), this.update);
        // Read endpoints (authenticated)
        this.router.get("/api/shifts", securityMiddleware.verifyToken, this.list);
        this.router.get("/api/shifts/:id", securityMiddleware.verifyToken, this.getOne);

        // Volunteer actions (register / unregister)
        this.router.post("/api/shifts/:id/register", securityMiddleware.verifyToken, requireRole("volunteer", "officer"), this.register);
        this.router.post("/api/shifts/:id/unregister", securityMiddleware.verifyToken, requireRole("volunteer", "officer"), this.unregister);

        // Officer actions: approve volunteer and get status indicator
        this.router.post("/api/shifts/:id/approve/:volunteerId", securityMiddleware.verifyToken, requireRole("officer"), this.approve);
        this.router.get("/api/shifts/:id/status-indicator", securityMiddleware.verifyToken, requireRole("officer"), this.statusIndicator);
    }

    // ===== Handlers =====

    // Create a new shift (officer)
    private async create(req: Request, res: Response) {
        try {
            const saved = await shiftService.create(req.body);
            res.status(StatusCode.Created).json(saved);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Update existing shift by id (officer)
    private async update(req: Request, res: Response) {
        try {
            const s = await shiftService.update(req.params.id, req.body);
            if (!s) {
                res.status(StatusCode.NotFound).json({ message: "Shift not found" });
                return;
            }
            res.json(s);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }
    // List shifts with optional filters: unit, shiftType, date range, status
    private async list(req: Request, res: Response) {
        try {
            const { unit, shiftType, from, to, status } = req.query as any;
            const data = await shiftService.listByRange({
                unit,
                shiftType,
                status,
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined
            });
            res.json(data);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Get single shift by id
    private async getOne(req: Request, res: Response) {
        try {
            const s = await shiftService.getOne(req.params.id);
            if (!s) {
                res.status(StatusCode.NotFound).json({ message: "Shift not found" });
                return;
            }
            res.json(s);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Register current user to shift (volunteer). Body requires volunteerType, arrivalTime, leavingTime.
    private async register(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { volunteerType, arrivalTime, leavingTime, note } = req.body;

            if (!volunteerType || !arrivalTime || !leavingTime) {
                res.status(StatusCode.BadRequest).json({ message: "volunteerType, arrivalTime and leavingTime are required." });
                return;
            }

            // Prevents “08:00–07:00” or bad formats from slipping in:
            const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (!hhmm.test(arrivalTime) || !hhmm.test(leavingTime)) {
                res.status(400).json({ message: "arrivalTime/leavingTime must be HH:MM" });
                return;
            }
            if (arrivalTime >= leavingTime) {
                res.status(400).json({ message: "leavingTime must be after arrivalTime" });
                return;
            }


            const result = await shiftService.register({
                shiftId: req.params.id,
                userId: user._id,
                volunteerType,
                arrivalTime,
                leavingTime,
                note
            });

            res.status(StatusCode.OK).json(result);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Unregister current user from shift (volunteer)
    private async unregister(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const result = await shiftService.unregister(req.params.id, user._id);
            res.status(StatusCode.OK).json(result);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Approve/un-approve a volunteer in the main list (officer).
    // Query param: ?approve=true|false
    private async approve(req: Request, res: Response) {
        try {
            const approve = String(req.query.approve ?? "true") === "true";
            const shift = await shiftService.approve(req.params.id, req.params.volunteerId, approve);
            res.json(shift);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }

    // Get status indicator for officer home screen (color + pending flag)
    private async statusIndicator(req: Request, res: Response) {
        try {
            const exists = await ShiftModel.exists({ _id: req.params.id });
            if (!exists) {
                res.status(StatusCode.NotFound).json({ message: "Shift not found" });
                return;
            }
            const result = await shiftService.statusIndicator(req.params.id);
            res.json(result);
        } catch (err: any) {
            res.status(StatusCode.BadRequest).json({ message: err.message });
        }
    }
}

export const shiftController = new ShiftController();
