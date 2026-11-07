export interface AdminUser {
	id: number;
	username: string;
	email: string;
	fullName: string;
	role: string;
	status: string;
	createdAt: Date;
}

export interface BorrowingStatistics {
	totalBorrowings: number;
	currentlyBorrowed: number;
	returned: number;
	overdue: number;
}

export interface IAdminRepository {
	findAllUsers(): Promise<AdminUser[]>;
	findUserById(userId: number): Promise<AdminUser | null>;
	updateUserStatus(userId: number, status: string): Promise<AdminUser | null>;
	deleteUser(userId: number): Promise<boolean>;
	getBorrowingStatistics(): Promise<BorrowingStatistics>;
}
