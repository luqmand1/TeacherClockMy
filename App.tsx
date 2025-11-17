
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { User, Role, Announcement, AttendanceRecord, ActiveTab, Priority } from './types';
import { USERS, INITIAL_ANNOUNCEMENTS, INITIAL_ATTENDANCE_RECORDS } from './constants';
import { Clock, Users, Calendar, Bell, TrendingUp, Award, CheckCircle, LogOut, Menu, X, User as UserIcon, Settings, BarChart3, MessageSquare, Home, AlertCircle, MapPin, Key, Moon, Sun, Flame, Target, UserCheck, UserX, FileDown, Search, PlusCircle, Camera, ScanFace, RotateCw, ArrowLeft, ImageUp, Eye, EyeOff, ShieldCheck, Fingerprint } from 'lucide-react';

declare const faceapi: any;

// #region Helper Functions
const getGreeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.readAsDataURL(blob);
    });
};

// Accurate coordinates for SMK Puchong Utama (1) based on user feedback
const SCHOOL_COORDINATES = { latitude: 2.9839351, longitude: 101.6105881 };
const MAX_DISTANCE_METERS = 100; // Increased distance to 100m as requested
// #endregion

// #region Components

const RegistrationScreen: React.FC<{ onRegister: (user: Omit<User, 'id' | 'role'>) => boolean; onSwitchToLogin: () => void; areModelsLoaded: boolean; }> = ({ onRegister, onSwitchToLogin, areModelsLoaded }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        department: '',
        username: '',
        password: '',
        confirmPassword: '',
        faceImageUrl: '',
        faceDescriptor: undefined as number[] | undefined,
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Camera state and refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isCameraLive, setIsCameraLive] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [cameraError, setCameraError] = useState('');

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setIsCameraLive(false);
        }
    }, []);

    const startCamera = useCallback(async () => {
        if (streamRef.current || imagePreview) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraLive(true);
                setCameraError('');
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            setCameraError('Camera access denied. Please enable it or upload a file.');
            setIsCameraLive(false);
        }
    }, [imagePreview]);

    useEffect(() => {
        if (!capturedImage && !imagePreview) {
            startCamera();
        }
        return () => {
            stopCamera();
        };
    }, [startCamera, capturedImage, imagePreview, stopCamera]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        stopCamera();
        const file = e.target.files?.[0];
        if (file) {
            const base64 = await blobToBase64(file);
            setFormData({ ...formData, faceImageUrl: base64 });
            setImagePreview(URL.createObjectURL(file));
            setCapturedImage(null);
        }
    };

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.translate(video.videoWidth, 0);
                context.scale(-1, 1);
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setCapturedImage(dataUrl);
                stopCamera();
            }
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
    };

    const handleConfirmPhoto = () => {
        if (capturedImage) {
            setFormData({ ...formData, faceImageUrl: capturedImage });
            setImagePreview(capturedImage);
            setCapturedImage(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        if (!formData.faceImageUrl) {
            setError('Please provide a profile picture for face recognition.');
            return;
        }

        setIsProcessing(true);
        try {
            const img = await faceapi.fetchImage(formData.faceImageUrl);
            const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

            if (!detection) {
                setError('Could not detect a face in the provided image. Please use a clear, frontal photo.');
                setIsProcessing(false);
                return;
            }

            // FIX: Cast detection.descriptor to `number[]`. `Array.from` on an `any` type results in `unknown[]`, which is incompatible with the expected `number[]` for `faceDescriptor`.
            const descriptor = Array.from(detection.descriptor as number[]);
            const registered = onRegister({ ...formData, faceDescriptor: descriptor });

            if (registered) {
                setSuccess('Registration successful! You can now log in.');
                setTimeout(onSwitchToLogin, 2000);
            } else {
                setError('Username already exists. Please choose another one.');
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred during face processing. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const isSubmitDisabled = isProcessing || !areModelsLoaded;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">Create Teacher Account</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex flex-col items-center mb-4">
                        <div className="relative w-32 h-32 rounded-full border-4 border-gray-300 flex items-center justify-center bg-gray-100 overflow-hidden shadow-inner">
                            {imagePreview ? (
                                <img src={imagePreview} alt="Profile Preview" className="w-full h-full object-cover" />
                            ) : capturedImage ? (
                                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                            ) : isCameraLive ? (
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1] rounded-full" />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center p-2 text-gray-500">
                                    {cameraError ? <AlertCircle className="w-8 h-8 text-red-400" /> : <Camera className="w-12 h-12" />}
                                    {cameraError && <p className="text-xs text-red-500 mt-1">{cameraError}</p>}
                                </div>
                            )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />

                        <div className="flex justify-center items-center gap-4 mt-4 min-h-[40px]">
                            {imagePreview ? (
                                <button type="button" onClick={() => { setImagePreview(null); setFormData({...formData, faceImageUrl: ''}) }} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100">
                                    <RotateCw className="w-5 h-5" />
                                    <span>Change Photo</span>
                                </button>
                            ) : capturedImage ? (
                                <>
                                    <button type="button" onClick={handleRetake} className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">
                                        <RotateCw className="w-5 h-5" /> Retake
                                    </button>
                                    <button type="button" onClick={handleConfirmPhoto} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                                        <CheckCircle className="w-5 h-5" /> Confirm
                                    </button>
                                </>
                            ) : isCameraLive ? (
                                <button type="button" onClick={handleCapture} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                                    <Camera className="w-5 h-5" /> Capture
                                </button>
                            ) : (
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100">
                                    <ImageUp className="w-5 h-5" />
                                    <span>Upload a Photo</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

                    <input type="text" name="name" placeholder="Full Name" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />
                    <input type="email" name="email" placeholder="Email Address" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />
                    <input type="text" name="department" placeholder="Department" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />
                    <input type="text" name="username" placeholder="Username" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />
                    <input type="password" name="password" placeholder="Password" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />
                    <input type="password" name="confirmPassword" placeholder="Confirm Password" onChange={handleChange} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" required />

                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                    {success && <p className="text-sm text-green-600 text-center">{success}</p>}

                    <button type="submit" disabled={isSubmitDisabled} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isProcessing ? "Processing..." : !areModelsLoaded ? "Loading Models..." : "Register"}
                    </button>
                    <button type="button" onClick={onSwitchToLogin} className="w-full text-center text-sm text-gray-600 hover:text-blue-600 mt-2">
                        Already have an account? Sign In
                    </button>
                </form>
            </div>
        </div>
    );
};


const LoginScreen: React.FC<{ users: User[]; onLogin: (user: User) => void; onSwitchToRegister: () => void; }> = ({ users, onLogin, onSwitchToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = useCallback(() => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const user = users.find(u => u.username === trimmedUsername && u.password === trimmedPassword);
    if (user) {
      onLogin(user);
    } else {
      setError("Invalid credentials! Please try again.");
    }
  }, [username, password, onLogin, users]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-24 h-24 rounded-full mx-auto mb-4 shadow-lg overflow-hidden border-2 border-white bg-gray-200">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Sekolah_Menengah_Kebangsaan_Puchong_Utama_%281%29.png/960px-Sekolah_Menengah_Kebangsaan_Puchong_Utama_%281%29.png" alt="School Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">SMK PUCHONG UTAMA (1)</h1>
          <p className="text-gray-600 font-medium">Teacher Attendance System</p>
          <div className="mt-2 inline-block bg-blue-100 px-4 py-1 rounded-full">
            <p className="text-sm text-blue-700 font-semibold">Code: BEA8636</p>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyPress={handleKeyPress} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter your username" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
            <div className="relative">
                 <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your password"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button onClick={handleLogin} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
            Sign In
          </button>
        </div>
         <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <button onClick={onSwitchToRegister} className="font-semibold text-blue-600 hover:underline">
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const Sidebar: React.FC<{ user: User, activeTab: ActiveTab, setActiveTab: (tab: ActiveTab) => void, onLogout: () => void }> = ({ user, activeTab, setActiveTab, onLogout }) => {
    const navItems = [
        { id: 'home', label: 'Home', icon: Home, role: [Role.Admin, Role.Teacher] },
        { id: 'attendance', label: 'Attendance', icon: BarChart3, role: [Role.Admin, Role.Teacher] },
        { id: 'admin', label: 'Admin Panel', icon: Users, role: [Role.Admin] },
        { id: 'profile', label: 'Profile', icon: Settings, role: [Role.Admin, Role.Teacher] },
    ];

    return (
         <div className="p-6 flex flex-col h-full bg-white dark:bg-gray-900">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-8">Menu</h2>
            
            <div className="bg-blue-700 rounded-xl p-4 mb-8 text-white">
                <div className="flex items-center space-x-3">
                    <div className="bg-white p-1 rounded-full w-10 h-10">
                        <img src={user.faceImageUrl} alt={user.name} className="w-full h-full object-cover rounded-full" />
                    </div>
                    <div>
                        <p className="font-bold text-base">{user.name}</p>
                        <p className="text-xs text-blue-100">{user.role === Role.Admin ? 'Administrator' : 'Teacher'}</p>
                    </div>
                </div>
                <p className="text-xs text-blue-100 break-all mt-2">{user.email}</p>
            </div>

            <nav className="space-y-2 flex-grow">
                {navItems.filter(item => item.role.includes(user.role)).map(item => (
                     <button key={item.id} onClick={() => setActiveTab(item.id as ActiveTab)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-left ${activeTab === item.id ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium'}`}>
                        <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <button
                onClick={onLogout}
                className="w-full mt-4 flex items-center justify-center space-x-2 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold"
            >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
            </button>
        </div>
    );
};

const AttendanceScreen: React.FC<{ user: User, records: AttendanceRecord[] }> = ({ user, records }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const displayedRecords = (user.role === Role.Admin
        ? records.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : records.filter(r => r.userId === user.id)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center space-x-3">
                    <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                            {user.role === Role.Admin ? "Teacher Attendance Records" : "My Attendance History"}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {user.role === Role.Admin ? "View and search all records" : "A log of all your clock-ins and clock-outs"}
                        </p>
                    </div>
                </div>
                {user.role === Role.Admin && (
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by teacher name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full p-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-transparent text-gray-800 dark:text-gray-200"
                        />
                    </div>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Date</th>
                            {user.role === Role.Admin && <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Teacher</th>}
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Clock In</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Clock Out</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Status</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedRecords.map(record => (
                            <tr key={record.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-4 text-gray-800 dark:text-gray-200">{record.date}</td>
                                {user.role === Role.Admin && <td className="p-4 text-gray-800 dark:text-gray-200">{record.name}</td>}
                                <td className="p-4 text-gray-800 dark:text-gray-200">{record.clockIn || 'N/A'}</td>
                                <td className="p-4 text-gray-800 dark:text-gray-200">{record.clockOut || 'N/A'}</td>
                                <td className="p-4">
                                     <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                         record.status === 'On Time' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' :
                                         record.status === 'Late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' :
                                         'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                     }`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-600 dark:text-gray-400 text-sm">{record.remark || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
             <button className="mt-6 flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/50 dark:text-blue-300 dark:border-blue-400">
                <FileDown className="w-5 h-5" />
                <span>Export as CSV</span>
            </button>
        </div>
    );
};


const ProfileScreen: React.FC<{ user: User, onUpdateUser: (user: User) => void }> = ({ user, onUpdateUser }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(user);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdateUser(formData);
        setIsEditing(false);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                     <Settings className="w-8 h-8 text-blue-600 dark:text-blue-400"/>
                     <div>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">My Profile</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage your personal information</p>
                     </div>
                </div>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                >
                    {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex flex-col items-center">
                    <img src={user.faceImageUrl} alt={user.name} className="w-32 h-32 rounded-full object-cover mb-4 border-4 border-blue-200 dark:border-blue-800"/>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{user.name}</h2>
                    <p className="text-gray-600 dark:text-gray-400">{user.department}</p>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} disabled={!isEditing} className="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-70 text-gray-800 dark:text-gray-200"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!isEditing} className="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-70 text-gray-800 dark:text-gray-200"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                        <input type="text" name="department" value={formData.department} onChange={handleChange} disabled={!isEditing} className="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-70 text-gray-800 dark:text-gray-200"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                        <input type="text" name="username" value={formData.username} onChange={handleChange} disabled={!isEditing} className="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-70 text-gray-800 dark:text-gray-200"/>
                    </div>
                </div>
                 {isEditing && (
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={() => { setIsEditing(false); setFormData(user); }} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold">
                            Reset
                        </button>
                        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
                            Save Changes
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
};

const AdminPanel: React.FC<{ users: User[], onAddUser: (user: User) => void, onUpdateUser: (user: User) => void, onDeleteUser: (id: number) => void }> = ({ users, onAddUser, onUpdateUser, onDeleteUser }) => {
    // This is a placeholder for the full admin panel functionality
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
            <div className="flex items-center space-x-3 mb-6">
                <Users className="w-8 h-8 text-blue-600 dark:text-blue-400"/>
                <div>
                     <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Admin Panel</h3>
                     <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage teacher accounts and system settings</p>
                </div>
            </div>
           
            <div className="mb-6">
                <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
                    <PlusCircle className="w-5 h-5" />
                    <span>Add New Teacher</span>
                </button>
            </div>
            
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Name</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Email</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Department</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.filter(u => u.role === Role.Teacher).map(user => (
                            <tr key={user.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-4 text-gray-800 dark:text-gray-200">{user.name}</td>
                                <td className="p-4 text-gray-800 dark:text-gray-200">{user.email}</td>
                                <td className="p-4 text-gray-800 dark:text-gray-200">{user.department}</td>
                                <td className="p-4">
                                    <div className="flex space-x-2">
                                        <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                                        <button onClick={() => onDeleteUser(user.id)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const FaceScanModal: React.FC<{ user: User, onVerified: () => void, onClose: () => void, areModelsLoaded: boolean }> = ({ user, onVerified, onClose, areModelsLoaded }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectionInterval = useRef<number | null>(null);

    const [statusText, setStatusText] = useState("Initializing...");
    const [liveSnapshot, setLiveSnapshot] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [similarityScore, setSimilarityScore] = useState(0);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isVerified, setIsVerified] = useState(false);

    const stopDetection = useCallback(() => {
        if (detectionInterval.current) {
            clearInterval(detectionInterval.current);
            detectionInterval.current = null;
        }
    }, []);

    useEffect(() => {
        let stream: MediaStream;

        const startCameraAndDetection = async () => {
            if (!areModelsLoaded) {
                setStatusText("Loading models...");
                return;
            }
            if (!user.faceDescriptor) {
                setError("No face data registered for this user. Please re-register.");
                setStatusText("Error");
                return;
            }
            setStatusText("Initializing Camera...");
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    
                    detectionInterval.current = window.setInterval(async () => {
                        if (!videoRef.current || videoRef.current.paused) return;

                        setStatusText("Detecting face...");
                        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

                        if (detection) {
                            if (!isVerifying) setIsVerifying(true);
                            setStatusText("Verifying identity...");
                            const distance = faceapi.euclideanDistance(user.faceDescriptor!, detection.descriptor);
                            const score = Math.max(0, (1 - distance) * 100);
                            setSimilarityScore(score);

                            if (score > 65) { // Confidence threshold
                                setStatusText("Verified!");
                                setIsVerified(true);
                                stopDetection();
                                setTimeout(onVerified, 1000);
                            }
                        } else {
                            // Reset score if face is lost
                            setSimilarityScore(score => Math.max(0, score - 5));
                        }
                    }, 500);
                }
            } catch (err) {
                console.error("Camera access failed:", err);
                setError('Camera access denied. Please enable it in your browser settings.');
                setStatusText("Camera Error");
                stopDetection();
            }
        };

        startCameraAndDetection();

        return () => {
            stopDetection();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [areModelsLoaded, user.faceDescriptor, onVerified, stopDetection, isVerifying]);

    useEffect(() => {
        if (isVerifying && liveSnapshot === null) {
            if (videoRef.current && canvasRef.current) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext('2d');
                if (context) {
                    context.translate(video.videoWidth, 0);
                    context.scale(-1, 1);
                    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                    setLiveSnapshot(canvas.toDataURL('image/jpeg'));
                }
            }
        }
    }, [isVerifying, liveSnapshot]);


    const FaceOverlay = () => (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute w-4/5 h-4/5 rounded-3xl">
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl animate-pulse"></div>
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl animate-pulse"></div>
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl animate-pulse"></div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl animate-pulse"></div>
            </div>
        </div>
    );

    const getConfidence = (score: number) => {
        if (score < 40) return { level: 'Low', color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/50' };
        if (score < 65) return { level: 'Medium', color: 'text-yellow-500', bgColor: 'bg-yellow-100 dark:bg-yellow-900/50' };
        return { level: 'Match Found', color: 'text-green-500', bgColor: 'bg-green-100 dark:bg-green-900/50' };
    };

    const confidence = getConfidence(similarityScore);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Face Recognition</h2>

                <div className="relative w-64 h-64 mx-auto mb-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden border-4 border-gray-300 dark:border-gray-600">
                   {error ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4">
                           <AlertCircle className="w-12 h-12 text-red-500 mb-4"/>
                           <p className="text-red-500">{error}</p>
                        </div>
                   ) : (
                    <>
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"></video>
                        <FaceOverlay />
                    </>
                   )}
                </div>
                <canvas ref={canvasRef} className="hidden"></canvas>
                
                {isVerifying && (
                    <div className="w-full">
                        <div className="flex justify-center items-center space-x-4">
                            <div className="flex flex-col items-center">
                                <img src={liveSnapshot || ''} alt="Live" className={`w-20 h-20 object-cover rounded-full border-2 ${isVerified ? 'border-green-500' : 'border-blue-500'}`}/>
                                <span className="mt-2 text-sm font-semibold bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">Live</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <img src={user.faceImageUrl} alt="Profile" className="w-20 h-20 object-cover rounded-full border-2 border-gray-400"/>
                                <span className="mt-2 text-sm font-semibold bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">Profile</span>
                            </div>
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Similarity Score</p>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 my-2 overflow-hidden">
                                <div 
                                    className="h-3 rounded-full transition-all duration-150 ease-linear bg-gradient-to-r from-yellow-400 via-green-400 to-green-600"
                                    style={{ 
                                        width: `${similarityScore > 100 ? 100 : similarityScore}%`,
                                    }}
                                ></div>
                            </div>
                            <p className={`font-bold text-3xl ${confidence.color}`}>{similarityScore.toFixed(2)}%</p>
                            <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${confidence.bgColor} ${confidence.color}`}>
                                <ShieldCheck className="w-4 h-4" />
                                <span>{confidence.level}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-center space-x-2 mt-4 min-h-[2rem]">
                    {isVerified ? (
                        <CheckCircle className="w-6 h-6 text-green-500 animate-pulse" />
                    ) : (
                       !error && <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                    <p className={`text-lg font-semibold ${isVerified ? 'text-green-500' : 'text-gray-700 dark:text-gray-300'}`}>{statusText}</p>
                </div>
            </div>
        </div>
    );
};


const ClockInButton: React.FC<{ user: User, onClockIn: () => void, lastRecord?: AttendanceRecord, isWithinRange: boolean | null, areModelsLoaded: boolean }> = ({ user, onClockIn, lastRecord, isWithinRange, areModelsLoaded }) => {
    const today = new Date().toLocaleDateString('en-CA');
    const hasClockedInToday = lastRecord && lastRecord.date === today && lastRecord.clockIn;
    const hasClockedOutToday = lastRecord && lastRecord.date === today && lastRecord.clockOut;

    const [isFaceScanOpen, setIsFaceScanOpen] = useState(false);

    const handleClockInClick = () => {
        setIsFaceScanOpen(true);
    };
    
    const handleVerified = () => {
        setIsFaceScanOpen(false);
        onClockIn();
    }

    if (hasClockedInToday) {
        return (
            <div className="p-4 bg-green-100 dark:bg-green-900/50 rounded-lg text-center">
                <p className="font-semibold text-green-800 dark:text-green-300">Clocked In at {lastRecord?.clockIn}</p>
                {hasClockedOutToday && <p className="text-sm text-green-700 dark:text-green-400 mt-1">Clocked Out at {lastRecord?.clockOut}</p>}
            </div>
        );
    }

    const isButtonDisabled = isWithinRange === false || !areModelsLoaded || !user.faceDescriptor;
    let buttonText = "Clock In Now";
    if (!areModelsLoaded) buttonText = "Loading Models...";
    else if (!user.faceDescriptor) buttonText = "Face Data Missing";


    return (
        <>
        {isFaceScanOpen && <FaceScanModal user={user} onVerified={handleVerified} onClose={() => setIsFaceScanOpen(false)} areModelsLoaded={areModelsLoaded} />}
        <button
            onClick={handleClockInClick}
            disabled={isButtonDisabled}
            className="w-full flex items-center justify-center space-x-3 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
        >
            <ScanFace className="w-7 h-7" />
            <span>{buttonText}</span>
        </button>
        </>
    );
};

const AnnouncementCard: React.FC<{ announcement: Announcement }> = ({ announcement }) => (
    <div className={`p-4 rounded-lg border ${announcement.priority === Priority.High ? 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-500/30' : 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-500/30'}`}>
        <div className="flex items-center justify-between">
            <h4 className={`font-bold ${announcement.priority === Priority.High ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300'}`}>{announcement.title}</h4>
            <span className="text-xs text-gray-500 dark:text-gray-400">{announcement.date}</span>
        </div>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{announcement.content}</p>
    </div>
);

const TeacherDashboard: React.FC<{ user: User, announcements: Announcement[], records: AttendanceRecord[], onClockIn: () => void, isWithinRange: boolean | null, areModelsLoaded: boolean }> = ({ user, announcements, records, onClockIn, isWithinRange, areModelsLoaded }) => {
    const today = new Date();
    const lastRecordForUser = records
        .filter(r => r.userId === user.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const stats = [
        { label: 'On Time', value: records.filter(r => r.userId === user.id && r.status === 'On Time').length, icon: UserCheck, color: 'text-green-500' },
        { label: 'Late', value: records.filter(r => r.userId === user.id && r.status === 'Late').length, icon: UserX, color: 'text-yellow-500' },
        { label: 'Total Days', value: new Set(records.filter(r => r.userId === user.id).map(r => r.date)).size, icon: Calendar, color: 'text-blue-500' },
    ];
    
    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-gray-600 dark:text-gray-400">{today.toDateString()}</p>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{getGreeting(today)}, {user.name.split(' ')[1]}!</h3>
                    </div>
                     <div className="flex items-center gap-2 p-2 rounded-lg" title={isWithinRange === null ? "Checking location..." : isWithinRange ? "You are within school range" : "You are outside school range"}>
                        <MapPin className={`w-6 h-6 ${isWithinRange === null ? 'text-gray-400 animate-pulse' : isWithinRange ? 'text-green-500' : 'text-red-500'}`} />
                     </div>
                </div>
                <div className="mt-6 text-center">
                    <ClockInButton user={user} onClockIn={onClockIn} lastRecord={lastRecordForUser} isWithinRange={isWithinRange} areModelsLoaded={areModelsLoaded} />
                    {isWithinRange === false && (
                        <p className="mt-3 text-sm text-red-600 font-semibold flex items-center justify-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            You must be within the school premises to clock in.
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map(stat => (
                     <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 flex items-center space-x-4 border dark:border-gray-700">
                        <div className={`p-3 rounded-full bg-blue-100 dark:bg-blue-900/50`}>
                            <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stat.value}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
                <div className="flex items-center space-x-3 mb-4">
                     <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400"/>
                     <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Announcements</h3>
                </div>
                <div className="space-y-4">
                    {announcements.map(ann => <AnnouncementCard key={ann.id} announcement={ann} />)}
                </div>
            </div>
        </div>
    );
};

const AdminDashboard: React.FC<{ announcements: Announcement[], records: AttendanceRecord[], users: User[] }> = ({ announcements, records, users }) => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const teachers = users.filter(u => u.role === Role.Teacher);
    const presentToday = records.filter(r => r.date === todayStr && r.clockIn).length;
    
    const stats = [
        { label: 'Total Teachers', value: teachers.length, icon: Users, color: 'text-blue-500' },
        { label: 'Present Today', value: presentToday, icon: UserCheck, color: 'text-green-500' },
        { label: 'Absent Today', value: teachers.length - presentToday, icon: UserX, color: 'text-red-500' },
    ];

    return (
         <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
                 <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Admin Dashboard</h3>
                 <p className="text-gray-600 dark:text-gray-400">Overview of the system's status.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map(stat => (
                     <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 flex items-center space-x-4 border dark:border-gray-700">
                        <div className={`p-3 rounded-full bg-blue-100 dark:bg-blue-900/50`}>
                            <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stat.value}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border dark:border-gray-700">
                <div className="flex items-center space-x-3 mb-4">
                     <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400"/>
                     <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Announcements</h3>
                </div>
                <div className="space-y-4">
                    {announcements.map(ann => <AnnouncementCard key={ann.id} announcement={ann} />)}
                </div>
            </div>
        </div>
    )
}

const MainApp: React.FC<{ user: User, onLogout: () => void, allUsers: User[], allRecords: AttendanceRecord[], onUpdateUser: (user: User) => void, onAddUser: (user: User) => void, onDeleteUser: (id: number) => void, onClockIn: () => void, isWithinRange: boolean | null, allAnnouncements: Announcement[], areModelsLoaded: boolean }> = ({ user, onLogout, allUsers, allRecords, onUpdateUser, onAddUser, onDeleteUser, onClockIn, isWithinRange, allAnnouncements, areModelsLoaded }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return user.role === Role.Admin 
            ? <AdminDashboard announcements={allAnnouncements} records={allRecords} users={allUsers} />
            : <TeacherDashboard user={user} announcements={allAnnouncements} records={allRecords} onClockIn={onClockIn} isWithinRange={isWithinRange} areModelsLoaded={areModelsLoaded} />;
      case 'attendance':
        return <AttendanceScreen user={user} records={allRecords} />;
      case 'admin':
        return user.role === Role.Admin ? <AdminPanel users={allUsers} onAddUser={onAddUser} onUpdateUser={onUpdateUser} onDeleteUser={onDeleteUser} /> : null;
      case 'profile':
        return <ProfileScreen user={user} onUpdateUser={onUpdateUser} />;
      default:
        return <div>Welcome!</div>;
    }
  };

  return (
    <div className={`min-h-screen flex bg-gray-100 dark:bg-gray-900 transition-colors`}>
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-gray-800 shadow-lg transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform lg:relative lg:translate-x-0 lg:shadow-none`}>
          <Sidebar user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />
      </div>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 relative">
        <div className="absolute top-4 right-4 z-50 flex items-center gap-4">
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full bg-white dark:bg-gray-800 shadow">
                {isDarkMode ? <Sun className="text-yellow-400" /> : <Moon className="text-gray-700" />}
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 rounded-full bg-white dark:bg-gray-800 shadow">
              {isSidebarOpen ? <X /> : <Menu />}
            </button>
        </div>
        
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
      
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 lg:hidden"></div>}
    </div>
  );
};

// #endregion

// #region Main App Component
const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(USERS);
  const [records, setRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE_RECORDS);
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [isWithinRange, setIsWithinRange] = useState<boolean | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [areModelsLoaded, setAreModelsLoaded] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/';
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
            setAreModelsLoaded(true);
            console.log("Face models loaded successfully");
        } catch (e) {
            console.error("Error loading face models", e);
        }
    };
    loadModels();
  }, []);

  useEffect(() => {
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
        const distance = getDistance(latitude, longitude, SCHOOL_COORDINATES.latitude, SCHOOL_COORDINATES.longitude);
        setIsWithinRange(distance <= MAX_DISTANCE_METERS);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsWithinRange(false); // Default to false if location is unavailable
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoginView(true);
  };
  
  const handleRegister = (newUser: Omit<User, 'id' | 'role'>) => {
    if (users.some(u => u.username === newUser.username)) {
        return false; // Username exists
    }
    const userWithId: User = {
        ...newUser,
        id: users.length + 1,
        role: Role.Teacher,
    };
    setUsers([...users, userWithId]);
    return true;
  }

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser?.id === updatedUser.id) {
        setCurrentUser(updatedUser);
    }
  };

  const handleAddUser = (newUser: User) => {
    setUsers([...users, { ...newUser, id: users.length + 1 }]);
  };

  const handleDeleteUser = (id: number) => {
    setUsers(users.filter(u => u.id !== id));
  };
  
  const handleClockIn = () => {
    if (!currentUser) return;
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');

    const lastRecord = records
        .filter(r => r.userId === currentUser.id)
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    // Check if user has already clocked in today
    if(lastRecord && lastRecord.date === todayStr && lastRecord.clockIn) {
        // Clock out logic
        if(!lastRecord.clockOut) {
            const updatedRecords = records.map(r => r.id === lastRecord.id ? {...r, clockOut: now.toLocaleTimeString()} : r);
            setRecords(updatedRecords);
             alert('Clocked out successfully!');
        }
        return;
    }
    
    // Clock in logic
    const clockInTime = now.toLocaleTimeString();
    const isLate = now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() > 20);
    
    const newRecord: AttendanceRecord = {
        id: records.length + 1,
        userId: currentUser.id,
        name: currentUser.name,
        date: todayStr,
        clockIn: clockInTime,
        clockOut: null,
        status: isLate ? 'Late' : 'On Time'
    };
    setRecords([...records, newRecord]);
    alert(`Clocked in at ${clockInTime}`);
  };

  if (!currentUser) {
    return isLoginView
        ? <LoginScreen users={users} onLogin={handleLogin} onSwitchToRegister={() => setIsLoginView(false)} />
        : <RegistrationScreen onRegister={handleRegister} onSwitchToLogin={() => setIsLoginView(true)} areModelsLoaded={areModelsLoaded} />;
  }

  return <MainApp 
            user={currentUser} 
            onLogout={handleLogout} 
            allUsers={users}
            allRecords={records}
            onUpdateUser={handleUpdateUser}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
            onClockIn={handleClockIn}
            isWithinRange={isWithinRange}
            allAnnouncements={announcements}
            areModelsLoaded={areModelsLoaded}
        />;
};

export default App;
// #endregion
