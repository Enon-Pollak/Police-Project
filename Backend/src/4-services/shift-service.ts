import mongoose from "mongoose";
import { ShiftModel, IShift } from "../3-models/shift-model";

/**
 * ShiftService - business logic for shifts:
 * - list/get/create/update/delete
 * - volunteer actions: register, unregister
 * - officer actions: approve, status indicator
 * Comments are concise and focused on intent.
 */

// Convenience types for nested arrays
type RegisteredRec = IShift["registeredVolunteers"][number];
type WaitlistRec = IShift["waitlistVolunteers"][number];

class ShiftService {
    // List with optional date range and filters
    public listByRange(params: {
        unit?: IShift["unit"];
        shiftType?: IShift["shiftType"];
        from?: Date;
        to?: Date;
        status?: IShift["status"];
    }) {
        const { unit, shiftType, from, to, status } = params || {};
        const q: any = {};
        if (unit) q.unit = unit;
        if (shiftType) q.shiftType = shiftType;
        if (status) q.status = status;
        if (from || to) q.date = {};
        if (from) q.date.$gte = from;
        if (to) q.date.$lte = to;

        // Return plain objects for lists
        return ShiftModel.find(q).sort({ date: 1 }).lean<IShift[]>().exec();
    }

    // Get single shift
    public getOne(id: string) {
        return ShiftModel.findById(id).lean<IShift | null>().exec();
    }

    // Create a shift document
    public create(data: Partial<IShift>) {
        return new ShiftModel(data).save();
    }

    // Update and return the updated doc (or null)
    public update(id: string, data: Partial<IShift>) {
        return ShiftModel.findByIdAndUpdate(id, data, { new: true }).lean<IShift | null>().exec();
    }

    /**
     * Register a volunteer.
     * - If main list is full, user goes to waitlist.
     */
    public async register(params: {
        shiftId: string;
        userId: string;
        volunteerType: RegisteredRec["volunteerType"];
        arrivalTime: RegisteredRec["arrivalTime"];
        leavingTime: RegisteredRec["leavingTime"];
        note?: RegisteredRec["note"];
    }) {
        const { shiftId, userId, volunteerType, arrivalTime, leavingTime, note } = params;

        const shift = await ShiftModel.findById(shiftId).exec();
        if (!shift) throw new Error("Shift not found");

        if (shift.status === "locked") throw new Error("Shift is locked");
        if (!["open", "published"].includes(shift.status)) {
            throw new Error("Shift not open for registration");
        }

        const uid = new mongoose.Types.ObjectId(userId);
        const alreadyInMain = shift.registeredVolunteers.some((r: RegisteredRec) => r.userId.equals(uid));
        const alreadyInWait = shift.waitlistVolunteers.some((w: WaitlistRec) => w.userId.equals(uid));
        if (alreadyInMain || alreadyInWait) throw new Error("Already registered (or waitlisted)");

        const mainCount = shift.registeredVolunteers.filter((r: RegisteredRec) => !r.waitlist).length;

        if (mainCount < shift.requiredVolunteers) {
            // Add to main list
            shift.registeredVolunteers.push({
                userId: uid,
                volunteerType,
                arrivalTime,
                leavingTime,
                note,
                approved: false,
                waitlist: false
            } as RegisteredRec);
        } else {
            // Add to waitlist (FIFO)
            shift.waitlistVolunteers.push({
                userId: uid,
                volunteerType,
                registeredAt: new Date()
            } as WaitlistRec);
        }

        await shift.save();
        return shift.toObject();
    }

    /**
     * Unregister a volunteer.
     * - If removed from main list, promote first waitlisted user (FIFO).
     */
    public async unregister(shiftId: string, userId: string) {
        const shift = await ShiftModel.findById(shiftId).exec();
        if (!shift) throw new Error("Shift not found");

        const uid = new mongoose.Types.ObjectId(userId);

        const beforeMain = shift.registeredVolunteers.length;
        shift.registeredVolunteers = shift.registeredVolunteers.filter(
            (r: RegisteredRec) => !r.userId.equals(uid)
        );

        // If somebody removed from main, promote earliest waitlisted
        if (shift.registeredVolunteers.length < beforeMain && shift.waitlistVolunteers.length > 0) {
            const [promoted] = shift.waitlistVolunteers
                .sort((a: WaitlistRec, b: WaitlistRec) => a.registeredAt.getTime() - b.registeredAt.getTime())
                .splice(0, 1);

            if (promoted) {
                shift.registeredVolunteers.push({
                    userId: promoted.userId,
                    volunteerType: promoted.volunteerType,
                    arrivalTime: "00:00", // placeholder; frontend should update
                    leavingTime: "00:00",
                    note: undefined,
                    approved: false,
                    waitlist: false
                } as RegisteredRec);
            }
        }

        const beforeWait = shift.waitlistVolunteers.length;
        shift.waitlistVolunteers = shift.waitlistVolunteers.filter(
            (w: WaitlistRec) => !w.userId.equals(uid)
        );

        if (
            shift.registeredVolunteers.length === beforeMain &&
            shift.waitlistVolunteers.length === beforeWait
        ) {
            throw new Error("User was not registered or waitlisted");
        }

        await shift.save();
        return shift.toObject();
    }

    // Approve or revoke approval for a main-list volunteer
    public async approve(shiftId: string, volunteerId: string, approve: boolean) {
        const shift = await ShiftModel.findById(shiftId).exec();
        if (!shift) throw new Error("Shift not found");

        const vid = new mongoose.Types.ObjectId(volunteerId);
        const rec = shift.registeredVolunteers.find((r: RegisteredRec) => r.userId.equals(vid));
        if (!rec) throw new Error("Volunteer not found in main registrations");

        rec.approved = approve;
        await shift.save();
        return shift.toObject();
    }

    /**
     * Compute status indicator for officer home:
     * - color: gray|green|orange|blue
     * - pendingIcon: true if any non-approved in main list
     */
    public async statusIndicator(shiftId: string) {
        const shift = await ShiftModel.findById(shiftId).lean<IShift | null>().exec();
        if (!shift) throw new Error("Shift not found");

        const total = shift.registeredVolunteers.length;
        const approved = shift.registeredVolunteers.filter((r: RegisteredRec) => r.approved).length;
        const hasPending = shift.registeredVolunteers.some((r: RegisteredRec) => !r.approved);

        let color: "gray" | "green" | "orange" | "blue";
        if (total === 0) color = "gray";
        else if (approved >= shift.requiredVolunteers && shift.waitlistVolunteers.length > 0) color = "blue";
        else if (approved >= shift.requiredVolunteers) color = "green";
        else color = "orange";

        return {
            color,
            pendingIcon: hasPending,
            counts: {
                approved,
                total,
                required: shift.requiredVolunteers,
                waitlisted: shift.waitlistVolunteers.length
            },
            status: shift.status
        };
    }
}

export const shiftService = new ShiftService();
