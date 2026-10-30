class ApiClient {
    private platform: string;
    private organization: string;
    private company: string;
    private app: string;
    private API_BASE_URL: string;
    private ACCESS_TOKEN_KEY = 'accessToken';
    private REFRESH_TOKEN_KEY = 'refreshToken';

    constructor(version: string, platform: string, organization: string, company: string, app: string, urlDomain: string = "https://core-api-lajo.onrender.com") {
        this.platform = platform;
        this.organization = organization;
        this.company = company;
        this.app = app;
        this.API_BASE_URL = `${urlDomain}/api/${version}`;
    }

    // ===== Token Helpers =====
    private saveTokens(accessToken: string, refreshToken?: string) {
        localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
        if (refreshToken) localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }

    private getAccessToken() {
        return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    }

    private getRefreshToken() {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    }

    private clearTokens() {
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    }

    // ===== Core Fetch Helpers =====
    private async nonAuthFetch(url: string, options?: RequestInit) {
        //alert(`${this.API_BASE_URL}${url}`);
        const res = await fetch(`${this.API_BASE_URL}${url}`, options);
        //alert(JSON.stringify(res));
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
    }

    private async authFetch(url: string, options?: RequestInit) {
        console.log('Fetching:', `${this.API_BASE_URL}${url}`); 
        let token = this.getAccessToken();

        const doFetch = async (accessToken: string) =>
            fetch(`${this.API_BASE_URL}${url}`, {
                ...options,
                headers: {
                    ...(options?.headers || {}),
                    Authorization: `Bearer ${accessToken}`,
                },
            });

        let res = await doFetch(token!);
        
        if (res.status === 401) {
            token = await this.refreshToken();
            res = await doFetch(token);
        }

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
    }

    //
    //
    // Auth Endpoints
    //
    //
    async signup(id: string, password: string, link?: any, data?: any) {
        //alert(JSON.stringify(data));
        return this.nonAuthFetch('/auths/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password, link, data }),
        });
    }

    async login(id: string, password: string) {
        const res = await this.nonAuthFetch('/auths/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password }),
        });
        if (res.success) {
            const { accessToken, refreshToken } = res.data;
            this.saveTokens(accessToken, refreshToken);
        }
        return res;
    }

    async recover(userId: string, newPassword: string) {
        return this.nonAuthFetch('/auths/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newPassword }),
        });
    }

    async refreshToken(): Promise<string> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token available');

        const res = await fetch(`${this.API_BASE_URL}/auths/refresh-token`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${refreshToken}` },
        });

        if (!res.ok) {
            this.clearTokens();
            throw new Error('Failed to refresh token');
        }

        const data = await res.json();
        const { accessToken } = data.data;
        this.saveTokens(accessToken);
        return accessToken;
    }

    async mfa(enable: boolean) {
        return await this.authFetch('/auths/mfa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable }),
        });
    }

    /*
    async sessions() {}
    */

    //
    //
    // User Endpoints
    //
    //
    async getUsers() {
        return await this.authFetch('/users');
    }

    async getUser(userId: string) {
        return await this.authFetch(`/users/${encodeURIComponent(userId)}`);
    }

    async createUser(payload: any) {
        return await this.authFetch('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }

    async updateUser(userId: string, userLink: Map<string, string>, userData: Map<string, any>) {
        const res = await this.authFetch(`/users/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({userLink, userData}),
        });
        const { accessToken, refreshToken } = res;
        this.saveTokens(accessToken, refreshToken);
        return res;
    }

    async deleteUser(userId: string) {
        return await this.authFetch(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    }

    async updatePassword(userId: string, newPassword: string) {
        return await this.authFetch(`/users/${encodeURIComponent(userId)}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword }),
        });
    }

    async updateStatus(userId: string, status: string) {
        return await this.authFetch(`/users/${encodeURIComponent(userId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
    }

    //
    //
    // Role Endpoints
    //
    //
    async getRoles() {
        return await this.authFetch('/roles');
    }

    async getRole(roleId: string) {
        return await this.authFetch(`/roles/${roleId}`);
    }

    async patchRole(roleId: string, newRoleId: string) {
        return await this.authFetch(`/roles/${roleId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: newRoleId }),
        });
    }

    async deleteRole(roleId: string) {
        return await this.authFetch(`/roles/${roleId}`, { method: 'DELETE' });
    }

    async createRole(roleId: string) {
        return await this.authFetch('/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({roleId}),
        });
    }

    async addMemberToRole(roleId: string, userId: string) {
        return await this.authFetch(`/roles/${roleId}/members/${userId}`, { method: 'POST' });
    }

    async removeMemberFromRole(roleId: string, userId: string) {
        return await this.authFetch(`/roles/${roleId}/members/${userId}`, { method: 'DELETE' });
    }

    async transferOwner(roleId: string, newOwner: String) {
        return await this.authFetch(`/roles/${roleId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newOwner }),
        });
    }

    async updatePermission(roleId: string, update: "push" | "pop", allowedToPushUser: string[], allowedToPopUser: string[]) {
        return await this.authFetch(`/roles/${roleId}/permissions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ update, allowedToPushUser, allowedToPopUser }),
        });
    }

    //
    //
    // Storage Endpoints
    //
    //
    async getStorageItems(id: string, path: string) {
        const res = await this.authFetch(`/storages/${id}/${this.platform}/${this.organization}/${this.company}/${this.app}/${path}`);
        return res?.[this.platform]?.[this.organization]?.[this.company]?.[this.app];
    }

    postStorageItems(id: string, path: string, value: any) {
        return this.authFetch(`/storages/${id}/${this.platform}/${this.organization}/${this.company}/${this.app}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
    }

    patchStorageItems(id: string, path: string, value: any) {
        return this.authFetch(`/storages/${id}/${this.platform}/${this.organization}/${this.company}/${this.app}/${path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
    }

    putStorageItems(id: string, path: string, value: any) {
        return this.authFetch(`/storages/${id}/${this.platform}/${this.organization}/${this.company}/${this.app}/${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
    }

    deleteStorageItems(id: string, path: string) {
        return this.authFetch(`/storages/${id}/${this.platform}/${this.organization}/${this.company}/${this.app}/${path}`, { method: 'DELETE' });
    }

    //
    //
    // Process Endpoints
    //
    //
    generateText(message: string, context?: string) {
        return this.authFetch('/processes/generatives/texts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, context }),
        });
    }

    generateJson(payload: Map<string, string>) {
        return this.authFetch('/processes/generatives/jsons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
}

const coreApi = new ApiClient("v1", "platform-", "organization-", "company-", "app-", "https://core-api-lajo.onrender.com");
export default coreApi;