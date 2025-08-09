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

class UserController {
    public router: Router = express.Router();

    public constructor() {
        // Route for user registration
        this.router.post("/api/register", this.register);
        // Route for user login
        this.router.post("/api/login", this.login);
        // Route to get current user info (requires authentication)
        this.router.get("/api/me", securityMiddleware.verifyToken, this.getMe);
        // Route to update current user info (requires authentication)
        this.router.put("/api/me", securityMiddleware.verifyToken, this.updateMe);
        // Route to delete current user (requires authentication)
        this.router.delete("/api/me", securityMiddleware.verifyToken, this.deleteMe);
        // Route to change password (requires authentication)
        this.router.put("/api/change-password", securityMiddleware.verifyToken, this.changePassword);
    }

    // Register a new user, handle image upload and password hashing
    private async register(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userData = { ...request.body };

            // Parse volunteerData if sent as a string (form-data)
            if (userData.volunteerData && typeof userData.volunteerData === "string") {
                userData.volunteerData = JSON.parse(userData.volunteerData);
            }

            // Handle profile image upload if provided
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const imageName = uuid() + extension;
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", imageName);
                await image.mv(imagePath);
                userData.profileImage = imageName;
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
            next(err);
        }
    }

    // Login user and return JWT token
    private async login(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const { email, password } = request.body;
            const token = await userService.login(email, password);
            response.status(StatusCode.OK).json({ token });
        } catch (err: any) {
            next(err);
        }
    }

    // Get current user details using token
    private async getMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findById(userFromToken._id).lean();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found" });
                return;
            }
            // Remove password before sending user data
            delete (user as any).password;
            response.status(StatusCode.OK).json(user);
        } catch (err: any) {
            next(err);
        }
    }

    // Update current user info, handle image upload and old image deletion
    private async updateMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const updateData = request.body || {};
            let oldImageName: string | undefined;

            // Parse volunteerData if sent as a string (form-data)
            if (updateData.volunteerData && typeof updateData.volunteerData === "string") {
                try {
                    updateData.volunteerData = JSON.parse(updateData.volunteerData);
                } catch (err) {
                    const error = new Error("Invalid volunteerData format.");
                    return next(error);
                }
            }

            // Prevent role, password, and _id from being updated
            delete updateData.role;
            delete updateData.password;
            delete updateData._id;

            // Get current user to retrieve old image name
            const userBeforeUpdate = await UserModel.findById(userFromToken._id).exec();
            if (!userBeforeUpdate) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            oldImageName = userBeforeUpdate.profileImage;

            // Handle new profile image upload
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const newImageName = uuid() + extension;
                const newImagePath = path.join(__dirname, "..", "1-assets", "profile-pics", newImageName);

                await image.mv(newImagePath);
                updateData.profileImage = newImageName;
            }

            // Update user in database
            const updatedUser = await UserModel.findByIdAndUpdate(userFromToken._id, updateData, { new: true }).lean();

            if (!updatedUser) {
                response.status(StatusCode.NotFound).json({ message: "User not found during update." });
                return;
            }

            // Delete old image from disk if a new one was uploaded
            if (request.files?.profileImage && oldImageName) {
                const oldImagePath = path.join(__dirname, "..", "1-assets", "profile-pics", oldImageName);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            // Remove password before sending updated user data
            delete (updatedUser as any).password;
            response.status(StatusCode.OK).json(updatedUser);

        } catch (err: any) {
            next(err);
        }
    }

    // Delete current user and remove profile image from disk if exists
    private async deleteMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findByIdAndDelete(userFromToken._id).exec();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            // Delete profile image from disk if exists
            if (user.profileImage) {
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", user.profileImage);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }
            response.status(StatusCode.NoContent).send();
        } catch (err: any) {
            next(err);
        }
    }

    // Change user password after verifying current password
    private async changePassword(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const { currentPassword, newPassword } = request.body;
            const user = await UserModel.findById(userFromToken._id);
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            // Verify current password
            const currentHashed = cyber.hash(currentPassword);
            if (user.password !== currentHashed) {
                response.status(StatusCode.Unauthorized).json({ message: "Current password is incorrect." });
                return;
            }
            // Set new password and save
            user.password = cyber.hash(newPassword);
            await user.save();
            response.status(StatusCode.OK).json({ message: "Password updated successfully." });
        } catch (err: any) {
            next(err);
        }
    }
}

export const userController = new UserController();
