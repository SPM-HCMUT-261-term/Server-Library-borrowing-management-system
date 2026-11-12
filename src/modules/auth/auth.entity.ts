export class AuthUserEntity {
    constructor(
        public _id: string,
        public accountId: string,
        public fullName: string,
        public password_hash: string,
        public initials: string,
        public role: string,
        public status: string,
        public yearGroup: string | null,
        public activeLoansCount: number,
        public maxLoansLimit: number
    ) {}
}

export class AuthUserWithStatsEntity {
  constructor(
    public _id: string,
    public accountId: string,
    public fullName: string,
    public initials: string,
    public role: string,
    public status: string,
    public yearGroup: string | null,
    public activeLoansCount: number,
    public maxLoansLimit: number,
    public overdueLoansCount: number,
    public unpaidFines: number,
    public hasBorrowingHistory: boolean,
    public createdAt: string,
    public updatedAt: string
  ) {}
}
