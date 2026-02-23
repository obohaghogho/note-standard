import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../../lib/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import SecureImage from '../../components/common/SecureImage';
import { supabase, safeCall } from '../../lib/supabaseSafe';
import type { Profile } from '../../types/auth';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { AdManager } from '../../components/ads/AdManager';
import { adService } from '../../services/ads';
import { Toggle } from '../../components/common/Toggle';
import { User, Camera, Save, Loader2, Megaphone, BadgeCheck, Shield, Lock, Download, Trash2, Activity as ActivityIcon, MessageSquare, Globe } from 'lucide-react';

export const Settings = () => {
    const { user, profile: authProfile, isPro } = useAuth();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Check params for tab or payment status
    const initialTab = searchParams.get('tab') === 'ads' || searchParams.get('ad_success') ? 'ads' : (searchParams.get('tab') === 'privacy' ? 'privacy' : 'profile');

    const [activeTab, setActiveTab] = useState<'profile' | 'ads' | 'privacy' | 'chat' | 'security'>(initialTab as any);
    const [preferredChatLanguage, setPreferredChatLanguage] = useState(authProfile?.preferred_language || 'en');
    const [privacySettings, setPrivacySettings] = useState({
        analytics: true,
        offers: false,
        partners: false
    });
    const [profile, setProfile] = useState<Profile | null>(null);
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [loading, setLoading] = useState(!authProfile); // Only load if we don't have profile yet
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Tab Effect
    useEffect(() => {
        if (initialTab === 'ads') {
            setActiveTab('ads');
        }

        // Handle Ad Payment Success
        const adSuccess = searchParams.get('ad_success');
        const sessionId = searchParams.get('session_id');
        const adCanceled = searchParams.get('ad_canceled');

        if (adSuccess && sessionId) {
            toast.promise(
                adService.syncAdPayment(sessionId),
                {
                    loading: 'Verifying payment...',
                    success: 'Payment successful! Your ad is now in review.',
                    error: 'Failed to verify payment.'
                }
            ).then(() => {
                // Clear params
                navigate('/dashboard/settings?tab=ads', { replace: true });
            });
        } else if (adCanceled) {
            toast.error('Payment canceled');
            navigate('/dashboard/settings?tab=ads', { replace: true });
        }
    }, [initialTab, searchParams, navigate]);

    useEffect(() => {
        if (authProfile) {
            setProfile(authProfile);
            setUsername(authProfile.username || '');
            setFullName(authProfile.full_name || '');
            setAvatarUrl(authProfile.avatar_url || '');
            setPreferredChatLanguage(authProfile.preferred_language || 'en');
            setLoading(false);
        }
    }, [authProfile]);



    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB');
            return;
        }

        setUploading(true);

        try {
            // Upload via server endpoint
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_URL}/api/upload/image`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Upload failed');
            }

            const data = await response.json();
            setAvatarUrl(data.url);
            toast.success('Image uploaded! Click Save to apply.');
        } catch (error: any) {
            console.error('Error uploading image:', error);
            toast.error(error.message || 'Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!user) return;

        setSaving(true);
        try {
            // Update profile with safe wrapper
            await safeCall(
                `update-profile-${user.id}`,
                async () => {
                    const { error } = await supabase
                        .from('profiles')
                        .update({
                            username,
                            full_name: fullName,
                            avatar_url: avatarUrl,
                        })
                        .eq('id', user.id);

                    if (error) {
                        // Check for unique constraint violation
                        if (error.code === '23505') {
                            throw new Error('Username already taken. Please choose another.');
                        }
                        throw error;
                    }

                    // Sync with Supabase Auth Session (updates Sidebar immediately)
                    const { error: authError } = await supabase.auth.updateUser({
                        data: {
                            full_name: fullName,
                            avatar_url: avatarUrl,
                            username: username
                        }
                    });

                    if (authError) console.error('Failed to sync auth session:', authError);

                    toast.success('Profile updated successfully!');
                    // Note: AuthContext will pick up the 'USER_UPDATED' event 
                    // or we can rely on the trigger. For immediate UI feedback, 
                    // we've already updated the Auth session above.
                    return true;
                },
                { minDelay: 500 } // FIXED: safeCall 3rd argument is object
            );
        } catch (error: any) {
            console.error('Error updating profile:', error);
            // safeCall already shows generic error toast
        } finally {
            setSaving(false);
        }
    };

    const handleSavePrivacy = async () => {
        setSaving(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        toast.success('Privacy preferences updated');
        setSaving(false);
    };

    const handleSaveChatSettings = async () => {
        if (!user) return;
        
        setSaving(true);
        try {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;
            
            await fetch(`${API_URL}/api/chat/preference`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ language: preferredChatLanguage })
            });
            toast.success('Chat language updated');
            
            // Note: Central AuthContext will eventually refresh this via event 
            // or we can manually trigger a small sync if needed, but the UI 
            // is already showing the locally updated preferredChatLanguage.
        } catch (e) {
            console.error(e);
            toast.error('Failed to update language');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    const initials = (fullName || username || user?.email || 'U')
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

    return (
        <div className="space-y-6 max-w-4xl w-full min-w-0">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-gray-400">Manage your account settings and preferences</p>
            </div>

            <div className="flex items-center gap-4 border-b border-white/5 overflow-x-auto no-scrollbar pb-px -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'profile' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><User size={18} /> Profile</span>
                    {activeTab === 'profile' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('ads')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'ads' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><Megaphone size={18} /> Advertisements</span>
                    {activeTab === 'ads' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('privacy')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'privacy' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><Shield size={18} /> Privacy & Data</span>
                    {activeTab === 'privacy' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'chat' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><MessageSquare size={18} /> Chat & Language</span>
                    {activeTab === 'chat' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab('security')}
                    className={`pb-3 px-1 relative flex-shrink-0 ${activeTab === 'security' ? 'text-primary font-medium' : 'text-gray-400 hover:text-white'}`}
                >
                    <span className="flex items-center gap-2 whitespace-nowrap"><Shield size={18} /> Security</span>
                    {activeTab === 'security' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
                </button>
            </div>


            {
                activeTab === 'privacy' && (
                    <div className="space-y-6">
                        {/* Privacy Controls */}
                        <Card variant="glass" className="p-4 sm:p-6 min-w-0">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <Lock className="text-primary" size={20} />
                                Data Controls
                            </h2>
                            <div className="space-y-6">
                                <Toggle
                                    label="Anonymous Usage Analytics"
                                    description="Help us improve by sharing non-personal, aggregated usage data (e.g., app performance, feature usage). No content is ever shared."
                                    checked={privacySettings.analytics}
                                    onChange={(c) => setPrivacySettings(prev => ({ ...prev, analytics: c }))}
                                />
                                <div className="h-px bg-white/5" />
                                <Toggle
                                    label="Contextual Offers"
                                    description="Allow occasional relevant offers based on your note tags (e.g., showing a coding tool deal if you take coding notes). No behavioral tracking."
                                    checked={privacySettings.offers}
                                    onChange={(c) => setPrivacySettings(prev => ({ ...prev, offers: c }))}
                                />
                                <div className="h-px bg-white/5" />
                                <Toggle
                                    label="Partner Recommendations"
                                    description="See curated tools from our trusted partners that integrate with your workflow."
                                    checked={privacySettings.partners}
                                    onChange={(c) => setPrivacySettings(prev => ({ ...prev, partners: c }))}
                                />
                            </div>
                            <div className="mt-6 pt-4 border-t border-white/10 flex justify-end flex-wrap">
                                <Button onClick={handleSavePrivacy} loading={saving} disabled={!user} className="w-full sm:w-auto">
                                    <Save size={16} className="mr-2" />
                                    Save Preferences
                                </Button>
                            </div>
                        </Card>

                        {/* Transparency Report */}
                        <Card variant="glass" className="p-4 sm:p-6 border border-white/5 bg-white/5 min-w-0">
                            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <ActivityIcon className="text-blue-400" size={20} />
                                    Data Transparency Report
                                </h2>
                                <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">Live</span>
                            </div>
                            <p className="text-sm text-gray-400 mb-6">
                                We believe in radical transparency. Here is exactly what data is currently being processed associated with your account.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-lg bg-black/20 border border-white/5">
                                    <div className="text-xs text-gray-500 mb-1">Account Identity</div>
                                    <div className="font-mono text-sm text-green-400 flex items-center gap-2">
                                        <BadgeCheck size={14} /> Verified ID
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-black/20 border border-white/5">
                                    <div className="text-xs text-gray-500 mb-1">Last Data Sync</div>
                                    <div className="font-mono text-sm text-white">
                                        {new Date().toLocaleTimeString()}
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-black/20 border border-white/5">
                                    <div className="text-xs text-gray-500 mb-1">Encryption Status</div>
                                    <div className="font-mono text-sm text-purple-400 flex items-center gap-2">
                                        <Lock size={12} /> AES-256
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Dangerous Actions */}
                        <Card className="p-4 sm:p-6 border border-red-500/20 bg-red-500/5 min-w-0">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-red-400">
                                <Shield className="text-red-400" size={20} />
                                Your Data Rights
                            </h2>
                            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center flex-wrap">
                                <div className="flex-1">
                                    <h4 className="font-medium text-white">Export Your Data</h4>
                                    <p className="text-sm text-gray-400">Download a complete copy of your notes and profile information in JSON format.</p>
                                </div>
                                <Button variant="secondary" className="w-full sm:w-auto gap-2 border-white/10 hover:bg-white/10 flex-shrink-0">
                                    <Download size={16} /> Download JSON
                                </Button>
                            </div>
                            <div className="my-6 h-px bg-red-500/10" />
                            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center flex-wrap">
                                <div className="flex-1">
                                    <h4 className="font-medium text-red-400">Delete Account</h4>
                                    <p className="text-sm text-gray-400">Permanently remove your account and all associated data. This action cannot be undone.</p>
                                </div>
                                <Button className="w-full sm:w-auto gap-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border-red-500/50 flex-shrink-0">
                                    <Trash2 size={16} /> Delete Account
                                </Button>
                            </div>
                        </Card>
                    </div>
                )
            }

            {
                activeTab === 'profile' && (
                    <Card variant="glass" className="p-4 sm:p-6 min-w-0">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <User className="text-primary" size={20} />
                            Profile Information
                        </h2>

                        <div className="space-y-6">
                            {/* Avatar Section */}
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left flex-wrap">
                                <div className="relative">
                                    {avatarUrl ? (
                                        <SecureImage
                                            src={avatarUrl}
                                            alt="Profile"
                                            className="w-24 h-24 rounded-full object-cover border-2 border-primary/30"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white">
                                            {initials}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="absolute bottom-0 right-0 p-2 bg-primary rounded-full text-white hover:bg-primary/80 transition-colors disabled:opacity-50"
                                    >
                                        {uploading ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Camera size={16} />
                                        )}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </div>
                                <div className="flex-1 min-w-0 break-words">
                                    <h3 className="font-medium text-white flex items-center gap-2">
                                        Profile Picture
                                        {isPro && <BadgeCheck size={16} className="text-blue-400 fill-blue-400/10" />}
                                    </h3>
                                    <p className="text-sm text-gray-400 mb-2">
                                        Click the camera icon to upload a new photo
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Recommended: Square image, at least 200x200px
                                    </p>
                                </div>
                            </div>

                            {/* Username */}
                            <div>
                                <Input
                                    id="username"
                                    name="username"
                                    label="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter your username"
                                    className="bg-white/5"
                                    autoComplete="username"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This is how other users will find you
                                </p>
                            </div>

                            {/* Full Name */}
                            <div>
                                <Input
                                    id="fullName"
                                    name="fullName"
                                    label="Full Name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Enter your full name"
                                    className="bg-white/5"
                                    autoComplete="name"
                                />
                            </div>

                            {/* Email (read-only) */}
                            <div>
                                <Input
                                    id="email"
                                    name="email"
                                    label="Email"
                                    value={profile?.email || user?.email || ''}
                                    disabled
                                    className="bg-white/5 opacity-60 cursor-not-allowed"
                                    autoComplete="email"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Email cannot be changed
                                </p>
                            </div>

                            {/* Save Button */}
                            <div className="pt-4 border-t border-white/10">
                                <Button onClick={handleSave} loading={saving} className="w-full sm:w-auto gap-2">
                                    <Save size={16} />
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    </Card>
                )
            }

            {
                activeTab === 'ads' && (
                    <AdManager />
                )
            }

            {
                activeTab === 'chat' && (
                    <Card variant="glass" className="p-4 sm:p-6 min-w-0">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Globe className="text-primary" size={20} />
                            Chat Translation
                        </h2>
                        <p className="text-gray-400 mb-6">
                            Automatically translate incoming messages in other languages to your preferred language.
                        </p>

                        <div className="max-w-md space-y-4">
                            <label htmlFor="chatLanguage" className="block text-sm font-medium text-gray-300 cursor-pointer">
                                Translate all incoming messages to:
                            </label>
                            <select
                                id="chatLanguage"
                                name="chatLanguage"
                                value={preferredChatLanguage}
                                onChange={(e) => setPreferredChatLanguage(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary"
                            >
                                <option value="en">English (English)</option>
                                <option value="es">Spanish (Español)</option>
                                <option value="fr">French (Français)</option>
                                <option value="zh">Chinese (中文)</option>
                                <option value="de">German (Deutsch)</option>
                                <option value="it">Italian (Italiano)</option>
                                <option value="pt">Portuguese (Português)</option>
                                <option value="ja">Japanese (日本語)</option>
                                <option value="ko">Korean (한국어)</option>
                                <option value="ru">Russian (Русский)</option>
                            </select>

                            <div className="pt-4">
                                <Button onClick={handleSaveChatSettings} loading={saving} className="w-full sm:w-auto">
                                    <Save size={16} className="mr-2" />
                                    Save Language
                                </Button>
                            </div>
                        </div>
                    </Card>
                )
            }

            {
                activeTab === 'security' && (
                    <Card variant="glass" className="p-4 sm:p-6 min-w-0">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Shield className="text-primary" size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold">Security Settings</h2>
                                <p className="text-sm text-gray-400">Manage your account security and password</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                                    <Lock size={18} className="text-primary" />
                                    Change Password
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    For your security, we use email-based password resets. Click the button below to receive a secure link to update your password at <span className="text-white font-medium">{user?.email}</span>.
                                </p>

                                <Button 
                                    onClick={async () => {
                                        if (!user?.email) return;
                                        setSaving(true);
                                        try {
                                            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                                redirectTo: `${window.location.origin}/reset-password`,
                                            });
                                            if (error) throw error;
                                            toast.success('Check your email for the reset link!');
                                        } catch (err: any) {
                                            toast.error(err.message || 'Failed to send reset email');
                                        } finally {
                                            setSaving(false);
                                        }
                                    }} 
                                    loading={saving}
                                    variant="outline"
                                    className="w-full sm:w-auto"
                                >
                                    <Globe size={16} className="mr-2" />
                                    Send Password Reset Email
                                </Button>
                            </div>

                            <div className="p-4 rounded-xl border border-white/10 bg-white/5 opacity-60">
                                <h3 className="text-lg font-medium mb-1">Authenticated Email</h3>
                                <p className="text-sm text-gray-400">{user?.email}</p>
                            </div>
                        </div>
                    </Card>
                )
            }
        </div>
    );
};
