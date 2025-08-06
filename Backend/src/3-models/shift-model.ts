import mongoose, { Schema, Document } from "mongoose";
import { Unit } from "./unit";
import { ShiftType } from "./shift-type";

// Interface for the Shift document
export interface IShift extends Document {
    date: Date;
    shiftType: ShiftType;
    unit: Unit;
    requiredVolunteers: number;
    registeredVolunteers: Array<{
        userId: mongoose.Types.ObjectId;
        volunteerType: string; // שלב א / שלב ב
        arrivalTime: string;   // "08:00"
        leavingTime: string;   // "14:00"
        note?: string;
        approved: boolean;
        waitlist: boolean;
    }>;
    waitlistVolunteers: Array<{
        userId: mongoose.Types.ObjectId;
        volunteerType: string; // שלב א / שלב ב
        registeredAt: Date;
    }>;
    status: "open" | "published" | "locked";
    shiftNote?: string;
    sharedNote?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

// Mongoose schema for the Shift
const ShiftSchema = new Schema<IShift>({
    date: {
        type: Date,
        required: [true, "Missing date."]
    },
    shiftType: {
        type: String,
        enum: Object.values(ShiftType), // Shift type enum
        required: [true, "Missing shift type."]
    },
    unit: {
        type: String,
        enum: Object.values(Unit), // Police unit enum
        required: [true, "Missing unit."]
    },
    requiredVolunteers: {
        type: Number,
        max: [15, "Too many volunteers for one shift!"], // Adjust as needed
        required: [true, "Missing required volunteer count."]
    },
    registeredVolunteers: [ // Volunteers assigned to this shift
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: [true, "Missing volunteer ID."]
            },
            volunteerType: {
                type: String,
                enum: ["שלב א", "שלב ב"],
                required: true
            },
            arrivalTime: {
                type: String, // Format "HH:MM"
                required: [true, "Missing arrival time."]
            },
            leavingTime: {
                type: String, // Format "HH:MM"
                required: [true, "Missing leaving time."]
            },
            note: { type: String }, // Optional note
            approved: { type: Boolean, default: false }, // Officer approval
            waitlist: { type: Boolean, default: false }  // Is on waitlist
        }
    ],
    waitlistVolunteers: [ // Volunteers waiting for a spot
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: [true, "Missing volunteer ID."]
            },
            volunteerType: {
                type: String,
                enum: ["שלב א", "שלב ב"],
                required: true
            },
            registeredAt: { type: Date, default: Date.now } // Waitlist timestamp
        }
    ],
    status: {
        type: String,
        enum: ["open", "published", "locked"], // Shift status
        default: "open"
    },
    shiftNote: { type: String },    // Officer-only note
    sharedNote: { type: String },   // Note visible to all
}, { timestamps: true }); // Adds createdAt and updatedAt

export const ShiftModel = mongoose.model<IShift>("Shift", ShiftSchema);
