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
        this.router.post("/api/register", this.register);
        this.router.post("/api/login", this.login);
        this.router.get("/api/me", securityMiddleware.verifyToken, this.getMe);
        this.router.put("/api/me", securityMiddleware.verifyToken, this.updateMe);
        this.router.delete("/api/me", securityMiddleware.verifyToken, this.deleteMe);
        this.router.put("/api/change-password", securityMiddleware.verifyToken, this.changePassword);
    }

    // Register with image processing
    private async register(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userData = { ...request.body };
            if (userData.volunteerData && typeof userData.volunteerData === "string") {
                userData.volunteerData = JSON.parse(userData.volunteerData);
            }
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const imageName = uuid() + extension;
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", imageName);
                await image.mv(imagePath);
                userData.profileImage = imageName;
            }
            if (userData.password) {
                userData.password = cyber.hash(userData.password);
            }
            const user = new UserModel(userData);
            const token = await userService.register(user);
            response.status(StatusCode.Created).json({ token });
        } catch (err: any) {
            next(err);
        }
    }

    // Login
    private async login(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const { email, password } = request.body;
            const token = await userService.login(email, password);
            response.status(StatusCode.OK).json({ token });
        } catch (err: any) {
            next(err);
        }
    }

    // Get my details via token
    private async getMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findById(userFromToken._id).lean();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found" });
                return;
            }
            delete (user as any).password;
            response.status(StatusCode.OK).json(user);
        } catch (err: any) {
            next(err);
        }
    }

    // Update user
    private async updateMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const updateData = request.body || {};
            let oldImageName: string | undefined;

            // **FIXED:** Parse volunteerData if it's a string from form-data
            if (updateData.volunteerData && typeof updateData.volunteerData === "string") {
                try {
                    updateData.volunteerData = JSON.parse(updateData.volunteerData);
                } catch (err) {
                    const error = new Error("Invalid volunteerData format.");
                    return next(error);
                }
            }

            // Prevent disallowed fields from being updated
            delete updateData.role;
            delete updateData.password;
            delete updateData._id;

            // Find the user document *before* any updates to get the old image name.
            const userBeforeUpdate = await UserModel.findById(userFromToken._id).exec();
            if (!userBeforeUpdate) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            oldImageName = userBeforeUpdate.profileImage;

            // Handle file upload if a new image is provided
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;
                const extension = path.extname(image.name).toLowerCase();
                const newImageName = uuid() + extension;
                const newImagePath = path.join(__dirname, "..", "1-assets", "profile-pics", newImageName);

                await image.mv(newImagePath);
                updateData.profileImage = newImageName;
            }

            const updatedUser = await UserModel.findByIdAndUpdate(userFromToken._id, updateData, { new: true }).lean();

            if (!updatedUser) {
                response.status(StatusCode.NotFound).json({ message: "User not found during update." });
                return;
            }

            // If a new image was uploaded and the update was successful, delete the old one.
            if (request.files?.profileImage && oldImageName) {
                const oldImagePath = path.join(__dirname, "..", "1-assets", "profile-pics", oldImageName);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            delete (updatedUser as any).password;
            response.status(StatusCode.OK).json(updatedUser);

        } catch (err: any) {
            next(err);
        }
    }

    // Delete user
    private async deleteMe(request: Request, response: Response, next: Function): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const user = await UserModel.findByIdAndDelete(userFromToken._id).exec();
            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }
            if (user.profileImage) {
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", user.profileImage);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            }
            response.status(StatusCode.NoContent).send();
        } catch (err: any) {
            next(err);
        }
    }

    // Change password
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
}

export const userController = new UserController();
