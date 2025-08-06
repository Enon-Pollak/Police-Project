import mongoose, { Schema, Document, ObjectId } from "mongoose";
import { UserRole } from "./role";
import { Gender } from "./gender";
import { VolunteerType } from "./volunteer-type";

// Main interface for the user document
export interface IUser extends Document {
    fullName: string;
    email: string;
    phone: string;
    password: string; // hashed password
    role: UserRole;
    serviceNumber: string;
    gender: Gender;
    profileImage?: string;

    // Only for volunteers
    volunteerData?: {
        volunteerType: VolunteerType;
        hasDriverLicense: boolean;
    };
}

// Mongoose schema for the user
const UserSchema = new Schema<IUser>({

    fullName: {
        type: String,
        required: [true, "Missing FullName"],
        minlength: [2, "Name too short."],
        maxlength: [50, "Name too long."]
    },
    email: {
        type: String,
        required: [true, "Missing Email."],
        unique: [true, "Email already exists."],
        minlength: [12, "Email too short."],
        maxlength: [50, "Email too long."],
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
            "Invalid email address."
        ]
    },
    phone: {
        type: String,
        required: [true, "Missing phone number."],
        minlength: [9, "Phone number too short."],
        maxlength: [15, "Phone number too long."],
        match: [
            /^05\d{8}$/,
            "Invalid Israeli mobile number."
        ]
    },
    password: {
        type: String,
        required: [true, "Missing password."],
        minlength: [6, "Password too short."],
        maxlength: [1000, "Password too long."]
    },
    role: {
        type: String,
        enum: {
            values: Object.values(UserRole),
            message: "Role must be either 'volunteer' or 'officer'."
        },
        required: [true, "Missing role."]
    },
    serviceNumber: {
        type: String,
        required: [true, "Missing service number."],
        unique: [true, "service number already exists."],
        minlength: [6, "Service number too short."],
        maxlength: [9, "Service number too long."]
    },
    gender: {
        type: String,
        enum: {
            values: Object.values(Gender),
            message: "Gender must be 'male' or 'female'."
        },
        required: [true, "Missing gender."]
    },
    profileImage: {
        type: String // optional image URL or filename
    },

    // Volunteer-specific section (optional for officers)
    volunteerData: {
        volunteerType: {
            type: String,
            enum: {
                values: Object.values(VolunteerType),
                message: "Volunteer type must be 'שלב א' or 'שלב ב'."
            },
            required: function () {
                return this.role === UserRole.Volunteer;
            },
        },
        hasDriverLicense: {
            type: Boolean,
            required: function () {
                return this.role === UserRole.Volunteer;
            },
        },
    },
},
    { timestamps: true } // Automatically add createdAt and updatedAt fields
);

// Export the model
export const UserModel = mongoose.model<IUser>("User", UserSchema);
