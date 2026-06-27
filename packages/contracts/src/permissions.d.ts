export declare const MEMBER_PERMISSIONS: {
    readonly identityRead: "identity.read";
    readonly identityWrite: "identity.write";
    readonly membersRead: "members.read";
    readonly membersWrite: "members.write";
    readonly rolesRead: "roles.read";
    readonly rolesWrite: "roles.write";
    readonly customersRead: "customers.read";
    readonly customersWrite: "customers.write";
    readonly settingsRead: "settings.read";
    readonly settingsWrite: "settings.write";
    readonly taskAssign: "task.assign";
    readonly aircallUsersRead: "aircall.users.read";
    readonly aircallUsersWrite: "aircall.users.write";
};
export declare const CUSTOMER_PERMISSIONS: {
    readonly accountRead: "account.read";
    readonly accountWrite: "account.write";
    readonly subUsersRead: "subusers.read";
    readonly subUsersWrite: "subusers.write";
    readonly ordersRead: "orders.read";
    readonly ordersCreate: "orders.create";
    readonly spendingLimitsWrite: "spending_limits.write";
};
export type MemberPermission = (typeof MEMBER_PERMISSIONS)[keyof typeof MEMBER_PERMISSIONS];
export type CustomerPermission = (typeof CUSTOMER_PERMISSIONS)[keyof typeof CUSTOMER_PERMISSIONS];
export type Permission = MemberPermission | CustomerPermission;
export declare const DEFAULT_MEMBER_ROLES: readonly [{
    readonly slug: "owner";
    readonly name: "Owner";
    readonly description: "Full workspace administration";
    readonly permissions: {
        [k: string]: boolean;
    };
}, {
    readonly slug: "admin";
    readonly name: "Admin";
    readonly description: "Manage daily operations without tenant ownership controls";
    readonly permissions: {
        readonly "identity.read": true;
        readonly "members.read": true;
        readonly "members.write": true;
        readonly "roles.read": true;
        readonly "customers.read": true;
        readonly "customers.write": true;
        readonly "settings.read": true;
        readonly "task.assign": true;
        readonly "aircall.users.read": true;
        readonly "aircall.users.write": true;
    };
}, {
    readonly slug: "agent";
    readonly name: "Agent";
    readonly description: "Personnel workspace access";
    readonly permissions: {
        readonly "identity.read": true;
        readonly "customers.read": true;
        readonly "task.assign": true;
        readonly "aircall.users.read": true;
    };
}];
export declare const DEFAULT_CUSTOMER_ROLES: readonly [{
    readonly slug: "b2b_admin";
    readonly name: "B2B Admin";
    readonly description: "Manage company users and account settings";
    readonly permissions: {
        [k: string]: boolean;
    };
}, {
    readonly slug: "b2b_user";
    readonly name: "B2B User";
    readonly description: "Place and review orders within assigned spending limits";
    readonly permissions: {
        readonly "account.read": true;
        readonly "account.write": true;
        readonly "orders.read": true;
        readonly "orders.create": true;
    };
}];
