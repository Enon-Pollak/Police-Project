import { StatusCode } from "./status-code";
import { Document, ObjectId } from "mongoose";

abstract class ClientError {
    public status: StatusCode;
    public message: string;
    public constructor(status: StatusCode, message: string) {
        this.status = status;
        this.message = message;
    }
}

export class RouteNotFound extends ClientError {
    public constructor(method: string, route: string) {
        super(StatusCode.NotFound, `Route ${route} on method ${method} not found.`);
    }
}

export class ResourceNotFound extends ClientError {
    public constructor(_id: string | ObjectId) {
        super(StatusCode.NotFound, `_id ${_id} not found.`);
    }
}

export class ValidationError extends ClientError {
    public constructor(message: string) {
        super(StatusCode.BadRequest, message);
    }

    public static validate(document: Document): void {
        const error = document.validateSync();
        if (error) throw new ValidationError(error.message);
    }

}

// We do not know who the user is: 
export class AuthorizationError extends ClientError {
    public constructor(message: string) {
        super(StatusCode.Unauthorized, message);
    }
}

// We do know who the user is: 
export class ForbiddenError extends ClientError {
    public constructor(message: string) {
        super(StatusCode.Forbidden, message);
    }
}
