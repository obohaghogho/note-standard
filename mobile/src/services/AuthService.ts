import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

export interface User {
    id: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
}

export class AuthService {
    static async setToken(token: string) {
        await AsyncStorage.setItem(TOKEN_KEY, token);
    }

    static async getToken() {
        return await AsyncStorage.getItem(TOKEN_KEY);
    }

    static async setUser(user: User) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    static async getUser(): Promise<User | null> {
        const user = await AsyncStorage.getItem(USER_KEY);
        return user ? JSON.parse(user) : null;
    }

    static async logout() {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
    }

    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }
}
