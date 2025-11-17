// FIX: Imported AttendanceRecord to be used for typing INITIAL_ATTENDANCE_RECORDS.
import { User, Announcement, Role, Priority, AttendanceRecord } from './types';

export const USERS: User[] = [
  { id: 1, username: "admin", password: "admin123", role: Role.Admin, name: "Admin User", email: "admin@smkpu.edu.my", department: "Administration", faceImageUrl: "https://i.pravatar.cc/150?u=admin" },
  { id: 2, username: "teacher1", password: "pass123", role: Role.Teacher, name: "Cikgu Ahmad bin Ali", email: "ahmad@smkpu.edu.my", department: "Mathematics", faceImageUrl: "https://i.pravatar.cc/150?u=teacher1" },
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  { id: 1, title: "Staff Meeting", content: "Monthly staff meeting on Friday at 2 PM in the main hall. All staff are required to attend.", date: "2024-07-15", priority: Priority.High },
  { id: 2, title: "Welcome!", content: "Welcome to the new smart attendance system. Please remember to clock in daily to track your attendance.", date: "2024-07-12", priority: Priority.Normal }
];

// Initial attendance data for demonstration
// FIX: Explicitly typed INITIAL_ATTENDANCE_RECORDS as AttendanceRecord[] to ensure type compatibility.
export const INITIAL_ATTENDANCE_RECORDS: AttendanceRecord[] = [
    { id: 1, userId: 2, name: "Cikgu Ahmad bin Ali", date: new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('en-CA'), clockIn: "07:15:30 AM", clockOut: "04:30:10 PM", status: "On Time", remark: "" },
    { id: 2, userId: 3, name: "Cikgu Siti binti Hassan", date: new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleDateString('en-CA'), clockIn: "07:45:12 AM", clockOut: "04:40:00 PM", status: "Late", remark: "Heavy Traffic" },
    { id: 3, userId: 2, name: "Cikgu Ahmad bin Ali", date: new Date(new Date().setDate(new Date().getDate() - 2)).toLocaleDateString('en-CA'), clockIn: "07:20:00 AM", clockOut: "04:25:00 PM", status: "On Time", remark: "" },
    { id: 4, userId: 3, name: "Cikgu Siti binti Hassan", date: new Date(new Date().setDate(new Date().getDate() - 2)).toLocaleDateString('en-CA'), clockIn: "07:25:00 AM", clockOut: "04:35:00 PM", status: "On Time", remark: "" },
];