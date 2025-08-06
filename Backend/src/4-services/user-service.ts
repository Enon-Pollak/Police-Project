import { Request, Response } from "express";
import path from "path";
import { v4 as uuid } from "uuid";
import fileUpload from "express-fileupload";

import { StatusCode } from "../3-models/status-code";
import { IUser, UserModel } from "../3-models/user-model";
import { AuthorizationError, ValidationError } from "../3-models/client-errors";
import { cyber } from "../2-utils/cyber";




class UserService {
    // Register a new user:
    public async register(user: IUser): Promise<string> {
    // Check for duplicate email
    const exists = await UserModel.countDocuments({ email: user.email }).exec();
    if (exists) throw new ValidationError("Email already taken.");

    // Save to DB
    const dbUser = await new UserModel(user).save();

    // Generate and return token
    return cyber.generateToken(dbUser);
}


    public async login(email: string, password: string): Promise<string> {
        // Find user by email
        const user = await UserModel.findOne({ email }).exec();
        if (!user) throw new AuthorizationError("Incorrect email or password.");

        // Hash the given password and compare to stored hash
        const hashedPassword = cyber.hash(password);
        if (user.password !== hashedPassword) throw new AuthorizationError("Incorrect email or password.");

        // Generate and return JWT token
        const token = cyber.generateToken(user);
        return token;
    }
}

export const userService = new UserService();
