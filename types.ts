export enum Role {
  Admin = 'admin',
  Teacher = 'teacher',
}

export interface User {
  id: number;
  username: string;
  password?: string; // Should not be stored in client-side state in a real app
  role: Role;
  name: string;
  email: string;
  department: string;
  faceImageUrl: string;
  faceDescriptor?: number[];
}

export interface AttendanceRecord {
  id: number;
  userId: number;
  name: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'On Time' | 'Late' | 'Absent';
  remark?: string;
}

export enum Priority {
    High = 'high',
    Normal = 'normal'
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  date: string;
  priority: Priority;
}

export type ActiveTab = 'home' | 'attendance' | 'admin' | 'profile';