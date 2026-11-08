export class AppError extends Error {
    constructor(
        success: boolean,
        public error: {
            code: string;
            message: string;
            details?: Record<string, any>;
        }
    ) {
        super(error.message);
        this.name = "AppError"; 
    }
}


export class UnauthorizedError extends AppError {
    constructor(message: string = "Unauthorized access") {
        super(false, { code: "UNAUTHORIZED", message });
        this.name = "UnauthorizedError";
    }

}