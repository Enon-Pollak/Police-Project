import express, { Request, Response, Router } from "express";
import path from "path";
import { v4 as uuid } from "uuid";
import fileUpload from "express-fileupload";
import { UserModel } from "../3-models/user-model";
import { userService } from "../4-services/user-service";
import { StatusCode } from "../3-models/status-code";
import { securityMiddleware } from "../6-middleware/security.middleware";
import { cyber } from "../2-utils/cyber";
import fs from "fs";

// Default profile images (relative to 1-assets/)
const DEFAULT_MALE_IMAGE = "default-profile-pics/male-user-default-pic.webp";
const DEFAULT_FEMALE_IMAGE = "default-profile-pics/female-user-default-pic.webp";

// Returns the default profile image path for a given gender
function getDefaultImageByGender(gender: string): string {
    return gender?.toLowerCase() === "female" ? DEFAULT_FEMALE_IMAGE : DEFAULT_MALE_IMAGE;
}

// Deletes a user-specific profile image from disk if it exists in the profile-pics directory. Shared default images are never deleted.
function safeDeleteProfileImageIfPersonal(relativePath?: string): void {
    if (!relativePath) return;
    if (relativePath.startsWith("profile-pics/")) {
        const absolute = path.join(__dirname, "..", "1-assets", relativePath);
        if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    }
}

class UserController {
    public router: Router = express.Router();

    public constructor() {
        this.router.post("/api/register", this.register);
        this.router.post("/api/login", this.login);
        this.router.get("/api/me", securityMiddleware.verifyToken, this.getMe);
        this.router.put("/api/me", securityMiddleware.verifyToken, this.updateMe);
        this.router.delete("/api/me", securityMiddleware.verifyToken, this.deleteMe);
        this.router.put("/api/change-password", securityMiddleware.verifyToken, this.changePassword);
        this.router.delete("/api/me/profile-image", securityMiddleware.verifyToken, this.removeMyProfileImage);
    }

    // Handles user registration, including validation, image upload, and password hashing
    private async register(request: Request, response: Response, next: Function): Promise<void> {
        let savedImageRel: string | undefined;
        try {
            const userData: any = { ...request.body };

            // Normalize and sanitize input
            if (userData.email) userData.email = String(userData.email).trim().toLowerCase();
            if (userData.fullName) userData.fullName = String(userData.fullName).trim();

            // Parse volunteerData if sent as a string (form-data)
            if (userData.volunteerData && typeof userData.volunteerData === "string") {
                userData.volunteerData = JSON.parse(userData.volunteerData);
            }

            // Validate email
            if (!userData.email) {
                response.status(StatusCode.BadRequest).json({ message: "Email is required." });
                return;
            }
            // Check for duplicate email
            const emailTaken = await UserModel.exists({ email: userData.email });
            if (emailTaken) {
                response.status(StatusCode.Conflict).json({ message: "Email already taken." });
                return;
            }

            // Handle profile image upload if provided
            if ((request as any).files?.profileImage) {
                const image = (request as any).files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const imageName = uuid() + extension;
                const destAbs = path.join(__dirname, "..", "1-assets", "profile-pics", imageName);

                await image.mv(destAbs);
                savedImageRel = "profile-pics/" + imageName;
                userData.profileImage = savedImageRel;
            } else {
                // Assign default image based on gender if no image uploaded
                userData.profileImage = getDefaultImageByGender(userData.gender);
            }

            // Hash password before saving
            if (userData.password) {
                userData.password = cyber.hash(userData.password);
            }

            // Create and save user, return JWT token
            const user = new UserModel(userData);
            const token = await userService.register(user);
            response.status(StatusCode.Created).json({ token });

        } catch (err: any) {
            // Cleanup uploaded image if registration fails
            if (savedImageRel) {
                safeDeleteProfileImageIfPersonal(savedImageRel);
            }
            next(err);
        }
    }

    // Handles user login and returns a JWT token
    private async login(request: Request, response: Response, next: Function): Promise<void> {
        try {
            let { email, password } = request.body;
            if (!email || !password) {
                response.status(StatusCode.BadRequest).json({ message: "Email and password are required." });
                return;
            }
            email = String(email).trim().toLowerCase();
            const token = await userService.login(email, password);
            response.status(StatusCode.OK).json({ token });
        } catch (err: any) {
            next(err);
        }
    }

    // Returns current user details, including a clickable profile image URL
    private async getMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findById(userFromToken._id).lean();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found" });
                return;
            }
            delete (user as any).password;
            const assetsBase = `${request.protocol}://${request.get("host")}/1-assets/`;
            (user as any).profileImageUrl = user.profileImage ? assetsBase + user.profileImage : null;
            response.status(StatusCode.OK).json(user);
        } catch (err: any) {
            next(err);
        }
    }

    // Updates current user info, handles image upload, and deletes old image if replaced
    private async updateMe(request: Request, response: Response, next: Function): Promise<void> {
        let newImageRelForCleanup: string | undefined;
        try {
            const userFromToken = (request as any).user;
            const updateData: any = request.body || {};
            let oldImagePathRelative: string | undefined;

            // Normalize email if present
            if (updateData.email) updateData.email = String(updateData.email).trim().toLowerCase();

            // Parse volunteerData if sent as a string (form-data)
            if (updateData.volunteerData && typeof updateData.volunteerData === "string") {
                try {
                    updateData.volunteerData = JSON.parse(updateData.volunteerData);
                } catch {
                    const error = new Error("Invalid volunteerData format.");
                    return next(error);
                }
            }

            // Prevent role, password, and _id from being updated
            delete updateData.role;
            delete updateData.password;
            delete updateData._id;

            // Get current user to retrieve old image path & gender
            const userBeforeUpdate = await UserModel.findById(userFromToken._id).exec();
            if (!userBeforeUpdate) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            oldImagePathRelative = userBeforeUpdate.profileImage;

            // Handle new profile image upload
            if ((request as any).files?.profileImage) {
                const image = (request as any).files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const newImageName = uuid() + extension;
                const newImagePathAbs = path.join(__dirname, "..", "1-assets", "profile-pics", newImageName);

                await image.mv(newImagePathAbs);
                newImageRelForCleanup = "profile-pics/" + newImageName;
                updateData.profileImage = newImageRelForCleanup;
            } else {
                // If user has no image, assign default based on gender
                const effectiveGender = (updateData.gender ?? userBeforeUpdate.gender) as string;
                if (!oldImagePathRelative || oldImagePathRelative.trim() === "") {
                    updateData.profileImage = getDefaultImageByGender(effectiveGender);
                }
            }

            // Update user in DB
            const updatedUser = await UserModel.findByIdAndUpdate(
                userFromToken._id,
                updateData,
                { new: true }
            ).lean();

            if (!updatedUser) {
                if (newImageRelForCleanup) {
                    safeDeleteProfileImageIfPersonal(newImageRelForCleanup);
                }
                response.status(StatusCode.NotFound).json({ message: "User not found during update." });
                return;
            }

            // Delete old image if a new one was uploaded
            if (newImageRelForCleanup) {
                safeDeleteProfileImageIfPersonal(oldImagePathRelative);
            }

            delete (updatedUser as any).password;
            const assetsBase = `${request.protocol}://${request.get("host")}/1-assets/`;
            (updatedUser as any).profileImageUrl = updatedUser.profileImage ? assetsBase + updatedUser.profileImage : null;
            response.status(StatusCode.OK).json(updatedUser);

        } catch (err: any) {
            if (newImageRelForCleanup) {
                safeDeleteProfileImageIfPersonal(newImageRelForCleanup);
            }
            next(err);
        }
    }

    // Deletes current user and removes personal profile image from disk if it exists
    private async deleteMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findByIdAndDelete(userFromToken._id).exec();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            safeDeleteProfileImageIfPersonal(user.profileImage);
            response.status(StatusCode.NoContent).send();
        } catch (err: any) {
            next(err);
        }
    }

    // Changes user password after verifying the current password
    private async changePassword(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const { currentPassword, newPassword } = request.body;
            const user = await UserModel.findById(userFromToken._id);
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            const currentHashed = cyber.hash(currentPassword);
            if (user.password !== currentHashed) {
                response.status(StatusCode.Unauthorized).json({ message: "Current password is incorrect." });
                return;
            }
            user.password = cyber.hash(newPassword);
            await user.save();
            response.status(StatusCode.OK).json({ message: "Password updated successfully." });
        } catch (err: any) {
            next(err);
        }
    }

    // Removes current user's profile image and reverts to gender-based default
    private async removeMyProfileImage(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findById(userFromToken._id);
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            safeDeleteProfileImageIfPersonal(user.profileImage);
            user.profileImage = getDefaultImageByGender(user.gender);
            await user.save();
            const result = user.toObject();
            delete (result as any).password;
            const assetsBase = `${request.protocol}://${request.get("host")}/1-assets/`;
            (result as any).profileImageUrl = result.profileImage ? assetsBase + result.profileImage : null;
            response.status(StatusCode.OK).json(result);
        } catch (err: any) {
            next(err);
        }
    }
}

export const userController = new UserController();
