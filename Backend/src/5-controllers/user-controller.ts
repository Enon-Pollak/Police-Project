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
    private async register(request: Request, response: Response): Promise<void> {
        try {
            const userData = { ...request.body };

            // Parse volunteerData if it's a string (form-data)
            if (userData.volunteerData && typeof userData.volunteerData === "string") {
                try {
                    userData.volunteerData = JSON.parse(userData.volunteerData);
                } catch {
                    response.status(StatusCode.BadRequest).json({ message: "Invalid volunteerData format." });
                    return;
                }
            }

            // Handle profile image if sent
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;

                const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
                const extension = image.name.substring(image.name.lastIndexOf(".")).toLowerCase();

                if (!allowedExtensions.includes(extension)) {
                    response.status(StatusCode.BadRequest).json({ message: "Invalid image format." });
                    return;
                }

                const imageName = uuid() + extension;
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", imageName);
                await image.mv(imagePath);

                userData.profileImage = imageName;
            }

            // Hash password
            if (userData.password) {
                userData.password = cyber.hash(userData.password);
            }

            // Save user and get token
            const user = new UserModel(userData);
            const token = await userService.register(user);

            response.status(StatusCode.Created).json({ token });

        } catch (err: any) {
            response.status(StatusCode.InternalServerError).json({ message: err.message });
        }
    }

    // Login
    private async login(request: Request, response: Response): Promise<void> {
        try {
            const { email, password } = request.body;
            const token = await userService.login(email, password);
            response.status(StatusCode.OK).json({ token });
        } catch (err: any) {
            response.status(StatusCode.Unauthorized).json({ message: err.message });
            console.log("test");
            
        }
    }

    // Get my details via token
    private async getMe(request: Request, response: Response): Promise<void> {
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
            response.status(StatusCode.InternalServerError).json({ message: err.message });
        }
    }
    
    

    // Update user

    private async updateMe(request: Request, response: Response): Promise<void> {
        try {
            const userFromToken = (request as any).user;

            // Debug logs to see what's coming through
            console.log("request.body:", request.body);
            console.log("request.files:", request.files);
            console.log("Content-Type:", request.headers['content-type']);
            console.log("All request data keys:", Object.keys(request));

            const userData = { ...request.body };

            console.log("Original userData:", userData); // Debug log

            // Parse volunteerData if it's a string (form-data)
            if (userData.volunteerData && typeof userData.volunteerData === "string") {
                try {
                    userData.volunteerData = JSON.parse(userData.volunteerData);
                } catch {
                    response.status(StatusCode.BadRequest).json({ message: "Invalid volunteerData format." });
                    return;
                }
            }

            // Find the current user to get existing data
            const existingUser = await UserModel.findById(userFromToken._id).exec();
            if (!existingUser) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }

            let oldImageName = existingUser.profileImage;

            // Handle profile image if sent
            if (request.files?.profileImage) {
                const image = request.files.profileImage as fileUpload.UploadedFile;

                const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
                const extension = image.name.substring(image.name.lastIndexOf(".")).toLowerCase();

                if (!allowedExtensions.includes(extension)) {
                    response.status(StatusCode.BadRequest).json({ message: "Invalid image format." });
                    return;
                }

                // Generate new image name and save new image
                const imageName = uuid() + extension;
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", imageName);
                await image.mv(imagePath);

                userData.profileImage = imageName;

                // Delete old image from disk if it exists
                if (oldImageName) {
                    const oldImagePath = path.join(__dirname, "..", "1-assets", "profile-pics", oldImageName);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            }

            // Hash password if provided
            if (userData.password) {
                userData.password = cyber.hash(userData.password);
            }

            // Remove fields that shouldn't be updated directly
            delete userData._id;
            delete userData.createdAt;
            delete userData.updatedAt;

            console.log("Processed userData:", userData); // Debug log

            // Only proceed if there are fields to update
            if (Object.keys(userData).length === 0) {
                response.status(StatusCode.BadRequest).json({ message: "No valid fields to update." });
                return;
            }

            // Update user in database using findByIdAndUpdate with proper options
            const updatedUser = await UserModel.findByIdAndUpdate(
                userFromToken._id,
                userData,
                {
                    new: true,
                    runValidators: true,
                    lean: false // Get mongoose document, not plain object
                }
            ).exec();

            if (!updatedUser) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }

            // Convert to plain object and remove password
            const userObject = updatedUser.toObject() as any;
            delete userObject.password;

            console.log("Final userObject:", userObject); // Debug log

            response.status(StatusCode.OK).json(userObject);

        } catch (err: any) {
            console.error("Update error:", err); // Debug log

            // Handle validation errors
            if (err.name === 'ValidationError') {
                const validationErrors = Object.values(err.errors).map((error: any) => error.message);
                response.status(StatusCode.BadRequest).json({ message: validationErrors.join(', ') });
                return;
            }

            // Handle duplicate key errors (email or serviceNumber)
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern)[0];
                response.status(StatusCode.BadRequest).json({ message: `${field} already exists.` });
                return;
            }

            response.status(StatusCode.InternalServerError).json({ message: err.message });
        }
    }

    // Delete user
    private async deleteMe(request: Request, response: Response): Promise<void> {
        try {
            const userFromToken = (request as any).user;

            // Step 1: Find the user to get the image name before deleting
            const user = await UserModel.findById(userFromToken._id).exec();

            if (!user) {
                response.status(StatusCode.NotFound).json({ message: "User not found." });
                return;
            }

            // Step 2: Delete the user
            await UserModel.findByIdAndDelete(userFromToken._id);

            // Step 3: Delete the user's profile image from disk (if exists)
            if (user.profileImage) {
                const imagePath = path.join(__dirname, "..", "1-assets", "profile-pics", user.profileImage);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }

            // Step 4: Return success
            response.status(StatusCode.NoContent).send();

        } catch (err: any) {
            response.status(StatusCode.InternalServerError).json({ message: err.message });
        }
    }

    // Change password
    private async changePassword(request: Request, response: Response): Promise<void> {
        try {
            const userFromToken = (request as any).user;
            const { currentPassword, newPassword } = request.body;

            if (!currentPassword || !newPassword) {
                response.status(StatusCode.BadRequest).json({ message: "Current and new passwords are required." });
                return;
            }

            if (newPassword.length < 6 || newPassword.length > 100) {
                response.status(StatusCode.BadRequest).json({ message: "Password must be between 6–100 characters." });
                return;
            }

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
            response.status(StatusCode.InternalServerError).json({ message: err.message });
        }
    }
}

export const userController = new UserController();
